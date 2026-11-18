import { useLiveQuery } from '../../hooks/useLiveQuery'
import { RefreshCw, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { reservationApi } from './reservation-api'
import { BookCoverThumbnail } from '../catalog/BookCoverThumbnail'
import { ViewLocationButton } from '../floor-plan/ViewLocationButton'
import { getCurrentIdentity } from '../auth/auth-storage'
const labels:Record<string,string>={received:'Request received',waiting:'Waiting for a copy',preparing:'Preparing',ready_for_pickup:'Ready for pickup',claimed:'Collected',cancelled:'Cancelled',expired:'Expired'}
const when=(s:string)=>new Date(s).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'})
export function StudentReservations() {
  const catalogPath = getCurrentIdentity()?.role === 'Faculty' ? '/faculty/library' : '/student/library'
  const query=useLiveQuery('my-requests',()=>reservationApi.mine())
  const items=query.data??[],loading=query.loading,load=query.refresh
  const[actionError,setError]=useState(''),[busyId,setBusyId]=useState<number|null>(null)
  const error=actionError||query.error?.message||''
  async function cancel(id:number){setBusyId(id);setError('');try{await reservationApi.cancelMine(id);await load()}catch(e){setError(e instanceof Error?e.message:'The request could not be cancelled.')}finally{setBusyId(null)}}
  return <>
    <PageHeader eyebrow="My library" title="Requests & reservations" description="Track carts awaiting handover and reservations for unavailable books. Reservation pickup timers start only when staff mark a copy ready." action={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={()=>void load()}><RefreshCw size={16}/> Refresh</Button><Link to={catalogPath} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0b5ea2] px-4 py-2 text-sm font-semibold text-white"><Search size={16} aria-hidden="true" /> Find a book</Link></div>}/>
    {error?<p role="alert" className="auth-error mb-5 rounded-xl p-4">{error}</p>:null}
    {loading&&!items.length?<SectionCard className="p-10 text-center">Loading book requests…</SectionCard>:items.length?<div className="grid gap-4 lg:grid-cols-2">{items.map(item=>{
      const cancellable=['pending','approved','ready_for_pickup'].includes(item.status)
      const state=item.statusLabel??(item.requestKind!=='CartHandover'&&item.status==='pending'?'Waiting for a copy':item.status==='approved'?(item.barcode?'Preparing':'Waiting for a copy'):labels[item.status])
      return <SectionCard key={item.reservationId} className="min-w-0 p-4 text-base leading-relaxed sm:p-6">
        <div className="flex items-start gap-4 sm:gap-5">
          <BookCoverThumbnail title={item.title} coverImagePath={item.coverImagePath} className="h-32 w-22 sm:h-36 sm:w-24" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-[#0b5ea2]/75 dark:text-white/75">{item.requestKind==='CartHandover'?'Cart handover':'Reservation'} #{item.reservationId}</p>
            <h2 className="mb-2 mt-1 break-words text-xl font-bold leading-tight sm:text-2xl">{item.title}</h2>
            <div className="[&>span]:text-sm"><StatusBadge status={state}/></div>
            <p className="mt-3 text-sm">Requested {when(item.reservedAt)}</p>
            <p className="mt-1 text-sm">Condition: {item.conditionStatus??'Awaiting copy assignment'}</p>
          </div>
        </div>
        <p className="mt-4 rounded-xl bg-[#0b5ea2]/5 p-3 text-base dark:bg-white/10">{item.instructions??(state==='Preparing'?'Staff are preparing your copy. Wait for the Ready for pickup notice.':'Check this page for request updates.')}</p>
        {item.pickupDeadline?<p className="mt-3 font-semibold">Pickup deadline: {when(item.pickupDeadline)} (Philippine time)</p>:cancellable&&item.requestKind!=='CartHandover'?<p className="mt-3">Pickup timer not started.</p>:null}
        {item.requestKind!=='CartHandover'&&item.status==='pending'?<p className="mt-3">Queue position #{item.queuePosition}</p>:null}
        {item.barcode?<p className="mt-3 text-sm">Assigned copy: <span className="break-all font-mono">{item.barcode}</span></p>:null}
        {item.emailStatus==='Failed'?<p className="mt-3">Email notice is delayed. Your request and in-app updates are saved.</p>:null}
        {item.events?.length?<details className="mt-4 border-t border-[#0b5ea2]/15 dark:border-white/15">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">Request history</summary>
          <ol className="space-y-2 border-l border-[#0b5ea2]/20 pl-3 text-sm dark:border-white/20">{item.events.map(e=><li key={e.status}><strong>{labels[e.status]??e.status}</strong><span className="block">{when(e.at)}</span></li>)}</ol>
        </details>:null}
        {(item.titleId || cancellable) ? <div className="flex flex-wrap items-center gap-x-3">
          {item.titleId?<ViewLocationButton titleId={item.titleId} barcode={item.status==='ready_for_pickup'?item.barcode:null}/>:null}
          {cancellable?<Button className="mt-4 min-h-11" variant="secondary" disabled={busyId!==null} onClick={()=>void cancel(item.reservationId)}>{busyId===item.reservationId?'Cancelling…':'Cancel request'}</Button>:null}
        </div>:null}
      </SectionCard>
    })}</div>:<SectionCard className="p-10 text-center">You have no book requests.</SectionCard>}
  </>
}
