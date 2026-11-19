import { useState } from 'react'
import { printingApi, type PrintRequest } from './printing-api'

export function PrintingInvoice({ request, admin = false }: { request: PrintRequest; admin?: boolean }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function download() {
    setBusy(true); setError('')
    try { await printingApi.downloadInvoice(request, admin) }
    catch (error) { setError(error instanceof Error ? error.message : 'The invoice could not be downloaded.') }
    finally { setBusy(false) }
  }
  const cancelled = request.job_status === 'Cancelled'
  const paid = request.payment_status === 'Paid'
  const refunding = request.payment_status === 'Refund pending'
  return <details className="mt-3 min-w-0 rounded-xl border border-[#0b5ea2]/15 p-3 dark:border-white/20"><summary className="min-h-11 cursor-pointer text-sm font-semibold">Invoice · PRINT-INV-{String(request.request_id).padStart(8,'0')} · {request.payment_status==='Refunded'?'Refunded':request.payment_status==='Refund pending'?'Refund pending':cancelled ? 'Cancelled' : paid ? 'Paid' : request.payment_status}</summary><div className="mt-3 space-y-2 text-sm"><p className="break-words font-semibold">{request.file_name}</p><p>{request.page_count} pages × {request.number_of_copies} copies = {request.total_sheets} sheets</p><p>{request.service_kind??'Print'} · {request.output_mode??request.print_type} · {request.paper_size}</p>{request.paper_brand_snapshot&&<p>Paper brand: {request.paper_brand_snapshot}</p>}{request.pricing_review_state&&request.pricing_review_state!=='Ready'&&<p className="font-semibold">Estimate · {request.pricing_review_state==='Pending'?'Waiting for staff review':'Waiting for your price confirmation'}</p>}{request.pricing_snapshot&&<div className="space-y-1 text-xs"><p>Base printing: ₱{(request.pricing_snapshot.baseCentavos/100).toFixed(2)}</p><p>Image-page additions: ₱{(request.pricing_snapshot.imageCentavos/100).toFixed(2)}</p><p>Color pages: {request.pricing_snapshot.coloredPages.join(', ')||'None'}</p></div>}<dl className="flex flex-wrap justify-between gap-3 border-t pt-3"><div><dt>Total charge</dt><dd className="font-bold tabular-nums">₱{Number(request.calculated_cost).toFixed(2)}</dd></div><div><dt>Amount due</dt><dd className="font-bold tabular-nums">₱{cancelled || paid || refunding ? '0.00' : Number(request.balance??request.calculated_cost).toFixed(2)}</dd></div></dl><p className="text-xs opacity-70">{refunding ? 'A refund is awaiting confirmation. Do not pay this bill again.' : cancelled ? 'This request is cancelled.' : paid ? 'Payment recorded. Your payment confirmation is available separately.' : request.pricing_review_state&&request.pricing_review_state!=='Ready'?'The price needs confirmation before payment.':'This is your bill before payment. Choose an available payment option.'}</p>{error ? <p role="alert" className="auth-error rounded-lg p-2">{error}</p> : null}<button type="button" disabled={busy} className="min-h-11 rounded-xl border px-3 font-semibold disabled:opacity-50" onClick={() => void download()}>{busy ? 'Downloading…' : 'Download invoice PDF'}</button></div></details>
}
