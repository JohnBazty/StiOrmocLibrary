import { AlertTriangle, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { reservationApi } from './reservation-api'
import type { ReservationStatus } from './types'
import { BookCoverThumbnail } from '../catalog/BookCoverThumbnail'

type Item = { reservationId: number; title: string; coverImagePath: string | null; queuePosition: number; status: ReservationStatus; reservedAt: string; pickupDeadline: string | null; accessionNumber: string | null; barcode: string | null; conditionStatus: string | null }

export function StudentReservations() {
  const [items, setItems] = useState<Item[]>([]); const [loading, setLoading] = useState(true)
  const [error, setError] = useState(''); const [busyId, setBusyId] = useState<number | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await reservationApi.mine()); setError('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Reservations are unavailable.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  async function cancel(id: number) {
    setBusyId(id); setError('')
    try { await reservationApi.cancelMine(id); await load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The reservation could not be cancelled.') }
    finally { setBusyId(null) }
  }
  return <>
    <PageHeader eyebrow="My library" title="Book reservations" action={<div className="flex gap-2"><Button variant="secondary" onClick={() => void load()}><RefreshCw size={16} /> Refresh</Button><Link to="/student/catalog"><Button><Search size={16} /> Find a book</Button></Link></div>} />
    {error ? <div role="alert" className="mb-5 flex items-center gap-3 rounded-xl bg-[#FFF200] px-4 py-3 font-semibold text-[#003399]"><AlertTriangle size={18} />{error}</div> : null}
    {loading ? <SectionCard className="p-10 text-center font-semibold text-[#003399]">Loading reservations…</SectionCard> : items.length ? <div className="grid gap-4 lg:grid-cols-2">{items.map((item) => {
      const cancellable = ['pending', 'approved', 'ready_for_pickup'].includes(item.status)
      return <SectionCard key={item.reservationId} className="p-5"><div className="flex items-start gap-4"><BookCoverThumbnail title={item.title} coverImagePath={item.coverImagePath} className="h-24 w-16" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#003399]/55">Reserved book</p><StatusBadge status={item.status} /></div><h2 className="mt-2 font-bold text-[#003399]">{item.title}</h2><p className="mt-1 text-xs text-[#003399]/65">Requested {new Date(item.reservedAt).toLocaleString()}</p><p className="mt-2 inline-flex rounded-full border border-[#003399]/20 bg-[#FFFFFF] px-2.5 py-1 text-[11px] font-bold text-[#003399]">Current condition: {item.conditionStatus ?? 'Awaiting copy assignment'}</p></div></div><div className="mt-5 flex items-center justify-between rounded-xl bg-[#003399]/5 p-3"><div><p className="text-[11px] font-semibold uppercase text-[#003399]/45">Queue position</p><p className="mt-0.5 text-lg font-bold text-[#003399]">#{item.queuePosition}</p></div>{cancellable ? <button disabled={busyId === item.reservationId} onClick={() => void cancel(item.reservationId)} className="rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-4 py-2 text-sm font-bold text-[#003399] disabled:opacity-40">{busyId === item.reservationId ? 'Cancelling…' : 'Cancel request'}</button> : null}</div></SectionCard>
    })}</div> : <SectionCard className="p-10 text-center font-semibold text-[#003399]">You have no reservation records.</SectionCard>}
  </>
}
