import { RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { reservationApi } from './reservation-api'
import type { RequestHistoryItem } from './types'
import { BookCoverThumbnail } from '../catalog/BookCoverThumbnail'
import { ViewLocationButton } from '../floor-plan/ViewLocationButton'
import { getCurrentIdentity } from '../auth/auth-storage'
const labels:Record<string,string>={received:'Request received',waiting:'Waiting for a copy',preparing:'Preparing',ready_for_pickup:'Ready for pickup',claimed:'Collected',cancelled:'Cancelled',expired:'Expired'}
const when=(s:string)=>new Date(s).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'})
export function StudentReservations() {
  const catalogPath = getCurrentIdentity()?.role === 'Faculty' ? '/faculty/library' : '/student/library'
  const [items,setItems]=useState<RequestHistoryItem[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busyId,setBusyId]=useState<number|null>(null)
  const load=useCallback(async()=>{setLoading(true);try{setItems(await reservationApi.mine());setError('')}catch(e){setError(e instanceof Error?e.message:'Book requests unavailable.')}finally{setLoading(false)}},[])
  useEffect(()=>{void load();const t=setInterval(()=>void load(),30000);return()=>clearInterval(t)},[load])
  async function cancel(id:number){setBusyId(id);setError('');try{await reservationApi.cancelMine(id);await load()}catch(e){setError(e instanceof Error?e.message:'The request could not be cancelled.')}finally{setBusyId(null)}}
  return <>
    <PageHeader eyebrow="My library" title="Requests & reservations" description="Track carts awaiting handover and reservations for unavailable books. Reservation pickup timers start only when staff mark a copy ready." action={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={()=>void load()}><RefreshCw size={16}/> Refresh</Button><Link to={catalogPath}><Button><Search size={16}/> Find a book</Button></Link></div>}/>
    {error?<p role="alert" className="auth-error mb-5 rounded-xl p-4">{error}</p>:null}
    {loading&&!items.length?<SectionCard className="p-10 text-center">Loading book requests…</SectionCard>:items.length?<div className="grid gap-4 lg:grid-cols-2">{items.map(item=>{
      const cancellable=['pending','approved','ready_for_pickup'].includes(item.status)
      const state=item.statusLabel??(item.requestKind!=='CartHandover'&&item.status==='pending'?'Waiting for a copy':item.status==='approved'?(item.barcode?'Preparing':'Waiting for a copy'):labels[item.status])
      return <SectionCard key={item.reservationId} className="p-5"><div className="flex items-start gap-4"><BookCoverThumbnail title={item.title} coverImagePath={item.coverImagePath} className="h-24 w-16"/><div className="min-w-0 flex-1"><p className="text-xs">{item.requestKind==='CartHandover'?'Cart handover':'Reservation'} #{item.reservationId}</p><h2 className="my-2 font-bold">{item.title}</h2><StatusBadge status={state}/><p className="mt-2 text-xs">Requested {when(item.reservedAt)}</p><p className="mt-2 text-xs">Current condition: {item.conditionStatus??'Awaiting copy assignment'}</p></div></div>
        <p className="mt-4 rounded-xl bg-[#0b5ea2]/5 p-3 text-sm">{item.instructions??(state==='Preparing'?'Staff are preparing your copy. Wait for the Ready for pickup notice.':'Check this page for request updates.')}</p>
        {item.pickupDeadline?<p className="mt-3 text-sm font-bold">Pickup deadline: {when(item.pickupDeadline)} (Philippine time)</p>:cancellable&&item.requestKind!=='CartHandover'?<p className="mt-3 text-sm">Pickup timer not started.</p>:null}
        {item.requestKind!=='CartHandover'&&item.status==='pending'?<p className="mt-3 text-sm">Queue position #{item.queuePosition}</p>:null}
        {item.barcode?<p className="mt-3 break-all text-sm">Assigned copy: <span className="font-mono">{item.barcode}</span></p>:null}
        {item.emailStatus==='Failed'?<p className="mt-3 text-sm">Email notice is delayed. Your request and in-app updates are saved.</p>:null}
        {item.events?.length?<details className="mt-4"><summary className="cursor-pointer text-sm font-bold">Request history</summary><ol className="mt-3 space-y-2 border-l border-[#0b5ea2]/20 pl-3">{item.events.map(e=><li key={e.status} className="text-xs"><strong>{labels[e.status]??e.status}</strong><span className="ml-2">{when(e.at)}</span></li>)}</ol></details>:null}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">{item.titleId?<ViewLocationButton titleId={item.titleId} barcode={item.status==='ready_for_pickup'?item.barcode:null}/>:null}{cancellable?<Button variant="secondary" disabled={busyId!==null} onClick={()=>void cancel(item.reservationId)}>{busyId===item.reservationId?'Cancelling…':'Cancel request'}</Button>:null}</div>
      </SectionCard>
    })}</div>:<SectionCard className="p-10 text-center">You have no book requests.</SectionCard>}
  </>
}
