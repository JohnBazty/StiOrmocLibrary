import { AlertTriangle, BadgeCheck, BookOpen, Clock3, PhilippinePeso, RefreshCw, ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, PageHeader, SectionCard, StatCard, StatusBadge } from '../../components/ui'
import { clearanceApi } from './clearance-api'
import type { ClearanceRecord } from './types'

function lostResolution(item: ClearanceRecord['lostBooks'][number]) { return item['chargeResolution'] || (item.status === 'Confirmed' ? item.replacementCharge > 0 ? 'Quoted' : 'Awaiting Quotation' : 'Awaiting Review') }
function money(value: number) { return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value) }
function date(value: string | null) { if (!value) return '—'; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-PH', { timeZone:'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) }

export function StudentClearancePage() {
  const [data, setData] = useState<ClearanceRecord | null>(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState('')
  const running = useRef(false)
  const load = useCallback(async (showNotice = false) => {
    if (running.current) return
    running.current = true
    if (showNotice) { setRefreshing(true); setNotice('') }
    try {
      setData(await clearanceApi.mine())
      setError('')
      if (showNotice) setNotice('Clearance updated from your current library records.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Clearance is unavailable.')
    } finally { setRefreshing(false); running.current = false }
  }, [])
  useEffect(() => { void load(); const timer = window.setInterval(() => { if (!document.hidden) void load() }, 5000); return () => clearInterval(timer) }, [load])
  const cleared = (data?.computedStatus ?? data?.status) === 'Cleared'
  const approvedOverride = data?.activeOverride?.status === 'Cleared'
  const deadline = data?.schedule?.deadlineAt
  const pastDeadline = Boolean(deadline && Date.now() > new Date(deadline).getTime())
  return <>
    <PageHeader eyebrow="Account standing" title="Library clearance" description="Computed from current unreturned books, overdue fines, and lost-book replacement charges." action={<Button variant="secondary" disabled={refreshing} onClick={() => void load(true)}><RefreshCw size={16} /> {refreshing ? 'Refreshing…' : 'Refresh'}</Button>} />
    {error ? <div role="alert" className="mb-5 flex gap-2 rounded-xl bg-[#FFF200] p-4 font-bold text-[#0b5ea2]"><AlertTriangle size={18} />{error}</div> : null}
    {notice ? <p role="status" className="mb-5 rounded-xl bg-[#0b5ea2]/5 p-4 text-sm font-semibold text-[#0b5ea2]">{notice}</p> : null}
    <section className="relative overflow-hidden rounded-3xl bg-[#0b5ea2] p-7 text-white"><div className="relative z-10 max-w-3xl"><div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold"><BadgeCheck size={15} className="text-[#FFF200]" />{data ? approvedOverride ? 'Approved by override' : cleared ? 'Requirements complete' : pastDeadline ? 'Clearance overdue' : 'Requirements to complete' : error ? 'Unavailable' : 'Checking…'}</div><h2 className="mt-5 font-display text-3xl font-bold">{!data ? error ? 'Clearance status is temporarily unavailable.' : 'Checking your clearance…' : approvedOverride ? 'Your clearance has an authorized approval.' : cleared ? 'You have no library obligations.' : pastDeadline ? 'Your clearance is currently blocked.' : data.schedule === null ? 'Review your current library requirements.' : 'Complete your library requirements before clearance day.'}</h2><p className="mt-3 text-sm leading-6 text-white/80">{data?.reason ?? (error ? 'Use Refresh to check your current library records again.' : 'Reviewing your live circulation and fine records.')}</p>{data ? <p className="mt-2 text-xs text-white/55">Checked {date(data.checkedAt)}</p> : null}</div></section>
    <p role="status" className="mt-4 rounded-xl border p-4 text-sm">{!data ? 'Clearance schedule is not available yet.' : data.schedule === null ? 'Your current library requirements are listed below.' : deadline ? `Clearance deadline: ${new Date(deadline).toLocaleString('en-PH', {timeZone:'Asia/Manila',dateStyle:'long',timeStyle:'short'})} (Philippine time)` : 'No schedule yet for clearance day.'}</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-3"><StatCard label="Unreturned books" value={data?.summary.activeLoans ?? '—'} icon={BookOpen} tone="blue" /><StatCard label="Outstanding fines" value={data ? money(data.summary.unpaidOverdueFines) : '—'} icon={PhilippinePeso} tone="blue" /><StatCard label="Lost-book charges" value={data ? money(data.summary.unpaidReplacementCharges) : '—'} icon={ShieldAlert} tone="blue" /></div>
    {data?.activeOverride ? <SectionCard className="mt-5 border-[#FFF200] p-5"><div className="flex gap-3"><BadgeCheck className="text-[#0b5ea2]" /><div><h3 className="font-bold text-[#0b5ea2]">Authorized override: {data.activeOverride.status}</h3><p className="mt-1 text-sm text-[#0b5ea2]/70">{data.activeOverride.reason}</p><p className="mt-2 text-xs text-[#0b5ea2]/50">Applied by {data.activeOverride.appliedBy} · {date(data.activeOverride.appliedAt)}</p></div></div></SectionCard> : null}
    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <SectionCard className="overflow-hidden"><div className="border-b border-[#0b5ea2]/15 px-5 py-4"><h2 className="font-bold text-[#0b5ea2]">Unreturned books</h2></div><div className="divide-y divide-[#0b5ea2]/10">{data?.loans.length ? data.loans.map((loan) => <div key={loan.transactionId} className="p-5"><div className="flex justify-between gap-3"><div><p className="font-bold text-[#0b5ea2]">{loan.title}</p><p className="mt-1 text-xs text-[#0b5ea2]/60">{loan.accessionNumber ?? `Transaction ${loan.transactionId}`}</p></div><StatusBadge status={loan.status} /></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#0b5ea2]/70"><span>Due<br /><strong>{date(loan.dueAt)}</strong></span><span>Overdue<br /><strong>{loan.overdueHours} hours</strong></span></div></div>) : <p className="p-8 text-center text-sm text-[#0b5ea2]/65">{data ? 'No unreturned books.' : error ? 'Book records unavailable.' : 'Loading book records…'}</p>}</div></SectionCard>
      <SectionCard className="overflow-hidden"><div className="border-b border-[#0b5ea2]/15 px-5 py-4"><h2 className="font-bold text-[#0b5ea2]">Outstanding charges</h2></div><div className="divide-y divide-[#0b5ea2]/10">{data && (data.fines.length || data.lostBooks.some((item) => item.status === 'Confirmed' && lostResolution(item) === 'Quoted' && item.paymentStatus === 'Unpaid')) ? <>{data.fines.map((fine) => <div key={`fine-${fine.fineId}`} className="flex justify-between gap-3 p-5"><div><p className="font-bold text-[#0b5ea2]">{fine.basis === 'Manual' ? 'Library infraction' : 'Overdue fine'} · {fine.title}</p><p className="mt-1 text-xs text-[#0b5ea2]/60">{fine.basis === 'Manual' ? (fine.notes ?? 'Documented library infraction') : `${fine.overdueUnits} ${fine.basis.toLowerCase()} units at ${money(fine.rate)}`}</p></div><strong className="text-[#0b5ea2]">{money(fine.amount)}</strong></div>)}{data.lostBooks.filter((item) => item.status === 'Confirmed' && lostResolution(item) === 'Quoted' && item.paymentStatus === 'Unpaid').map((item) => <div key={`lost-${item.lostBookReportId}`} className="flex justify-between gap-3 p-5"><div><p className="font-bold text-[#0b5ea2]">Lost-book replacement · {item.title}</p><p className="mt-1 text-xs text-[#0b5ea2]/60">Confirmed {date(item.verifiedAt)}</p></div><strong className="text-[#0b5ea2]">{money(item.replacementCharge)}</strong></div>)}</> : <p className="p-8 text-center text-sm text-[#0b5ea2]/65">{data ? 'No unpaid charges.' : error ? 'Charge records unavailable.' : 'Loading charge records…'}</p>}</div>{data ? <div className="flex justify-between bg-[#0b5ea2] p-5 text-white"><span className="font-bold">Total outstanding</span><strong>{money(data.summary.totalOutstanding)}</strong></div> : null}</SectionCard>
      {data?.lostBooks.some((item) => item.status === 'Confirmed' && lostResolution(item) === 'Awaiting Quotation') ? <SectionCard className="mt-5 p-5"><h2 className="font-bold text-[#0b5ea2]">Lost book awaiting quotation</h2><p className="mt-1 text-sm text-[#0b5ea2]/70">The library confirmed the loss but has not assessed a replacement charge. Staff will notify you when a quotation is reviewed.</p></SectionCard> : null}
    </div>
    <SectionCard className="mt-5 p-5"><div className="flex gap-3"><Clock3 className="text-[#0b5ea2]" /><div><h3 className="font-bold text-[#0b5ea2]">How clearance is determined</h3><p className="mt-1 text-sm leading-6 text-[#0b5ea2]/70">Return books and settle unpaid fines or confirmed replacement charges to complete your library requirements. The overdue clearance warning appears only after the scheduled deadline. Authorized staff may record a reasoned override, and its full history remains visible for audit.</p></div></div></SectionCard>
  </>
}
