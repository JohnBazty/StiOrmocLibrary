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
  return <details className="mt-3 min-w-0 rounded-xl border border-[#003399]/15 p-3 dark:border-white/20"><summary className="min-h-11 cursor-pointer text-sm font-semibold">Invoice · PRINT-INV-{String(request.request_id).padStart(8,'0')} · {cancelled ? 'Cancelled' : paid ? 'Paid' : 'Unpaid'}</summary><div className="mt-3 space-y-2 text-sm"><p className="break-words font-semibold">{request.file_name}</p><p>{request.page_count} pages × {request.number_of_copies} copies = {request.total_sheets} sheets</p><p>{request.print_type} · {request.paper_size}</p><dl className="flex flex-wrap justify-between gap-3 border-t pt-3"><div><dt>Total charge</dt><dd className="font-bold tabular-nums">₱{Number(request.calculated_cost).toFixed(2)}</dd></div><div><dt>Amount due</dt><dd className="font-bold tabular-nums">₱{cancelled || paid ? '0.00' : Number(request.calculated_cost).toFixed(2)}</dd></div></dl><p className="text-xs opacity-70">{cancelled ? 'This request is cancelled.' : paid ? 'Payment recorded. Your payment confirmation is available separately.' : 'This is your bill before payment. Pay at the library counter.'}</p>{error ? <p role="alert" className="auth-error rounded-lg p-2">{error}</p> : null}<button type="button" disabled={busy} className="min-h-11 rounded-xl border px-3 font-semibold disabled:opacity-50" onClick={() => void download()}>{busy ? 'Downloading…' : 'Download invoice PDF'}</button></div></details>
}
