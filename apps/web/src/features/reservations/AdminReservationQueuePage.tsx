import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, CheckCircle2, Clock3, PackageCheck, RefreshCw, Search, X } from 'lucide-react'
import { PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { reservationApi, ReservationApiError } from './reservation-api'
import type { ReservationFilters, ReservationQueueItem, ReservationStatus } from './types'

const inputClass = 'h-10 w-full rounded-xl border border-[#003399]/20 bg-white px-3 text-sm text-[#003399] outline-none focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10'
const initialFilters: ReservationFilters = { status: '', dateFrom: '', dateTo: '', user: '', role: '' }

export function AdminReservationQueuePage() {
  const [items, setItems] = useState<ReservationQueueItem[]>([])
  const [filters, setFilters] = useState(initialFilters)
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { const result = await reservationApi.queue(filters); setItems(result.items); setError(null) }
    catch (reason) {
      const apiError = reason as ReservationApiError
      setError({ title: apiError.code === 'STUDENT_BORROW_LIMIT_REACHED' ? 'Transaction Blocked' : 'Reservation queue unavailable', message: apiError.code === 'STUDENT_BORROW_LIMIT_REACHED' ? 'Students cannot exceed 2 books' : apiError.message })
    } finally { setLoading(false) }
  }, [filters])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 180); return () => window.clearTimeout(timer) }, [load])

  async function changeStatus(item: ReservationQueueItem, status: ReservationStatus) {
    setUpdatingId(item.reservationId); setSuccess(null)
    try { await reservationApi.adjustStatus(item.reservationId, status); setSuccess(`${item.materialTitle} is now ${status.replaceAll('_', ' ')}.`); await load() }
    catch (reason) {
      const apiError = reason as ReservationApiError
      setError({ title: apiError.code === 'STUDENT_BORROW_LIMIT_REACHED' ? 'Transaction Blocked' : 'Status update blocked', message: apiError.code === 'STUDENT_BORROW_LIMIT_REACHED' ? 'Students cannot exceed 2 books' : apiError.message })
    } finally { setUpdatingId(null) }
  }

  const counts = useMemo(() => ({
    pending: items.filter((item) => item.status === 'pending').length,
    ready: items.filter((item) => item.status === 'ready_for_pickup').length,
    claimed: items.filter((item) => item.status === 'claimed').length,
  }), [items])

  return <>
    <PageHeader eyebrow="Circulation desk" title="Reservation queue management" description="Approve requests, assign available accessions, monitor pickup deadlines, and confirm claimed materials." action={<button onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#003399] bg-white px-4 text-sm font-bold text-[#003399]"><RefreshCw size={16} /> Refresh queue</button>} />
    {error ? <div role="alert" className="mb-5 flex items-start justify-between rounded-xl border border-[#FFF200] bg-[#FFF200] px-4 py-3 text-[#003399]"><div><p className="font-black">{error.title}</p><p className="mt-0.5 text-sm font-semibold">{error.message}</p></div><button aria-label="Dismiss" onClick={() => setError(null)}><X size={17} /></button></div> : null}
    {success ? <div role="status" className="mb-5 flex items-center justify-between rounded-xl border border-[#003399] bg-white px-4 py-3 text-sm font-bold text-[#003399]"><span>{success}</span><button onClick={() => setSuccess(null)}><X size={16} /></button></div> : null}

    <div className="mb-5 grid gap-3 sm:grid-cols-3"><SectionCard className="p-5"><Clock3 className="text-[#003399]" /><p className="mt-3 text-xs font-bold uppercase text-[#003399]/60">Pending approval</p><p className="mt-1 text-3xl font-black text-[#003399]">{counts.pending}</p></SectionCard><SectionCard className="p-5"><PackageCheck className="text-[#003399]" /><p className="mt-3 text-xs font-bold uppercase text-[#003399]/60">Ready for pickup</p><p className="mt-1 text-3xl font-black text-[#003399]">{counts.ready}</p></SectionCard><SectionCard className="p-5"><CheckCircle2 className="text-[#003399]" /><p className="mt-3 text-xs font-bold uppercase text-[#003399]/60">Claimed</p><p className="mt-1 text-3xl font-black text-[#003399]">{counts.claimed}</p></SectionCard></div>

    <SectionCard className="mb-5 p-5"><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5"><label className="relative"><Search className="absolute left-3 top-3 text-[#003399]/45" size={16} /><input value={filters.user} onChange={(event) => setFilters({ ...filters, user: event.target.value })} placeholder="User name, ID, email" className={`${inputClass} pl-9`} /></label><select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className={inputClass}><option value="">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="ready_for_pickup">Ready for pickup</option><option value="claimed">Claimed</option><option value="cancelled">Cancelled</option><option value="expired">Expired</option></select><select value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })} className={inputClass}><option value="">Student + Faculty</option><option>Student</option><option>Faculty</option></select><input aria-label="Reserved from" type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} className={inputClass} /><input aria-label="Reserved through" type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} className={inputClass} /></div></SectionCard>

    <SectionCard className="overflow-hidden"><div className="border-b border-[#003399]/15 px-5 py-4"><h2 className="font-bold text-[#003399]">Active and historical queue</h2><p className="text-xs text-[#003399]/60">Oldest eligible requests are processed first.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-[#003399] text-white"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Material</th><th className="px-4 py-3">Reservation date</th><th className="px-4 py-3">Accession / barcode</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={7} className="px-4 py-10 text-center text-[#003399]">Loading reservation queue…</td></tr> : items.length ? items.map((item) => { const busy = updatingId === item.reservationId; const terminal = ['expired', 'claimed', 'cancelled'].includes(item.status); return <tr key={item.reservationId} className="border-b border-[#003399]/10"><td className="px-4 py-4"><p className="font-bold text-[#003399]">{item.userName}</p><p className="text-xs text-[#003399]/60">{item.institutionalId}</p></td><td className="px-4 py-4 text-[#003399]">{item.userRole}</td><td className="px-4 py-4"><p className="font-bold text-[#003399]">{item.materialTitle}</p><p className="text-xs text-[#003399]/60">{item.categoryName ?? item.materialType} · Queue #{item.queuePosition}</p></td><td className="px-4 py-4 text-xs text-[#003399]">{new Date(item.reservedAt).toLocaleString()}</td><td className="px-4 py-4 font-mono text-xs text-[#003399]">{item.accessionNumber ?? item.barcode ?? 'Not assigned'}</td><td className="px-4 py-4"><StatusBadge status={item.status} />{item.pickupDeadline ? <p className="mt-1 text-[10px] text-[#003399]/60">Due {new Date(item.pickupDeadline).toLocaleString()}</p> : null}</td><td className="px-4 py-4"><div className="flex justify-end gap-2">{item.status === 'pending' ? <button disabled={busy} onClick={() => void changeStatus(item, 'approved')} className="rounded-lg bg-[#003399] px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Approve</button> : null}{item.status === 'approved' ? <button disabled={busy} onClick={() => void changeStatus(item, 'ready_for_pickup')} className="rounded-lg bg-[#FFF200] px-3 py-2 text-xs font-bold text-[#003399] disabled:opacity-40">Mark ready</button> : null}{item.status === 'ready_for_pickup' ? <button disabled={busy} onClick={() => void changeStatus(item, 'claimed')} className="rounded-lg bg-[#003399] px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Confirm claimed</button> : null}{!terminal ? <button disabled={busy} onClick={() => void changeStatus(item, 'cancelled')} className="rounded-lg border border-[#003399]/20 bg-white px-3 py-2 text-xs font-bold text-[#003399] disabled:opacity-40">Cancel</button> : <span title="No actions are available for completed, cancelled, or expired reservations." className="rounded-lg bg-[#003399]/5 px-3 py-2 text-xs font-bold text-[#003399]/35">Closed</span>}</div></td></tr> }) : <tr><td colSpan={7} className="px-4 py-10 text-center text-[#003399]">No reservations match these filters.</td></tr>}</tbody></table></div></SectionCard>
  </>
}

