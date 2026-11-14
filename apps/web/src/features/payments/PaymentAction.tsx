import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, ChevronDown, CreditCard, QrCode, RefreshCw, Wallet, X } from 'lucide-react'
import { Button } from '../../components/ui'
import { PaymentStateIcon, PaymentTrustNote } from './PaymentPresentation'
import { openPaymentReviewResult, openWalletPayment, paymentResultPath } from './payment-navigation'
import { downloadPaymentRecord, paymentMoney, paymentsApi, paymentStatus, type Payment, type PaymentKind, type PaymentOptions } from './payments-api'

const message = (error: unknown) => error instanceof Error ? error.message : 'Payment information could not load. Please try again.'

export function PaymentSummary({ payment }: { payment: Payment }) {
  return <dl className="payment-ui payment-summary">
    <div className="payment-total"><dt>{payment.state === 'Succeeded' ? 'Total paid' : 'Total to pay'}</dt><dd>{paymentMoney(payment.totalCentavos)}</dd></div>
    <div className="payment-summary-row"><dt>{payment.kind === 'Printing' ? 'Printing bill' : 'Payment amount'}</dt><dd>{paymentMoney(payment.principalCentavos)}</dd></div>
    <div className="payment-summary-row"><dt>Transaction fee</dt><dd>{paymentMoney(payment.feeCentavos)}</dd></div>
    {payment.kind === 'Fine' && (!payment.localPreview || payment.state === 'Quoted') ? <div className="payment-summary-row payment-balance"><dt>Balance after payment</dt><dd>{paymentMoney(payment.localPreview ? Math.max(0, payment.remainingCentavos - payment.principalCentavos) : payment.remainingCentavos)}</dd></div> : null}
  </dl>
}

