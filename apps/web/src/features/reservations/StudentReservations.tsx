import {useLiveQuery} from '../../hooks/useLiveQuery'
import { RefreshCw, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { reservationApi } from './reservation-api'
import type { RequestHistoryItem } from './types'
import { BookCoverThumbnail } from '../catalog/BookCoverThumbnail'
import { ViewLocationButton } from '../floor-plan/ViewLocationButton'
import { getCurrentIdentity } from '../auth/auth-storage'
import { BorrowingSchedules } from './BorrowingSchedules'
import { pickupDateLabel } from './borrowing-schedule-api'
const labels:Record<string,string>={received:'Request received',waiting:'Waiting for a copy',preparing:'Preparing',ready_for_pickup:'Ready for pickup',claimed:'Collected',cancelled:'Cancelled',expired:'Expired'}
const when=(s:string)=>new Date(s).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'})
const day=(s:string)=>new Date(s).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium'})
export function StudentReservations() {
  const catalogPath = getCurrentIdentity()?.role === 'Faculty' ? '/faculty/library' : '/student/library'
  const [error,setError]=useState(''),[busyId,setBusyId]=useState<number|null>(null),[view,setView]=useState('active'),[page,setPage]=useState(1)
  const query=useLiveQuery('my-book-requests',()=>reservationApi.mine())
  const items=query.data??[],loading=query.loading
  const load=async()=>{await query.refresh()}
  const filtered=items.filter(item=>view==='history'?['claimed','cancelled','expired'].includes(item.status):['pending','approved','ready_for_pickup'].includes(item.status))
  const pages=Math.max(1,Math.ceil(filtered.length/10)),currentPage=Math.min(page,pages)
  async function cancel(id:number){setBusyId(id);setError('');try{await reservationApi.cancelMine(id);await load()}catch(e){setError(e instanceof Error?e.message:'The request could not be cancelled.')}finally{setBusyId(null)}}
  return <>
    <PageHeader eyebrow="My library" title="Requests & reservations" description="Track carts awaiting handover and reservations for unavailable books. Reservation pickup timers start only when staff mark a copy ready." action={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={()=>void load()}><RefreshCw size={16}/> Refresh</Button><Link to={catalogPath}><Button><Search size={16}/> Find a book</Button></Link></div>}/>
    <BorrowingSchedules/>
    {error||query.error?<p role="alert" className="auth-error mb-5 rounded-xl p-4">{error||query.error?.message}</p>:null}
    <label className="mb-4 block text-sm font-semibold">Show requests<select aria-label="Show requests" value={view} onChange={e=>{setView(e.target.value);setPage(1)}} className="ml-3 min-h-11 rounded-xl border bg-transparent px-3"><option value="active">Active requests</option><option value="history">Request history</option></select></label>
    {loading&&!query.data?<SectionCard className="p-10 text-center">Loading book requests…</SectionCard>:filtered.length?<div role="region" aria-label="My book request table" tabIndex={0} className="overflow-x-auto rounded-2xl border"><table className="w-full min-w-[850px] text-left text-sm"><caption className="sr-only">My requests and reservations</caption><thead><tr>{['Title','Request and date','Queue and status','Pickup and history','Actions'].map(h=><th key={h} scope="col" className="p-4">{h}</th>)}</tr></thead><tbody>{filtered.slice((currentPage-1)*10,currentPage*10).map(item=>{
      const cancellable=['pending','approved','ready_for_pickup'].includes(item.status)
      const state=item.statusLabel??(item.requestKind!=='CartHandover'&&item.status==='pending'?'Waiting for a copy':item.status==='approved'?(item.barcode?'Preparing':'Waiting for a copy'):labels[item.status])
      return <tr key={item.reservationId} className="border-t align-top"><td className="p-4"><div className="flex gap-3"><BookCoverThumbnail title={item.title} coverImagePath={item.coverImagePath} className="h-24 w-16"/><div className="min-w-0"><h2 className="max-w-xs break-words font-bold">{item.title}</h2><p className="mt-2 text-xs">Current condition: {item.conditionStatus??'Awaiting copy assignment'}</p></div></div></td><td className="p-4"><p>{item.requestKind==='CartHandover'?'Cart handover':'Reservation'}</p><p className="mt-2 text-xs">Requested {when(item.reservedAt)}</p></td><td className="p-4"><StatusBadge status={state}/>{item.requestKind!=='CartHandover'&&item.status==='pending'?<p className="mt-3">Queue position #{item.queuePosition}</p>:null}</td><td className="max-w-sm p-4">
        <p className="mt-4 rounded-xl bg-[#0b5ea2]/5 p-3 text-sm">{item.instructions??(state==='Preparing'?'Staff are preparing your copy. Wait for the Ready for pickup notice.':'Check this page for request updates.')}</p>
        {item.scheduledPickupDate?<p className="mt-3 text-sm">Scheduled pickup: {pickupDateLabel(item.scheduledPickupDate)}</p>:null}
        {item.pickupDeadline?<p className="mt-3 text-sm font-bold">Pickup deadline: {when(item.pickupDeadline)} (Philippine time)</p>:cancellable&&item.requestKind!=='CartHandover'?<p className="mt-3 text-sm">Pickup timer not started.</p>:null}
        {item.requestKind!=='CartHandover'&&item.status==='pending'?<p className="mt-3 text-sm">Queue position #{item.queuePosition}</p>:null}
        {item.waitingExpiresAt?<p className="mt-3">Expires on {day(item.waitingExpiresAt)}</p>:null}
        {item.barcode?<p className="mt-3 break-all text-sm">Assigned copy: <span className="font-mono">{item.barcode}</span></p>:null}
        {item.emailStatus==='Failed'?<p className="mt-3 text-sm">Email notice is delayed. Your request and in-app updates are saved.</p>:null}
        {item.events?.length?<details className="mt-4"><summary className="cursor-pointer text-sm font-bold">Request history</summary><ol className="mt-3 space-y-2 border-l border-[#0b5ea2]/20 pl-3">{item.events.map(e=><li key={e.status} className="text-xs"><strong>{labels[e.status]??e.status}</strong><span className="ml-2">{when(e.at)}</span></li>)}</ol></details>:null}
        </td><td className="p-4"><div className="flex flex-col items-start gap-3">{item.titleId?<ViewLocationButton titleId={item.titleId} barcode={item.status==='ready_for_pickup'?item.barcode:null}/>:null}{cancellable?<Button variant="secondary" disabled={busyId!==null} onClick={()=>void cancel(item.reservationId)}>{busyId===item.reservationId?'Cancelling…':'Cancel request'}</Button>:null}</div>
      </td></tr>
    })}</tbody></table></div>:<SectionCard className="p-10 text-center">No requests in this view. Choose Find a book to browse the catalog.</SectionCard>}
    <div className="mt-4 flex items-center justify-between"><Button variant="secondary" disabled={currentPage<=1} onClick={()=>setPage(currentPage-1)}>Previous</Button><span className="text-sm tabular-nums">Page {currentPage} of {pages}</span><Button variant="secondary" disabled={currentPage>=pages} onClick={()=>setPage(currentPage+1)}>Next</Button></div>
  </>
}
