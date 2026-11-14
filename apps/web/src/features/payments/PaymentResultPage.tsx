import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui'
import { getCurrentIdentity } from '../auth/auth-storage'
import { fineDate } from '../fines/fine-format'
import { paymentsApi, type Payment } from './payments-api'
import { handoffToProvider } from './payment-navigation'
import { PaymentStateIcon, PaymentTrustNote } from './PaymentPresentation'
import { PaymentStatusPanel, PaymentSummary } from './PaymentAction'
import { RefundTimeline } from './RefundReview'
import { notifyPaymentUpdate } from './payment-updates'

function heading(payment: Payment) {
  if (payment.refundStatus) return payment.refundStatus === 'Refunded' ? 'Payment refunded' : 'Payment partially refunded'
  if (payment.state === 'Succeeded') return 'Payment complete'
  return ({ Expired: 'Checkout expired', Cancelled: 'Payment cancelled', Review: 'Payment needs review' } as Record<string, string>)[payment.state] ?? 'Payment in progress'
}

export function PaymentResultPage() {
  const [params] = useSearchParams(), id = params.get('payment') ?? '', startCheckout = params.get('checkout') === '1'
  const [payment, setPayment] = useState<Payment | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const automaticChecks = useRef(0), request = useRef(0), handoffStarted = useRef(false)
  const announced = useRef('')
  useEffect(() => {
    if (!payment || payment.state !== 'Succeeded') return
    const signature = JSON.stringify([payment.paymentId,payment.state,payment.refundStatus,payment.refundedCentavos])
    if (announced.current === signature) return
    announced.current = signature
    notifyPaymentUpdate()
  }, [payment])
  const prefix = getCurrentIdentity()?.role === 'Faculty' ? '/faculty' : '/student'
  const load = useCallback(async () => {
    const current = ++request.current
    setLoading(true); setError('')
    if (!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) { setPayment(null); setError('Choose a payment from your printing or fines page.'); setLoading(false); return }
    try {
      let saved: Payment
      try { saved = await paymentsApi.check(id) } catch { saved = await paymentsApi.read(id) }
      if (request.current === current) setPayment(saved)
    } catch (error) { if (request.current === current) { setPayment(null); setError(error instanceof Error ? error.message : 'This payment could not be loaded.') } }
    finally { if (request.current === current) setLoading(false) }
  }, [id])
  useEffect(() => { automaticChecks.current = 0; handoffStarted.current = false; setPayment(null); void load(); return () => { request.current++ } }, [load])
  useEffect(() => {
    if (!startCheckout || loading || !payment?.checkoutUrl || payment.state !== 'Active' || payment.cancellationPending || handoffStarted.current) return
    handoffStarted.current = true
    try { handoffToProvider(payment) } catch { setError('This checkout address could not be verified. Contact the library.') }
  }, [startCheckout, loading, payment])
  useEffect(() => {
    if (loading || !payment || !['Active', 'Prepared', 'Creating'].includes(payment.state) || automaticChecks.current >= 4) return
    const timer = setTimeout(() => { automaticChecks.current++; void load() }, 15000)
    return () => clearTimeout(timer)
  }, [id, loading, payment?.state, load])
  useEffect(() => {
    const returned = () => { if (!document.hidden) void load() }
    const restored = (event: PageTransitionEvent) => { if (event.persisted) returned() }
    window.addEventListener('focus', returned); window.addEventListener('pageshow', restored)
    return () => { window.removeEventListener('focus', returned); window.removeEventListener('pageshow', restored) }
  }, [load])
  const back = prefix + (payment?.kind === 'Printing' ? '/printing' : '/fines')
  return <main className="payment-ui payment-result"><div className="payment-result-inner">
    <Link className="payment-back-link" to={prefix + '/transactions'}><ArrowLeft size={17} aria-hidden="true"/>Back to Transactions</Link>
    <section className="payment-surface payment-result-card" aria-busy={loading}>
      <header className="payment-result-hero"><PaymentStateIcon state={payment?.state ?? 'Active'} large/><h1>{payment ? heading(payment) : error ? 'Payment unavailable' : 'Checking your payment'}</h1><p>{payment?.localPreview ? (payment.kind === 'Printing' ? 'Printing bill' : payment.kind === 'LostBook' ? 'Replacement charge' : 'Library fine') : payment?.description ?? 'STI College Ormoc · Library payments'}</p></header>
      {loading ? <p role="status" className="payment-muted mb-4 text-center text-sm">Checking your saved payment…</p> : null}
      {error ? <p role="alert" className="payment-error mb-4">{error}</p> : null}
      {payment ? <>
        <PaymentSummary payment={payment}/>
        <dl className="payment-result-details"><div><dt>Service</dt><dd>{payment.kind === 'Printing' ? 'Printing' : payment.kind === 'LostBook' ? 'Replacement charge' : 'Library fine'}</dd></div><div><dt>Payment method</dt><dd>{payment.channelCode === 'GCASH' ? 'GCash' : payment.channelCode === 'QRPH' ? 'QRPh' : payment.channelCode}</dd></div><div><dt>Started</dt><dd>{payment.createdAt ? fineDate(payment.createdAt) : 'Date unavailable'}</dd></div><div><dt>Payment type</dt><dd>{'Online payment'}</dd></div><div className="payment-reference"><dt>Reference</dt><dd className="font-mono text-xs">{payment.paymentId}</dd></div></dl>
        <PaymentStatusPanel payment={payment} onChange={setPayment} showDetails={false}/>
        <RefundTimeline rows={payment.refunds}/>
        <p className="payment-muted my-4 text-center text-xs leading-6">Returning from checkout does not confirm payment. Only a verified payment updates this status.</p>
      </> : null}
      <div className="mt-5 flex flex-wrap gap-2"><Link className="payment-link flex-1" to={back}>Back to {payment?.kind === 'Printing' ? 'printing' : 'library fines'}<ArrowRight size={15} aria-hidden="true"/></Link><Button className="payment-button" variant="secondary" disabled={loading} onClick={() => void load()}><RefreshCw size={16} aria-hidden="true"/>Refresh status</Button></div>
    </section>
    <div className="mt-5"><PaymentTrustNote/></div>
  </div></main>
}
