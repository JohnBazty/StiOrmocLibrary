import { AlertTriangle, BookOpen, CalendarClock, Eye, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button, PageHeader, SectionCard, StatCard, StatusBadge } from '../../components/ui'
import { circulationApi } from './circulation-api'
import type { BorrowingHistoryData } from './types'
import { BookDetailDrawer } from '../catalog/BookDetailDrawer'
import { CancelBorrowRequestDialog } from './CancelBorrowRequestDialog'
import { BookCoverThumbnail } from '../catalog/BookCoverThumbnail'
import { clearanceApi } from '../clearance/clearance-api'

function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export function BorrowingHistory() {
  const [data, setData] = useState<BorrowingHistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [detail, setDetail] = useState<{ titleId: number; barcode: string | null } | null>(null)
  const [cancelling, setCancelling] = useState<BorrowingHistoryData['items'][number] | null>(null)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setData(await circulationApi.history()) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Borrowing history is unavailable.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    void load()
    const refresh = () => void load()
    const timer = window.setInterval(refresh, 5_000)
    window.addEventListener('smartlib:circulation-updated', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('smartlib:circulation-updated', refresh) }
  }, [load])

  async function confirmCancellation(reason: string) {
    if (!cancelling || cancelBusy) return
    setCancelBusy(true); setCancelError('')
    try {
      await circulationApi.cancelRequest(cancelling.transactionId, reason)
      setCancelling(null)
      setNotice(`${cancelling.title} request was cancelled and its copy is available again.`)
      window.dispatchEvent(new Event('smartlib:circulation-updated'))
      await load()
    } catch (reasonValue) {
      setCancelError(reasonValue instanceof Error ? reasonValue.message : 'The pending request could not be cancelled.')
    } finally { setCancelBusy(false) }
  }

  async function reportLost(transactionId: number, title: string) {
    if (!window.confirm(`Report “${title}” as lost? The library will be notified and will verify the replacement charge.`)) return
    try { await clearanceApi.reportLost(transactionId); setNotice(`${title} was reported lost. Library staff have been notified.`); await load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The lost-book report could not be submitted.') }
  }

  const summary = data?.summary
  return <>
    <PageHeader eyebrow="My library" title="Borrowing history" action={<Button variant="secondary" onClick={() => void load()}><RefreshCw size={16} /> Refresh</Button>} />
    {error ? <div role="alert" className="mb-5 flex items-center gap-3 rounded-xl bg-[#FFF200] px-4 py-3 font-semibold text-[#003399]"><AlertTriangle size={18} />{error}</div> : null}
    {notice ? <div role="status" className="mb-5 flex items-center justify-between rounded-xl bg-[#003399] px-4 py-3 font-semibold text-[#FFFFFF]"><span>{notice}</span><button aria-label="Dismiss" onClick={() => setNotice('')}><X size={17} /></button></div> : null}
    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      <StatCard label="Remaining loan slots" value={summary?.remainingLoanSlots === null ? 'Unlimited' : `${summary?.remainingLoanSlots ?? 0} / 2`} icon={BookOpen} tone="blue" />
      <StatCard label="Active loans" value={summary?.activeLoans ?? 0} icon={CalendarClock} tone="blue" />
      <StatCard label="Next deadline" value={summary?.nextDueAt ? formatDate(summary.nextDueAt) : 'No active due date'} icon={CalendarClock} tone="orange" />
    </div>
    {summary?.nextDueAt ? <div className="mb-5 inline-flex rounded-full bg-[#FFF200] px-4 py-2 text-sm font-bold text-[#003399]">Due: {summary.dueCutoffLabel}</div> : null}
    <SectionCard className="overflow-hidden">
      <div className="border-b border-[#003399]/15 px-5 py-4"><h2 className="font-bold text-[#003399]">Transaction history</h2></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm">
        <thead className="bg-[#003399] text-[#FFFFFF]"><tr><th className="px-5 py-3">Title</th><th className="px-5 py-3">Author</th><th className="px-5 py-3">Borrow date</th><th className="px-5 py-3">Due date</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Actions</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={6} className="px-5 py-12 text-center text-[#003399]">Loading borrowing records…</td></tr> : data?.items.length ? data.items.map((item) => <tr key={item.transactionId} className="border-b border-[#003399]/10">
          <td className="px-5 py-4"><div className="flex items-center gap-3"><BookCoverThumbnail title={item.title} coverImagePath={item.coverImagePath} className="h-16 w-11 rounded-lg" /><div className="min-w-0"><p className="font-bold text-[#003399]">{item.title}</p><p className="mt-1 font-mono text-xs text-[#003399]/60">{item.accessionNumber ?? item.barcode ?? `TX-${item.transactionId}`}</p></div></div></td>
          <td className="px-5 py-4 text-[#003399]">{item.author}</td><td className="px-5 py-4 text-[#003399]">{formatDate(item.borrowDate)}</td><td className="px-5 py-4 font-semibold text-[#003399]">{formatDate(item.dueDate)}</td><td className="px-5 py-4"><StatusBadge status={item.lostReportStatus ?? item.status} /></td><td className="px-5 py-4"><div className="flex justify-end gap-2">{item.titleId ? <button onClick={() => setDetail({ titleId: Number(item.titleId), barcode: item.barcode })} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#003399]/20 px-3 text-xs font-bold text-[#003399]"><Eye size={15} /> View details</button> : null}{item.status === 'Pending' ? <button onClick={() => { setCancelError(''); setCancelling(item) }} className="h-9 rounded-lg px-3 text-xs font-bold text-[#003399] hover:bg-[#FFF200]"><X size={14} className="inline" /> Cancel request</button> : null}{['Borrowed','Overdue'].includes(item.status) && !item.lostReportStatus ? <button onClick={() => void reportLost(item.transactionId, item.title)} className="h-9 rounded-lg bg-[#FFF200] px-3 text-xs font-bold text-[#003399]">Report lost</button> : null}</div></td>
        </tr>) : <tr><td colSpan={6} className="px-5 py-12 text-center font-semibold text-[#003399]">No borrowing transactions have been recorded.</td></tr>}</tbody>
      </table></div>
    </SectionCard>
    {detail ? <BookDetailDrawer titleId={detail.titleId} barcode={detail.barcode} onClose={() => setDetail(null)} /> : null}
    {cancelling ? <CancelBorrowRequestDialog title={cancelling.title} busy={cancelBusy} error={cancelError} onCancel={() => { if (!cancelBusy) setCancelling(null) }} onConfirm={(reason) => void confirmCancellation(reason)} /> : null}
  </>
}
