import { formatLoanDate } from './loan-time'
import { usePaymentUpdates } from '../payments/payment-updates'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { ViewLocationButton } from '../floor-plan/ViewLocationButton'
import { BookOpen, CalendarClock, CalendarPlus, Eye, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, NoticeBanner, PageHeader, SectionCard, StatCard, StatusBadge } from '../../components/ui'
import { circulationApi } from './circulation-api'
import { InLibraryHistory } from './InLibraryHistory'
import type { BorrowingHistoryData } from './types'
import { BookDetailDrawer } from '../catalog/BookDetailDrawer'
import { CancelBorrowRequestDialog } from './CancelBorrowRequestDialog'
import { RenewLoanDialog } from './RenewLoanDialog'
import { ReportLostDialog } from './ReportLostDialog'
import { BookCoverThumbnail } from '../catalog/BookCoverThumbnail'
import { clearanceApi } from '../clearance/clearance-api'
import { RefreshButton } from '../../components/RefreshButton'

function formatDate(value: string | null) { return formatLoanDate(value, '—') }

export function BorrowingHistory() {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<BorrowingHistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [detail, setDetail] = useState<{ titleId: number; barcode: string | null } | null>(null)
  const [cancelling, setCancelling] = useState<BorrowingHistoryData['items'][number] | null>(null)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [reporting, setReporting] = useState<BorrowingHistoryData['items'][number] | null>(null)
  const [renewing, setRenewing] = useState<BorrowingHistoryData['items'][number] | null>(null)
  const [reportBusy, setReportBusy] = useState(false)
  const [reportError, setReportError] = useState('')
  const fetching = useRef(false)
  const load = useCallback(async () => {
    if (fetching.current) return
    fetching.current = true
    setError('')
    try { setData(await circulationApi.history(page)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Borrowing history is unavailable.') }
    finally { setLoading(false); fetching.current = false }
  }, [page])
  useEffect(() => {
    void load()
    const refresh = () => { if (!document.hidden) void load() }
    window.addEventListener('smartlib:circulation-updated', refresh)
    return () => { window.removeEventListener('smartlib:circulation-updated', refresh) }
  }, [load])

  usePaymentUpdates(load,5000)

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

  async function reportLost() {
    if (!reporting || reportBusy) return
    setReportBusy(true); setReportError('')
    try {
      await clearanceApi.reportLost(reporting.transactionId)
      setData(current => current ? { ...current, items: current.items.map(item => item.transactionId === reporting.transactionId ? { ...item, lostReportStatus: 'Pending' } : item) } : current)
      window.dispatchEvent(new Event('smartlib:circulation-updated'))
      setNotice(`${reporting.title} was reported lost. Library staff have been notified.`)
      setReporting(null)
      await load()
    } catch (reason) {
      setReportError(reason instanceof Error ? reason.message : 'The lost-book report could not be submitted.')
    } finally { setReportBusy(false) }
  }

  const summary = data?.summary
  return <>
    <PageHeader eyebrow="My library" title="Borrowing history" description="Track active loans, due dates, single-day renewals, and past returns in Philippine time (PHT)." action={<RefreshButton onRefresh={() => load()} variant="secondary" />} />
    {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
    {notice ? <NoticeBanner tone="success" action={<button type="button" aria-label="Dismiss" onClick={() => setNotice('')} className="rounded-[6px] p-1 hover:bg-white/15"><X size={16} /></button>}>{notice}</NoticeBanner> : null}
    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      <StatCard label="Remaining loan slots" value={!summary ? '—' : summary.remainingLoanSlots === null ? 'Unlimited' : `${summary.remainingLoanSlots} / ${summary.loanLimit}`} icon={BookOpen} tone="info" />
      <StatCard label="Active loans" value={summary?.activeLoans ?? '—'} icon={CalendarClock} tone="teal" />
      <StatCard label="Next deadline" value={!summary ? '—' : summary.nextDueAt ? formatDate(summary.nextDueAt) : 'No active due date'} note={summary?.nextDueAt ? `Due: ${summary.dueCutoffLabel}` : undefined} icon={CalendarClock} tone={summary?.nextDueAt ? 'warning' : 'default'} />
    </div>
    <SectionCard className="overflow-hidden">
      <div className="border-b border-[var(--sl-border)] px-5 py-3.5"><h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Transaction history</h2></div>
      <ResponsiveTable label="Transaction history"><table className="w-full min-w-[1050px] text-left text-sm">
        <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]"><tr><th scope="col" className="px-5 py-3">Title</th><th scope="col" className="px-5 py-3">Author</th><th scope="col" className="px-5 py-3">Borrow date</th><th scope="col" className="px-5 py-3">Due date</th><th scope="col" className="px-5 py-3">Status</th><th scope="col" className="px-5 py-3 text-right">Actions</th></tr></thead>
        <tbody className="divide-y divide-[var(--sl-border)]">{loading ? <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-[var(--sl-text-secondary)]">Loading borrowing records…</td></tr> : data?.items.length ? data.items.map((item) => <tr key={item.transactionId}>
          <td className="px-5 py-3.5"><div className="flex items-center gap-3"><BookCoverThumbnail title={item.title} coverImagePath={item.coverImagePath} className="h-16 w-11 rounded-[6px]" /><div className="min-w-0"><p className="font-semibold text-[var(--sl-text-header)]">{item.title}</p><p className="mt-0.5 font-mono text-xs text-[var(--sl-text-muted)]">{item.accessionNumber ?? item.barcode ?? `TX-${item.transactionId}`}</p></div></div></td>
          <td className="px-5 py-3.5 text-[var(--sl-text-secondary)]">{item.author}</td><td className="px-5 py-3.5 tabular-nums text-[var(--sl-text-secondary)]">{formatDate(item.borrowDate)}</td><td className="px-5 py-3.5 font-semibold tabular-nums text-[var(--sl-text-header)]"><p>{formatDate(item.dueDate)}</p>{typeof item.renewalCount === 'number' ? <p className="mt-0.5 text-xs font-medium text-[var(--sl-text-muted)]">Renewed {item.renewalCount} of {item.maxRenewals}</p> : null}</td><td className="px-5 py-3.5"><StatusBadge status={item.lostReportStatus ?? item.status} />{item.caseSummary ? <p className="mt-2 max-w-xs text-xs font-medium text-[var(--sl-text-secondary)]">{item.caseSummary.caseType==='Long Overdue'?'Overdue follow-up':'Damage review'}: {item.caseSummary.status}. {item.caseSummary.instruction}</p> : null}</td><td className="w-px whitespace-nowrap px-5 py-3.5"><div className="flex flex-nowrap items-center justify-end gap-2">{item.titleId ? <ViewLocationButton titleId={Number(item.titleId)} barcode={item.barcode}/> : null}{item.titleId ? <Button variant="secondary" size="sm" onClick={() => setDetail({ titleId: Number(item.titleId), barcode: item.barcode })}><Eye size={15} /> View details</Button> : null}{item.status === 'Pending' ? <Button variant="ghost" size="sm" onClick={() => { setCancelError(''); setCancelling(item) }}><X size={15} /> Cancel request</Button> : null}{item.canRequestRenewal ? <Button size="sm" onClick={() => setRenewing(item)}><CalendarPlus size={15} /> Renew this book</Button> : null}{['Borrowed','Overdue'].includes(item.status) && !item.lostReportStatus ? <Button variant="secondary" size="sm" className="border-[#fecaca] text-[#b42318] hover:bg-[#fef2f2] dark:border-red-400/35 dark:text-red-300 dark:hover:bg-red-950/40" onClick={() => { setReportError(''); setReporting(item) }}>Report as lost</Button> : null}</div></td>
        </tr>) : <tr><td colSpan={6} className="px-5 py-12 text-center text-sm font-medium text-[var(--sl-text-muted)]">{error ? 'Unable to load borrowing records. Use Refresh to try again.' : 'No borrowing transactions have been recorded.'}</td></tr>}</tbody>
      </table></ResponsiveTable>
      {data && data.pagination.totalPages > 1 ? <nav aria-label="Borrowing history pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sl-border)] p-4 text-sm text-[var(--sl-text-secondary)]"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</Button><span className="tabular-nums">Page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.total} transactions</span><Button variant="secondary" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage(value => value + 1)}>Next</Button></nav> : null}
    </SectionCard>
    <InLibraryHistory />
    {detail ? <BookDetailDrawer titleId={detail.titleId} barcode={detail.barcode} onClose={() => setDetail(null)} /> : null}
    {cancelling ? <CancelBorrowRequestDialog title={cancelling.title} busy={cancelBusy} error={cancelError} onCancel={() => { if (!cancelBusy) setCancelling(null) }} onConfirm={(reason) => void confirmCancellation(reason)} /> : null}
    {renewing ? <RenewLoanDialog transactionId={renewing.transactionId} title={renewing.title} onCancel={() => setRenewing(null)} onSuccess={(decision) => { setRenewing(null); setNotice(`${renewing.title} was renewed until ${formatDate(decision.newDueAt)}.`); window.dispatchEvent(new Event('smartlib:circulation-updated')); void load() }} /> : null}
    {reporting ? <ReportLostDialog title={reporting.title} busy={reportBusy} error={reportError} onCancel={() => { if (!reportBusy) setReporting(null) }} onConfirm={() => void reportLost()} /> : null}
  </>
}
