import { useEffect, useState } from 'react'
import { PageHeader, SectionCard } from '../../components/ui'
import { printingApi, type PrintRequest } from './printing-api'

export function StaffPrintingQueuePage() {
  const [rows, setRows] = useState<PrintRequest[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function load() {
    try { setRows((await printingApi.queue({ q: '', status: '', payment: '' })).rows); setError('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load the queue.') }
  }
  useEffect(() => { void load() }, [])
  async function advance(row: PrintRequest, status: string) {
    setBusy(true)
    try { await printingApi.status(row.request_id, status); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update the job.') }
    finally { setBusy(false) }
  }
  return <>
    <PageHeader eyebrow="Staff operations" title="Printing queue" action={<button onClick={() => void load()} className="rounded-xl border border-[#003399]/20 px-4 py-2 text-[#003399]">Refresh</button>} />
    {error ? <p role="alert" className="mb-4 rounded-xl bg-[#FFF200] p-4 text-[#003399]">{error}</p> : null}
    <div className="space-y-3">{rows.map(row => <SectionCard key={row.request_id} className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="font-bold text-[#003399]">#{row.request_id} · {row.file_name}</p><p className="text-sm text-[#003399]/70">{row.full_name} · {row.page_count} pages × {row.number_of_copies} copies · {row.job_status}</p></div><div className="flex gap-2"><button onClick={() => void printingApi.downloadDocument(row).catch(cause => setError(String(cause)))} className="rounded-xl border border-[#003399]/20 px-3 py-2 text-[#003399]">Download</button>{row.job_status === 'Pending' ? <button disabled={busy} onClick={() => void advance(row, 'Printing')} className="rounded-xl bg-[#003399] px-3 py-2 text-white">Start printing</button> : null}{row.job_status === 'Printing' ? <button disabled={busy} onClick={() => void advance(row, 'Ready for Pickup')} className="rounded-xl bg-[#003399] px-3 py-2 text-white">Mark ready</button> : null}{row.job_status === 'Ready for Pickup' ? <button disabled={busy} onClick={() => void advance(row, 'Completed')} className="rounded-xl bg-[#003399] px-3 py-2 text-white">Confirm pickup</button> : null}</div></SectionCard>)}{rows.length === 0 ? <SectionCard className="p-6 text-[#003399]">No print jobs in the queue.</SectionCard> : null}</div>
  </>
}
