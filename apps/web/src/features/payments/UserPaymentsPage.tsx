import { useCallback, useEffect, useState } from 'react'
import { usePaymentUpdates } from './payment-updates'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, CreditCard, Download, FileText, MapPin, Printer, ReceiptText, RefreshCw, Search } from 'lucide-react'
import { Button, cn } from '../../components/ui'
import { getCurrentIdentity } from '../auth/auth-storage'
import { finesApi } from '../fines/fines-api'
import { fineDate } from '../fines/fine-format'
import { printingApi } from '../printing/printing-api'
import { PaymentEmptyIcon } from './PaymentPresentation'
import { paymentResultPath } from './payment-navigation'
import { RefundTimeline } from './RefundReview'
import { downloadPaymentRecord, paymentMoney, paymentsApi, paymentStatus, type Transaction } from './payments-api'

export function UserPaymentsPage() {
  const [params] = useSearchParams(), [search, setSearch] = useState(params.get('search') ?? ''), [channel, setChannel] = useState('all')
  const [page, setPage] = useState(1), [version, setVersion] = useState(0), [data, setData] = useState<Awaited<ReturnType<typeof paymentsApi.transactions>> | null>(null)
  const [error, setError] = useState(''), [downloadError, setDownloadError] = useState<{ id: string; message: string } | null>(null), [downloading, setDownloading] = useState<string | null>(null)
  const prefix = getCurrentIdentity()?.role === 'Faculty' ? '/faculty' : '/student'
  const refresh = useCallback(() => setVersion(value => value + 1), [])
  usePaymentUpdates(refresh)
  useEffect(() => {
    let active = true; setError('')
    const timer = setTimeout(() => { void paymentsApi.sync().catch(()=>undefined).then(()=>paymentsApi.transactions({ channel, search, page })).then(value => { if (active) setData(value) }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Transactions could not load. Try again.') }) }, search ? 250 : 0)
    return () => { active = false; clearTimeout(timer) }
  }, [channel, search, page, version])
  async function download(row: Transaction) {
    if (downloading || !row.receiptId) return; setDownloading(row.id); setDownloadError(null)
    try {
      if (row.payment) await downloadPaymentRecord(row.payment)
      else if (row.kind === 'Printing') await printingApi.downloadReceipt({ print_receipt_id: row.receiptId, receipt_number: row.reference })
      else await finesApi.downloadReceipt(row.receiptId, row.reference)
    } catch (cause) { setDownloadError({ id: row.id, message: cause instanceof Error ? cause.message : 'The payment record could not download.' }) }
    finally { setDownloading(null) }
  }
  const pages = Math.max(1, Math.ceil((data?.pagination.total ?? 0) / (data?.pagination.limit ?? 12)))
  return <div className="payment-ui payment-page">
    <header className="payment-page-header"><div><h1>Transactions</h1><p>All your library payment activity, in one place.</p></div><Button variant="secondary" className="payment-button" onClick={refresh}><RefreshCw size={17} aria-hidden="true"/>Refresh transactions</Button></header>
    <div className="mb-6 flex flex-wrap items-center gap-2"><span className="payment-muted mr-2 text-sm">Need to pay a bill?</span><Link className="payment-link" to={prefix + '/printing'}><Printer size={16} aria-hidden="true"/>Printing service<ArrowRight size={14} aria-hidden="true"/></Link><Link className="payment-link" to={prefix + '/fines'}><ReceiptText size={16} aria-hidden="true"/>Fines<ArrowRight size={14} aria-hidden="true"/></Link></div>
    <section className="payment-surface overflow-hidden" aria-label="Payment activity">
      <div className="payment-toolbar"><div role="group" aria-label="Transaction filters" className="payment-filters">{[['all', 'All transactions'], ['Online', 'Online'], ['Onsite', 'Onsite']].map(([value, label]) => <button key={value} type="button" aria-pressed={channel === value} onClick={() => { setChannel(value); setPage(1) }}>{label}</button>)}</div><label className="payment-search"><Search size={18} aria-hidden="true"/><span className="sr-only">Search transactions</span><input placeholder="Search reference or service" value={search} maxLength={120} onChange={event => { setSearch(event.target.value); setPage(1) }}/></label></div>
      {error ? <div className="p-5"><p role="alert" className="payment-error">{error}</p><Button variant="secondary" className="payment-button mt-3" onClick={refresh}>Try again</Button></div> : !data ? <div role="status"><span className="sr-only">Loading transactions…</span>{[1, 2, 3].map(row => <div className="payment-skeleton" key={row} aria-hidden="true"><div/><div/></div>)}</div> : <>
        <p className="payment-muted px-5 py-3 text-xs">{data.pagination.total} matching transaction{data.pagination.total === 1 ? '' : 's'}</p>
        {data.items.length ? <div>{data.items.map(row => <article key={row.id} className="payment-row">
          <div className="payment-row-main"><span className="payment-service-icon">{row.kind === 'Printing' ? <Printer size={21} aria-hidden="true"/> : <ReceiptText size={21} aria-hidden="true"/>}</span><div className="min-w-0"><h2>{row.payment?.localPreview ? row.kind === 'Printing' ? 'Printing payment' : row.kind === 'LostBook' ? 'Replacement charge' : 'Library fine payment' : row.description}</h2><p className="payment-row-meta">{row.reference}</p><p className="payment-row-meta">{fineDate(row.date)} · {row.method === 'GCASH' ? 'GCash' : row.method === 'QRPH' ? 'QRPh' : row.method}</p><div className="payment-row-badges"><span className="payment-chip">{row.channel === 'Onsite' ? <MapPin size={12} aria-hidden="true"/> : <CreditCard size={12} aria-hidden="true"/>}{row.channel}</span><span className={cn('payment-chip', ['Issued', 'Succeeded'].includes(row.status) && 'payment-chip-success')}>{row.payment ? paymentStatus(row.payment) : row.status === 'Issued' ? 'Payment received' : row.status}</span></div></div><div className="payment-row-amount"><span className="payment-muted mb-1 block text-xs font-normal">Amount</span>{paymentMoney(row.amountCentavos)}</div></div>
          <div className="payment-row-footer"><p className="payment-muted text-xs">{row.feeCentavos > 0 ? 'Includes ' + paymentMoney(row.feeCentavos) + ' transaction fee' : 'No online transaction fee'}</p><div className="flex flex-wrap gap-2">{row.payment ? <Link className="payment-link" to={paymentResultPath(row.payment)}>View status<ArrowRight size={14} aria-hidden="true"/></Link> : null}{row.receiptId ? <Button variant="secondary" className="payment-button" disabled={!!downloading} aria-label={'Download ' + row.reference} onClick={() => void download(row)}><Download size={16} aria-hidden="true"/>{downloading === row.id ? 'Downloading…' : 'Payment record'}</Button> : null}</div></div>
          {downloadError?.id === row.id ? <p role="alert" className="payment-error mt-3">{downloadError.message}</p> : null}
          {row.payment?.refunds?.length?<details className="mt-3"><summary className="payment-link w-fit cursor-pointer">Refund history</summary><RefundTimeline rows={row.payment.refunds}/></details>:null}
        </article>)}</div> : <div className="payment-empty"><PaymentEmptyIcon/><h2 className="text-lg font-semibold">{search || channel !== 'all' ? 'No matching transactions.' : 'No transactions yet.'}</h2><p className="payment-muted max-w-md text-sm">Confirmed onsite payments and online checkout attempts appear here.</p>{search || channel !== 'all' ? <Button variant="secondary" className="payment-button" onClick={() => { setSearch(''); setChannel('all'); setPage(1) }}>Clear filters</Button> : <Link className="payment-link" to={prefix + '/printing'}><FileText size={16} aria-hidden="true"/>Open printing service</Link>}</div>}
        {pages > 1 ? <nav aria-label="Transaction pages" className="flex flex-wrap items-center justify-end gap-3 border-t p-4" style={{ borderColor: 'var(--payment-line)' }}><Button variant="secondary" className="payment-button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</Button><span className="payment-muted text-sm">Page {page} of {pages}</span><Button variant="secondary" className="payment-button" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>Next</Button></nav> : null}
      </>}
    </section>
  </div>
}
