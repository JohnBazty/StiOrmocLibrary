import { AlertTriangle, BookOpen, CalendarClock, CheckCircle2, RefreshCw, ScanBarcode } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Button, PageHeader, SectionCard, StatCard, StatusBadge } from '../../components/ui'
import { circulationApi } from './circulation-api'
import type { CirculationMonitorData } from './types'
import { CancelBorrowRequestDialog } from './CancelBorrowRequestDialog'

function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export function AdminCirculationMonitor() {
  const [data, setData] = useState<CirculationMonitorData | null>(null)
  const [loading, setLoading] = useState(true); const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState(''); const [success, setSuccess] = useState('')
  const [barcode, setBarcode] = useState(''); const [schoolId, setSchoolId] = useState(''); const [submitting, setSubmitting] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<CirculationMonitorData['items'][number] | null>(null)
  const [cancelError, setCancelError] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await circulationApi.monitor()); setError('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Circulation records are unavailable.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    void load()
    const refresh = () => void load()
    const timer = window.setInterval(refresh, 5_000)
    window.addEventListener('smartlib:circulation-updated', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('smartlib:circulation-updated', refresh) }
  }, [load])

  async function checkout(event: FormEvent) {
    event.preventDefault(); if (submitting) return; setSubmitting(true); setError(''); setSuccess('')
    try { await circulationApi.fulfillClaim(barcode, schoolId); setBarcode(''); setSuccess('School ID and barcode verified. The claim is now an active loan.'); await load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Checkout could not be confirmed.') }
    finally { setSubmitting(false) }
  }
  async function completeReturn(transactionId: number) {
    setBusyId(transactionId); setError(''); setSuccess('')
    try { await circulationApi.returnBook(transactionId); setSuccess('Return completed and the waiting queue was advanced.'); await load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Return could not be completed.') }
    finally { setBusyId(null) }
  }
  async function penalty(transactionId: number) {
    setBusyId(transactionId); setError(''); setSuccess('')
    try { const result = await circulationApi.calculatePenalty(transactionId); setSuccess(`Calculated penalty: ₱${result.amount.toFixed(2)}`) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Penalty could not be calculated.') }
    finally { setBusyId(null) }
  }
  async function cancelPending(reason: string) {
    if (!cancelTarget || busyId !== null) return
    const target = cancelTarget
    setBusyId(target.transactionId); setCancelError(''); setError(''); setSuccess('')
    try {
      await circulationApi.cancelRequest(target.transactionId, reason)
      setData((current) => current ? {
        ...current,
        summary: { ...current.summary, pendingClaims: Math.max(0, current.summary.pendingClaims - 1) },
        items: current.items.filter((item) => item.transactionId !== target.transactionId),
      } : current)
      setCancelTarget(null)
      setSuccess(`${target.title} pending claim was cancelled and released.`)
      window.dispatchEvent(new Event('smartlib:circulation-updated'))
      await load()
    } catch (reasonValue) {
      setCancelError(reasonValue instanceof Error ? reasonValue.message : 'The pending request could not be cancelled.')
    } finally { setBusyId(null) }
  }
  const lanes = useMemo(() => ({
    pending: data?.items.filter((item) => item.status === 'Pending') ?? [],
    active: data?.items.filter((item) => ['Borrowed', 'Active'].includes(item.status)) ?? [],
    overdue: data?.items.filter((item) => item.status === 'Overdue') ?? [],
  }), [data])

  const table = (items: CirculationMonitorData['items'], empty: string) => <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm">
    <thead className="bg-[#003399] text-[#FFFFFF]"><tr><th className="px-4 py-3">Borrower</th><th className="px-4 py-3">Book / copy</th><th className="px-4 py-3">Requested / borrowed</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
    <tbody>{items.length ? items.map((item) => <tr key={item.transactionId} className="border-b border-[#003399]/10">
      <td className="px-4 py-4"><p className="font-bold text-[#003399]">{item.userName}</p><p className="text-xs text-[#003399]/60">{item.schoolId} · {item.role}</p></td>
      <td className="px-4 py-4"><p className="font-bold text-[#003399]">{item.title}</p><p className="font-mono text-xs text-[#003399]/60">{item.accessionNumber ?? item.barcode}</p></td>
      <td className="px-4 py-4 text-xs text-[#003399]">{formatDate(item.borrowDate ?? item.requestedAt)}</td><td className="px-4 py-4 text-xs font-semibold text-[#003399]">{formatDate(item.dueDate)}</td><td className="px-4 py-4"><StatusBadge status={item.status === 'Pending' ? 'Pending claim' : item.status} /></td>
      <td className="px-4 py-4"><div className="flex justify-end gap-2">{item.status === 'Pending' ? <><button type="button" onClick={() => setSchoolId(item.schoolId)} className="rounded-lg border border-[#003399]/20 bg-[#FFFFFF] px-3 py-2 text-xs font-bold text-[#003399]">Verify borrower</button><button disabled={busyId === item.transactionId} onClick={() => { setCancelError(''); setCancelTarget(item) }} className="rounded-lg border border-[#003399]/20 bg-[#FFFFFF] px-3 py-2 text-xs font-bold text-[#003399] disabled:opacity-40">Cancel</button></> : <>{item.status === 'Overdue' ? <button disabled={busyId === item.transactionId} onClick={() => void penalty(item.transactionId)} className="rounded-lg bg-[#FFF200] px-3 py-2 text-xs font-bold text-[#003399] disabled:opacity-40">Calculate penalty</button> : null}<button disabled={busyId === item.transactionId} onClick={() => void completeReturn(item.transactionId)} className="rounded-lg bg-[#003399] px-3 py-2 text-xs font-bold text-[#FFFFFF] disabled:opacity-40">Process return</button></>}</div></td>
    </tr>) : <tr><td colSpan={6} className="px-4 py-10 text-center font-semibold text-[#003399]">{empty}</td></tr>}</tbody>
  </table></div>

  return <>
    <PageHeader eyebrow="Circulation desk" title="Borrow and return monitoring" action={<Button variant="secondary" onClick={() => void load()}><RefreshCw size={16} /> Refresh</Button>} />
    {error ? <div role="alert" className="mb-4 flex items-center gap-3 rounded-xl bg-[#FFF200] px-4 py-3 font-semibold text-[#003399]"><AlertTriangle size={18} />{error}</div> : null}
    {success ? <div role="status" className="mb-4 flex items-center gap-3 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-4 py-3 font-semibold text-[#003399]"><CheckCircle2 size={18} />{success}</div> : null}
    <form onSubmit={checkout} className="mb-5 grid gap-3 rounded-2xl border border-[#003399]/15 bg-[#FFFFFF] p-4 md:grid-cols-[1fr_1fr_auto]">
      <label className="text-xs font-bold text-[#003399]">Book barcode<input required autoFocus value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="Scan barcode then press Enter" className="mt-2 h-11 w-full rounded-xl border border-[#003399]/20 px-3 text-sm font-medium text-[#003399] outline-none focus:ring-4 focus:ring-[#003399]/10" /></label>
      <label className="text-xs font-bold text-[#003399]">Verified borrower school ID<input required value={schoolId} onChange={(event) => setSchoolId(event.target.value)} placeholder="Select a pending claimant or enter the presented school ID" className="mt-2 h-11 w-full rounded-xl border border-[#003399]/20 px-3 text-sm font-medium text-[#003399] outline-none focus:ring-4 focus:ring-[#003399]/10" /></label>
      <Button type="submit" className="self-end" onClick={undefined}>{submitting ? 'Confirming…' : <><ScanBarcode size={16} /> Confirm checkout</>}</Button>
    </form>
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><StatCard label="Pending claim" value={data?.summary.pendingClaims ?? 0} icon={ScanBarcode} tone="orange" /><StatCard label="Active claims" value={data?.summary.activeLoans ?? 0} icon={BookOpen} tone="blue" /><StatCard label="Due today" value={data?.summary.dueToday ?? 0} icon={CalendarClock} tone="orange" /><StatCard label="Overdue" value={data?.summary.overdueLoans ?? 0} icon={AlertTriangle} tone="red" /><StatCard label="Returned today" value={data?.summary.returnedToday ?? 0} icon={CheckCircle2} tone="blue" /></div>
    {loading && !data ? <SectionCard className="p-10 text-center font-semibold text-[#003399]">Loading circulation monitor…</SectionCard> : <div className="space-y-5"><SectionCard className="overflow-hidden"><div className="border-b border-[#003399]/15 px-5 py-4"><h2 className="font-bold text-[#003399]">Online carts pending counter claim</h2></div>{table(lanes.pending, 'No students are currently on the way to claim books.')}</SectionCard><SectionCard className="overflow-hidden"><div className="border-b border-[#003399]/15 px-5 py-4"><h2 className="font-bold text-[#003399]">Active material claims waiting for return</h2></div>{table(lanes.active, 'No active claims.')}</SectionCard><SectionCard className="overflow-hidden"><div className="border-b border-[#003399]/15 px-5 py-4"><h2 className="font-bold text-[#003399]">Overdue records</h2></div>{table(lanes.overdue, 'No overdue records.')}</SectionCard></div>}
    {cancelTarget ? <CancelBorrowRequestDialog title={cancelTarget.title} busy={busyId === cancelTarget.transactionId} error={cancelError} onCancel={() => { if (busyId === null) setCancelTarget(null) }} onConfirm={(reason) => void cancelPending(reason)} /> : null}
  </>
}