export function PaymentStatusPanel({ payment, onChange, onUpdated, showDetails = true }: { payment: Payment; onChange: (value: Payment) => void; onUpdated?: () => void; showDetails?: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const running = useRef(false)
  async function action(run: () => Promise<Payment | void>) {
    if (running.current) return
    running.current = true; setBusy(true); setError('')
    try { const result = await run(); if (result) { onChange(result); if (result.state === 'Succeeded') onUpdated?.() } }
    catch (error) { setError(message(error)) }
    finally { running.current = false; setBusy(false) }
  }
  const closed = ['Succeeded', 'Expired', 'Cancelled'].includes(payment.state)
  return <div className="payment-ui payment-status" aria-live="polite">
    <div className="payment-status-heading"><PaymentStateIcon state={payment.state}/><p>{paymentStatus(payment)}</p></div>
    {payment.state === 'Review' ? <p className="payment-status-copy">{'The library needs to check this payment. Please do not pay again until it is resolved.'}</p> : null}
    {payment.cancellationPending ? <p className="payment-status-copy">Your payment stays reserved until Xendit confirms cancellation. Wait before paying cash.</p> : null}
    {payment.state === 'Creating' ? <p className="payment-status-copy">Waiting for the payment provider. Please do not start another payment.</p> : null}
    {error ? <p role="alert" className="payment-error mt-3">{error}</p> : null}
    <div className="payment-status-actions">
      {!closed ? <Button className="payment-button" variant="secondary" disabled={busy} onClick={() => void action(() => paymentsApi.check(payment.paymentId))}><RefreshCw size={16} aria-hidden="true"/>{busy ? 'Checking…' : 'Check status'}</Button> : null}
      {!payment.cancellationPending && ['Active', 'Prepared'].includes(payment.state) ? <Button className="payment-button" disabled={busy} onClick={() => void action(async () => { const result = await paymentsApi.resume(payment.paymentId); openPaymentReviewResult(result); return result })}>Continue payment<ArrowRight size={16} aria-hidden="true"/></Button> : null}
      {!closed && !payment.refundReview ? <Button className="payment-button" variant="ghost" disabled={busy} onClick={() => void action(() => paymentsApi.cancel(payment.paymentId))}>Cancel online payment</Button> : null}
      {payment.state === 'Succeeded' && payment.receiptId ? <Button className="payment-button" disabled={busy} onClick={() => void action(() => downloadPaymentRecord(payment))}>Download payment record</Button> : null}
      {showDetails ? <a className="payment-link" href={paymentResultPath(payment)}>View details<ArrowRight size={15} aria-hidden="true"/></a> : null}
    </div>
  </div>
}

function PaymentReview({ kind, targetId, title, options, onClose, onPayment }: { kind: PaymentKind; targetId: number; title: string; options: PaymentOptions; onClose: () => void; onPayment: (payment: Payment) => void }) {
  const dialog = useRef<HTMLDialogElement>(null), [channel, setChannel] = useState(options.methods[0]?.channelCode ?? '')
  const [part, setPart] = useState(false), [amount, setAmount] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [quoteState, setQuoteState] = useState<{ key: string; payment: Payment } | null>(null), [retry, setRetry] = useState(0)
  const retryKey = useRef<{ id: string; key: string } | null>(null), submitting = useRef(false), labelId = useId()
  const validAmount = !part || (/^\d+(\.\d{1,2})?$/.test(amount) && Number(amount) > 0 && Math.round(Number(amount) * 100) <= options.balanceCentavos)
  const key = JSON.stringify({ kind, targetId, channel, ...(part ? { amount } : {}) })
  const quote = quoteState?.key === key ? quoteState.payment : null
  const selected = options.methods.find(method => method.channelCode === channel)
  function close() { if (submitting.current) return; dialog.current?.close?.(); onClose() }
  useEffect(() => { const element = dialog.current; if (element?.showModal) element.showModal(); else element?.setAttribute('open', ''); return () => { element?.close?.() } }, [])
  useEffect(() => {
    if (!channel || !validAmount) return
    let active = true
    const timer = setTimeout(() => { setError(''); void paymentsApi.quote({ kind, targetId, channelCode: channel, ...(part ? { amount } : {}) })
      .then(payment => { if (active) setQuoteState({ key, payment }) }).catch(error => { if (active) { setQuoteState(null); setError(message(error)) } }) }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [key, retry, validAmount])
  async function checkout() {
    if (!quote || submitting.current) return
    submitting.current = true; setBusy(true); setError('')
    if (retryKey.current?.id !== quote.paymentId) retryKey.current = { id: quote.paymentId, key: crypto.randomUUID() }
    try { const payment = await paymentsApi.checkout(quote.paymentId, retryKey.current.key); onPayment(payment); openPaymentReviewResult(payment) }
    catch (error) { setError(message(error)) }
    finally { submitting.current = false; setBusy(false) }
  }
  return <dialog ref={dialog} aria-labelledby={labelId} onCancel={event => { event.preventDefault(); close() }} className="payment-ui payment-dialog">
    <div className="payment-dialog-shell">
      <header className="payment-dialog-header"><span className="payment-service-icon"><Wallet size={22} aria-hidden="true"/></span><div className="min-w-0"><h2 id={labelId}>Review payment</h2><p>{title}</p></div><button type="button" disabled={busy} aria-label="Close payment review" className="payment-close" onClick={close}><X size={20}/></button></header>
      <div className="payment-dialog-content">
        <div className="payment-review-grid">
          <div className="payment-review-fields">
            {kind === 'Fine' ? <fieldset><legend className="payment-field-title">How much would you like to pay?</legend><div className="payment-amount-options">
              <label className="payment-amount-option"><input type="radio" name={labelId + '-amount'} checked={!part} onChange={() => setPart(false)} disabled={busy}/><span className="flex flex-1 flex-wrap justify-between gap-2"><span>Pay full balance</span><strong className="tabular-nums">{paymentMoney(options.balanceCentavos)}</strong></span></label>
              <label className="payment-amount-option"><input type="radio" name={labelId + '-amount'} checked={part} onChange={() => setPart(true)} disabled={busy}/>Pay part of the balance</label>
            </div>{part ? <label className="mt-4 block text-sm font-semibold">Amount to pay<input aria-label="Amount to pay" className="payment-field mt-2" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} disabled={busy}/><span className="payment-field-note">Up to {paymentMoney(options.balanceCentavos)}. Fees are added separately.</span>{amount && !validAmount ? <span role="alert" className="payment-error mt-2 block">Enter an amount within your balance, with up to two decimal places.</span> : null}</label> : null}</fieldset> : <div><p className="payment-field-title">{kind === 'Printing' ? 'Printing bill' : 'Replacement charge'}</p><p className="payment-muted text-sm">Pay the full bill amount. Your total includes the transaction fee shown.</p></div>}
            <div><label className="payment-field-title" htmlFor={labelId + '-method'}>Payment method</label><select id={labelId + '-method'} className="payment-field" value={channel} onChange={event => setChannel(event.target.value)} disabled={busy}>{options.methods.map(method => <option key={method.channelCode} value={method.channelCode}>{method.channelCode === 'QRPH' ? 'Scan QR · QRPh' : method.channelCode === 'GCASH' ? 'GCash' : method.displayName.replace(/\s*[·-]\s*Test$/i, '')}</option>)}</select>
              {channel === 'QRPH' ? <div className="payment-qr-help mt-3"><p><QrCode size={18} aria-hidden="true"/>Scan the payment QR in secure checkout</p><details className="payment-optional"><summary>Using the same phone?<ChevronDown size={14}/></summary><p>Choose a wallet method that opens its app, or import the payment QR image if your wallet supports it. Each payment has its own QR.</p></details></div> : <p className="payment-field-note">Continue to Xendit to complete your selected payment.</p>}
            </div>
            <details className="payment-optional"><summary>Prefer to pay onsite?<ChevronDown size={14}/></summary><p>Bring your school ID and pay at the library. No online transaction fee applies. Staff record the payment in Transactions.</p></details>
          </div>
          <div className="min-w-0">
            {quote ? <PaymentSummary payment={quote}/> : <div role="status" className="payment-summary payment-muted">{validAmount ? 'Calculating your payment…' : 'Enter an amount to see your total.'}</div>}
            {selected ? <details className="payment-optional mt-2"><summary>Payment limits<ChevronDown size={14}/></summary><p>Total including fees: {paymentMoney(selected.minTotalCentavos)} to {paymentMoney(selected.maxTotalCentavos)}.</p></details> : null}
            {error ? <div role="alert" className="payment-error mt-3"><p>{error}</p><button type="button" disabled={busy} className="mt-2 min-h-11 font-semibold underline" onClick={() => setRetry(value => value + 1)}>Try again</button></div> : null}
          </div>
        </div>
      </div>
      <footer className="payment-dialog-footer"><PaymentTrustNote/><Button className="payment-button" disabled={!quote || busy || !validAmount} onClick={() => channel === 'GCASH' && options.demoWalletEnabled ? quote && openWalletPayment(quote) : void checkout()}>{channel === 'QRPH' ? <QrCode size={18} aria-hidden="true"/> : <CreditCard size={18} aria-hidden="true"/>}{busy ? 'Opening secure checkout…' : channel === 'QRPH' ? 'Continue to QR payment' : options.demoWalletEnabled ? 'Continue with GCash' : 'Continue to Xendit'}<ArrowRight size={17} aria-hidden="true"/></Button></footer>
    </div>
  </dialog>
}

export function PaymentAction({ kind, targetId, title, onUpdated, allowNew = true, refreshKey = 0 }: { kind: PaymentKind; targetId: number; title: string; onUpdated?: () => void; allowNew?: boolean; refreshKey?: number }) {
  const [options, setOptions] = useState<PaymentOptions | null>(null), [error, setError] = useState(''), [open, setOpen] = useState(false)
  const [payment, setPayment] = useState<Payment | null>(null)
  const load = useCallback(async () => { try { const next = await paymentsApi.options(kind, targetId); setOptions(next); setPayment(next.active); setError('') } catch (error) { setError(message(error)) } }, [kind, targetId])
  useEffect(() => { let mounted = true; void paymentsApi.options(kind, targetId).then(next => { if (mounted) { setOptions(next); setPayment(next.active); setError('') } }).catch(error => { if (mounted) setError(message(error)) }); return () => { mounted = false } }, [kind, targetId, refreshKey])
  const closed = payment && ['Succeeded', 'Expired', 'Cancelled'].includes(payment.state)
  const canStart = allowNew && options?.paymentAllowed !== false && options?.balanceCentavos !== 0 && !(payment?.state === 'Succeeded' && payment.remainingCentavos === 0)
  function changed(next: Payment) { setPayment(next); if (['Succeeded', 'Expired', 'Cancelled'].includes(next.state)) { setOptions(null); void paymentsApi.options(kind, targetId).then(setOptions).catch(error => setError(message(error))) } }
  return <div className="payment-ui mt-3 min-w-0 space-y-3">
    {payment ? <PaymentStatusPanel payment={payment} onChange={changed} onUpdated={onUpdated}/> : null}
    {canStart && (!payment || closed) ? <div className="flex flex-wrap gap-2"><Button className="payment-button" disabled={!options} onClick={() => setOpen(true)}><CreditCard size={17} aria-hidden="true"/>Pay</Button>{closed ? <Button variant="ghost" className="payment-button" onClick={() => void load()}>Review remaining balance</Button> : null}</div> : null}
    {error ? <div className="text-sm"><p role="alert" className="payment-error">{error}</p><button type="button" className="min-h-11 font-semibold underline" onClick={() => void load()}>Retry payment options</button></div> : null}
    {open && options?.enabled && options.paymentAllowed && options.methods.length ? <PaymentReview kind={kind} targetId={targetId} title={title} options={options} onClose={() => setOpen(false)} onPayment={payment => { setPayment(payment); setOpen(false) }}/> : null}
    {open && options && (!options.enabled || !options.paymentAllowed || !options.methods.length) ? <OnsitePaymentInfo onClose={() => setOpen(false)}/> : null}
  </div>
}

function OnsitePaymentInfo({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { const element = dialog.current; if (element?.showModal) element.showModal(); else element?.setAttribute('open', ''); return () => element?.close?.() }, [])
  return <dialog ref={dialog} aria-label="Payment options" onCancel={onClose} className="payment-ui payment-dialog max-w-md"><div className="p-6"><span className="payment-service-icon mb-4"><Wallet size={22} aria-hidden="true"/></span><h2 className="text-xl font-bold">Pay at the library</h2><p className="payment-muted mt-3 text-sm leading-7">Online checkout is not available for this charge. Bring your school ID and ask library staff to review the bill.</p><p className="payment-muted mt-3 text-sm leading-7">No online transaction fee. After staff confirm your payment, the record appears in Transactions.</p><Button className="payment-button mt-5 w-full" onClick={onClose}>Close</Button></div></dialog>
}
