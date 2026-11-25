import { usePaymentUpdates } from '../payments/payment-updates'
import { BadgeCheck, BookOpen, Clock3, PhilippinePeso, RefreshCw, ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, NoticeBanner, PageHeader, SectionCard, StatCard, StatusBadge, TableShell } from '../../components/ui'
import { getCurrentIdentity } from '../auth/auth-storage'
import { clearanceApi } from './clearance-api'
import type { ClearanceRecord } from './types'
import { paymentsApi } from '../payments/payments-api'
import { ClearanceCalendar } from './ClearanceCalendar'

function lostResolution(item: ClearanceRecord['lostBooks'][number]) { return item['chargeResolution'] || (item.status === 'Confirmed' ? item.replacementCharge > 0 ? 'Quoted' : 'Awaiting Quotation' : 'Awaiting Review') }
function money(value: number) { return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value) }
function date(value: string | null) { if (!value) return '—'; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-PH', { timeZone:'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) }

export function StudentClearancePage() {
  const [data, setData] = useState<ClearanceRecord | null>(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState('')
  const running = useRef(false)
  const load = useCallback(async (showNotice = false, syncPayments = false) => {
    if (running.current) return
    running.current = true
    if (showNotice) { setRefreshing(true); setNotice('') }
    try {
      if (syncPayments) await paymentsApi.sync().catch(() => undefined)
      setData(await clearanceApi.mine())
      setError('')
      if (showNotice) setNotice('Clearance updated from your current library records.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Clearance is unavailable.')
    } finally { setRefreshing(false); running.current = false }
  }, [])
  useEffect(() => { void load(false, true) }, [load])
  usePaymentUpdates(()=>load(),5000)
  const cleared = (data?.computedStatus ?? data?.status) === 'Cleared'
  const approvedOverride = data?.activeOverride?.status === 'Cleared'
  const deadline = data?.schedule?.deadlineAt
  const pastDeadline = Boolean(deadline && Date.now() > new Date(deadline).getTime())
  const prefix = getCurrentIdentity()?.role === 'Faculty' ? '/faculty' : '/student'
  const unpaidLostBooks = data?.lostBooks.filter((item) => item.status === 'Confirmed' && ['Quoted', 'Book Price'].includes(lostResolution(item)) && item.paymentStatus === 'Unpaid') ?? []
  const hasUnpaidCharges = Boolean(data && (data.fines.length || unpaidLostBooks.length))
  return <>
    <PageHeader eyebrow="Account standing" title="Library clearance" description="Computed from current unreturned books, overdue fines, and lost-book replacement charges." action={<Button variant="secondary" disabled={refreshing} onClick={() => void load(true, true)}><RefreshCw size={16} /> {refreshing ? 'Refreshing…' : 'Refresh'}</Button>} />
    {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
    {notice ? <NoticeBanner tone="success">{notice}</NoticeBanner> : null}
    <section className="relative overflow-hidden rounded-[12px] bg-[#0b5ea2] p-6 text-white shadow-[var(--sl-shadow-m)] sm:p-7"><div className="relative z-10 max-w-3xl"><div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-xs font-semibold ring-1 ring-white/15"><BadgeCheck size={15} className="text-[#FFF200]" />{data ? approvedOverride ? 'Approved by override' : cleared ? 'Requirements complete' : pastDeadline ? 'Clearance overdue' : 'Requirements to complete' : error ? 'Unavailable' : 'Checking…'}</div><h2 className="mt-4 font-display text-2xl font-bold sm:text-3xl">{!data ? error ? 'Clearance status is temporarily unavailable.' : 'Checking your clearance…' : approvedOverride ? 'Your clearance has an authorized approval.' : cleared ? 'You have no library obligations.' : pastDeadline ? 'Your clearance is currently blocked.' : data.schedule === null ? 'Review your current library requirements.' : 'Complete your library requirements before clearance day.'}</h2><p className="mt-2.5 text-sm leading-6 text-white/85">{data?.reason ?? (error ? 'Use Refresh to check your current library records again.' : 'Reviewing your live circulation and fine records.')}</p>{data ? <p className="mt-2 text-xs text-white/65">Checked {date(data.checkedAt)}</p> : null}</div></section>
    <ClearanceCalendar schedule={data?.schedule} />
    <div className="mt-5 grid gap-4 sm:grid-cols-3"><StatCard label="Unreturned books" value={data?.summary.activeLoans ?? '—'} icon={BookOpen} tone={!data ? 'info' : data.summary.activeLoans > 0 ? 'warning' : 'success'} /><StatCard label="Outstanding fines" value={data ? money(data.summary.unpaidOverdueFines) : '—'} icon={PhilippinePeso} tone={!data ? 'info' : data.summary.unpaidOverdueFines > 0 ? 'error' : 'success'} /><StatCard label="Lost-book charges" value={data ? money(data.summary.unpaidReplacementCharges) : '—'} icon={ShieldAlert} tone={!data ? 'info' : data.summary.unpaidReplacementCharges > 0 ? 'error' : 'success'} /></div>
    {data?.activeOverride ? <SectionCard className="mt-5 border-l-4 border-l-[#0f766e] p-5"><div className="flex gap-3"><BadgeCheck className="mt-0.5 shrink-0 text-[#0f766e] dark:text-[#5eead4]" /><div><h3 className="font-display font-semibold text-[var(--sl-text-header)]">Authorized override: {data.activeOverride.status}</h3><p className="mt-1 text-sm text-[var(--sl-text-secondary)]">{data.activeOverride.reason}</p><p className="mt-2 text-xs text-[var(--sl-text-muted)]">Applied by {data.activeOverride.appliedBy} · {date(data.activeOverride.appliedAt)}</p></div></div></SectionCard> : null}
    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <TableShell
        title="Unreturned books"
        controls={data?.loans.length ? <a href={`${prefix}/borrowing`} className="text-xs font-semibold text-[#0b5ea2] underline dark:text-[#93c5fd]">View active loans</a> : undefined}
      >
        {data?.loans.length ? (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
              <tr>
                <th scope="col" className="px-4 py-2.5">Book</th>
                <th scope="col" className="px-4 py-2.5">Due</th>
                <th scope="col" className="px-4 py-2.5">Overdue</th>
                <th scope="col" className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sl-border)]">
              {data.loans.map((loan) => (
                <tr key={loan.transactionId}>
                  <td className="px-4 py-3"><p className="font-semibold text-[var(--sl-text-header)]">{loan.title}</p><p className="mt-0.5 font-mono text-xs text-[var(--sl-text-muted)]">{loan.accessionNumber ?? `Transaction ${loan.transactionId}`}</p></td>
                  <td className="px-4 py-3 text-xs tabular-nums text-[var(--sl-text-secondary)]">{date(loan.dueAt)}</td>
                  <td className="px-4 py-3 text-xs font-semibold tabular-nums text-[var(--sl-text-header)]">{loan.overdueHours} hours</td>
                  <td className="px-4 py-3"><StatusBadge status={loan.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-8 text-center text-sm text-[var(--sl-text-muted)]">{data ? 'No unreturned books.' : error ? 'Book records unavailable.' : 'Loading book records…'}</p>
        )}
      </TableShell>
      <div className="space-y-0">
        <TableShell
          title="Outstanding charges"
          controls={hasUnpaidCharges ? <a href={`${prefix}/fines`} className="text-xs font-semibold text-[#0b5ea2] underline dark:text-[#93c5fd]">View fines</a> : undefined}
        >
          {hasUnpaidCharges && data ? (
            <>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
                  <tr>
                    <th scope="col" className="px-4 py-2.5">Charge</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--sl-border)]">
                  {data.fines.map((fine) => (
                    <tr key={`fine-${fine.fineId}`}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[var(--sl-text-header)]">{fine.basis === 'Manual' ? 'Library infraction' : 'Overdue fine'} · {fine.title}</p>
                        <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">{fine.basis === 'Manual' ? (fine.notes ?? 'Documented library infraction') : `${fine.overdueUnits} ${fine.basis.toLowerCase()} units at ${money(fine.rate)}`}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--sl-text-header)]">{money(fine.amount)}</td>
                    </tr>
                  ))}
                  {unpaidLostBooks.map((item) => (
                    <tr key={`lost-${item.lostBookReportId}`}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[var(--sl-text-header)]">Lost-book replacement · {item.title}</p>
                        <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">Confirmed {date(item.verifiedAt)}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--sl-text-header)]">{money(item.replacementCharge)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-between bg-[#0b5ea2] px-5 py-3.5 text-sm text-white"><span className="font-semibold">Total outstanding</span><strong className="tabular-nums">{money(data.summary.totalOutstanding)}</strong></div>
            </>
          ) : (
            <>
              <p className="p-8 text-center text-sm text-[var(--sl-text-muted)]">{data ? 'No unpaid charges.' : error ? 'Charge records unavailable.' : 'Loading charge records…'}</p>
              {data ? <div className="flex justify-between bg-[#0b5ea2] px-5 py-3.5 text-sm text-white"><span className="font-semibold">Total outstanding</span><strong className="tabular-nums">{money(data.summary.totalOutstanding)}</strong></div> : null}
            </>
          )}
        </TableShell>
      </div>
      {data?.lostBooks.some((item) => item.status === 'Confirmed' && lostResolution(item) === 'Awaiting Quotation') ? <SectionCard className="mt-5 p-5"><h2 className="font-display font-semibold text-[var(--sl-text-header)]">Lost book awaiting quotation</h2><p className="mt-1 text-sm text-[var(--sl-text-secondary)]">The library confirmed the loss but has not assessed a replacement charge. Staff will notify you when a quotation is reviewed.</p></SectionCard> : null}
    </div>
    <SectionCard className="mt-5 p-5"><div className="flex gap-3"><Clock3 className="mt-0.5 shrink-0 text-[#0b5ea2] dark:text-[#93c5fd]" /><div><h3 className="font-display font-semibold text-[var(--sl-text-header)]">How clearance is determined</h3><p className="mt-1 text-sm leading-6 text-[var(--sl-text-secondary)]">Return books and settle unpaid fines or confirmed replacement charges to complete your library requirements. The overdue clearance warning appears only after the scheduled deadline. Authorized staff may record a reasoned override, and its full history remains visible for audit.</p></div></div></SectionCard>
  </>
}
