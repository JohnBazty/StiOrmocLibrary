import {useLiveQuery} from '../../hooks/useLiveQuery'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, LumoDialog, NoticeBanner, PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { reservationApi } from './reservation-api'
import type { RequestHistoryItem } from './types'
import { BookCoverThumbnail } from '../catalog/BookCoverThumbnail'
import { ViewLocationButton } from '../floor-plan/ViewLocationButton'
import { getCurrentIdentity } from '../auth/auth-storage'
import { BorrowingSchedules } from './BorrowingSchedules'
import { pickupDateLabel } from './borrowing-schedule-api'
import { RefreshButton } from '../../components/RefreshButton'
const labels:Record<string,string>={received:'Request received',waiting:'Waiting for a copy',preparing:'Preparing',ready_for_pickup:'Ready for pickup',claimed:'Collected',cancelled:'Cancelled',expired:'Expired'}
const when=(s:string)=>new Date(s).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'})
const day=(s:string)=>new Date(s).toLocaleDateString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium'})
export function StudentReservations() {
  const catalogPath = getCurrentIdentity()?.role === 'Faculty' ? '/faculty/library' : '/student/library'
  const [error,setError]=useState(''),[busyId,setBusyId]=useState<number|null>(null),[view,setView]=useState('active'),[page,setPage]=useState(1),[cancelTarget,setCancelTarget]=useState<RequestHistoryItem|null>(null)
  const query=useLiveQuery('my-book-requests',()=>reservationApi.mine())
  const items=query.data??[],loading=query.loading
  const load=async()=>{await query.refresh()}
  const filtered=items.filter(item=>view==='history'?['claimed','cancelled','expired'].includes(item.status):['pending','approved','ready_for_pickup'].includes(item.status))
  const pages=Math.max(1,Math.ceil(filtered.length/10)),currentPage=Math.min(page,pages)
  async function cancel(id:number){setBusyId(id);setError('');try{await reservationApi.cancelMine(id);setCancelTarget(null);await load()}catch(e){setError(e instanceof Error?e.message:'The request could not be cancelled.')}finally{setBusyId(null)}}
  return <>
    <PageHeader eyebrow="My library" title="Requests & reservations" description="Track carts awaiting handover and reservations for unavailable books. Reservation pickup timers start only when staff mark a copy ready." action={<div className="flex flex-wrap gap-2"><RefreshButton onRefresh={() => load()} variant="secondary" /><Link to={catalogPath}><Button><Search size={16}/> Find a book</Button></Link></div>}/>
    <BorrowingSchedules/>
    {error||query.error?<NoticeBanner tone="error">{error||query.error?.message}</NoticeBanner>:null}
    <label className="mb-4 inline-flex items-center gap-3 text-sm font-semibold text-[var(--sl-text-header)]">Show requests<select aria-label="Show requests" value={view} onChange={e=>{setView(e.target.value);setPage(1)}} className="sl-input w-auto"><option value="active">Active requests</option><option value="history">Request history</option></select></label>
    {loading&&!query.data?<SectionCard className="p-10 text-center text-sm text-[var(--sl-text-secondary)]">Loading book requests…</SectionCard>:filtered.length?<SectionCard className="overflow-hidden"><div role="region" aria-label="My book request table" tabIndex={0} className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><caption className="sr-only">My requests and reservations</caption><thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]"><tr>{['Title','Request and date','Queue and status','Pickup and history','Actions'].map(h=><th key={h} scope="col" className="px-4 py-3 text-xs font-semibold text-[var(--sl-text-header)]">{h}</th>)}</tr></thead><tbody className="divide-y divide-[var(--sl-border)]">{filtered.slice((currentPage-1)*10,currentPage*10).map(item=>{
      const cancellable=['pending','approved','ready_for_pickup'].includes(item.status)
      const state=item.statusLabel??(item.requestKind!=='CartHandover'&&item.status==='pending'?'Waiting for a copy':item.status==='approved'?(item.barcode?'Preparing':'Waiting for a copy'):labels[item.status])
      return <tr key={item.reservationId} className="align-top"><td className="p-4"><div className="flex gap-3"><BookCoverThumbnail title={item.title} coverImagePath={item.coverImagePath} className="h-24 w-16 rounded-[6px]"/><div className="min-w-0"><h2 className="max-w-xs break-words font-semibold text-[var(--sl-text-header)]">{item.title}</h2><p className="mt-1.5 text-xs text-[var(--sl-text-secondary)]">Current condition: {item.conditionStatus??'Awaiting copy assignment'}</p></div></div></td><td className="p-4"><p className="font-medium text-[var(--sl-text-header)]">{item.requestKind==='CartHandover'?'Cart handover':'Reservation'}</p><p className="mt-1.5 text-xs text-[var(--sl-text-secondary)]">Requested {when(item.reservedAt)}</p></td><td className="p-4"><StatusBadge status={state}/>{item.requestKind!=='CartHandover'&&item.status==='pending'?<p className="mt-2 text-xs font-medium text-[var(--sl-text-secondary)]">Queue position #{item.queuePosition}</p>:null}</td><td className="max-w-sm p-4">
        <p className="rounded-[8px] bg-[var(--sl-bg-subtle)] p-3 text-sm text-[var(--sl-text)]">{item.instructions??(state==='Preparing'?'Staff are preparing your copy. Wait for the Ready for pickup notice.':'Check this page for request updates.')}</p>
        {item.scheduledPickupDate?<p className="mt-2.5 text-sm text-[var(--sl-text-secondary)]">Scheduled pickup: {pickupDateLabel(item.scheduledPickupDate)}</p>:null}
        {item.pickupDeadline?<p className="mt-2.5 text-sm font-semibold text-[var(--sl-text-header)]">Pickup deadline: {when(item.pickupDeadline)} (Philippine time)</p>:cancellable&&item.requestKind!=='CartHandover'?<p className="mt-2.5 text-xs text-[var(--sl-text-muted)]">Pickup timer not started.</p>:null}
        {item.waitingExpiresAt?<p className="mt-2.5 text-sm text-[var(--sl-text-secondary)]">Expires on {day(item.waitingExpiresAt)}</p>:null}
        {item.barcode?<p className="mt-2.5 break-all text-xs text-[var(--sl-text-secondary)]">Assigned copy: <span className="font-mono font-semibold text-[var(--sl-text-header)]">{item.barcode}</span></p>:null}
        {item.emailStatus==='Failed'?<p className="mt-2.5 text-xs text-[var(--sl-text-muted)]">Email notice is delayed. Your request and in-app updates are saved.</p>:null}
        {item.events?.length?<details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-[#0b5ea2] dark:text-[#93c5fd]">Request history</summary><ol className="mt-2.5 space-y-1.5 border-l border-[var(--sl-border-strong)] pl-3">{item.events.map(e=><li key={e.status} className="text-xs text-[var(--sl-text-secondary)]"><strong className="text-[var(--sl-text-header)]">{labels[e.status]??e.status}</strong><span className="ml-2">{when(e.at)}</span></li>)}</ol></details>:null}
        </td><td className="p-4"><div className="flex flex-col items-start gap-2">{item.titleId?<ViewLocationButton titleId={item.titleId} barcode={item.status==='ready_for_pickup'?item.barcode:null}/>:null}{cancellable?<Button variant="secondary" size="sm" disabled={busyId!==null} onClick={()=>setCancelTarget(item)}>{busyId===item.reservationId?'Cancelling…':'Cancel request'}</Button>:null}</div>
      </td></tr>
    })}</tbody></table></div></SectionCard>:<SectionCard className="p-10 text-center text-sm text-[var(--sl-text-secondary)]">No requests in this view. Choose Find a book to browse the catalog.</SectionCard>}
    <div className="mt-4 flex items-center justify-between"><Button variant="secondary" size="sm" disabled={currentPage<=1} onClick={()=>setPage(currentPage-1)}>Previous</Button><span className="text-sm tabular-nums text-[var(--sl-text-secondary)]">Page {currentPage} of {pages}</span><Button variant="secondary" size="sm" disabled={currentPage>=pages} onClick={()=>setPage(currentPage+1)}>Next</Button></div>
    {cancelTarget ? (
      <LumoDialog
        role="alertdialog"
        size="sm"
        title="Cancel this book request?"
        busy={busyId !== null}
        onClose={() => { if (busyId === null) setCancelTarget(null) }}
        footer={
          <>
            <Button variant="secondary" disabled={busyId !== null} onClick={() => setCancelTarget(null)}>Keep request</Button>
            <Button variant="danger" disabled={busyId !== null} onClick={() => void cancel(cancelTarget.reservationId)}>
              {busyId === cancelTarget.reservationId ? 'Cancelling…' : 'Cancel request'}
            </Button>
          </>
        }
      >
        <p className="font-semibold text-[var(--sl-text-header)]">{cancelTarget.title}</p>
        <p className="mt-1.5 text-sm text-[var(--sl-text-secondary)]">Cancelling frees your borrowing slot and releases your place in the queue.</p>
      </LumoDialog>
    ) : null}
  </>
}
