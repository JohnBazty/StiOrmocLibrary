import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, PackageCheck } from 'lucide-react'
import { Button, PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { getCurrentIdentity } from '../auth/auth-storage'
import { reservationApi } from './reservation-api'
import { DialogShell, MoveDialog, SwapCopyDialog } from './ReservationQueueDialogs'
import type { ReservationFilters, ReservationQueueItem, ReservationStatus } from './types'
const field='min-h-11 w-full rounded-xl border border-[#0b5ea2]/20 bg-white px-3 text-sm text-[#0b5ea2]'
const initial:ReservationFilters={status:'active',dateFrom:'',dateTo:'',user:'',role:'',kind:'Reservation'}
const when=(s:string)=>new Date(s).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'})
const label=(r:ReservationQueueItem)=>r.statusLabel??({pending:'Waiting for a copy',approved:r.assignedCopyId?'Preparing':'Waiting for a copy',ready_for_pickup:'Ready for pickup',claimed:'Collected',expired:'Expired',cancelled:'Cancelled'}[r.status])
export function AdminReservationQueuePage() {
  const [filters,setFilters]=useState(()=>{
    const params=new URLSearchParams(window.location.search)
    const status=params.get('status')
    return {...initial,user:params.get('user')??'',status:status!==null&&['','active','approved','pending','ready_for_pickup','claimed','cancelled','expired'].includes(status)?status:params.has('user')?'':initial.status}
  }),[page,setPage]=useState(1)
  const query=useLiveQuery(`reservation-queue:${JSON.stringify(filters)}:${page}`,()=>reservationApi.queue(filters,page))
  const items=query.data?.items??[],pages=query.data?.pagination.pages??1,loading=query.loading,load=query.refresh
  const [busy,setBusy]=useState<number|null>(null),[actionError,setError]=useState(''),[success,setSuccess]=useState(''),[cancel,setCancel]=useState<ReservationQueueItem|null>(null),[swap,setSwap]=useState<ReservationQueueItem|null>(null),[move,setMove]=useState<{item:ReservationQueueItem;direction:'up'|'down'}|null>(null)
  const cart=filters.kind==='CartHandover'
  const workspace=getCurrentIdentity()?.role==='Staff'?'/staff':'/librarian'
  const error=actionError||query.error?.message||''
  function filter(value:Partial<ReservationFilters>){setFilters(f=>({...f,...value}));setPage(1)}
  async function update(r:ReservationQueueItem,status:ReservationStatus){setBusy(r.reservationId);setSuccess('');setError('');try{await reservationApi.adjustStatus(r.reservationId,status);setCancel(null);await load();setSuccess(status==='ready_for_pickup'?`${r.materialTitle} is ready. Its pickup timer has started.`:`${r.materialTitle} request cancelled.`)}catch(e){setError(e instanceof Error?e.message:'Request action failed.')}finally{setBusy(null)}}
  const done=(message:string)=>{setSwap(null);setMove(null);setSuccess(message);void load()}
  return <>
    <PageHeader eyebrow="Circulation desk" title="Book queue" description="Pull the assigned copy from its shelf. Mark ready only after it is set aside at the desk; this starts the pickup timer." action={<Button variant="secondary" onClick={()=>void load()}><RefreshCw size={16}/> Refresh</Button>}/>
    <p className="mb-5 text-sm opacity-75">{cart?'Carts for available books wait here until closing time, then cancel automatically. Confirm handover in Borrow & return.':'Only reservations for unavailable books appear here. Available-book carts are under Cart handovers.'} A request is a place in line, not a loan. Mark the assigned copy ready after setting it aside; confirm handover in Borrow & return when the borrower collects it.</p>
    {error?<p role="alert" className="auth-error mb-4 rounded-xl p-4">{error}</p>:null}
    {success?<p role="status" className="mb-4 rounded-xl bg-[#FFF200] p-4 font-semibold">{success}</p>:null}
    <SectionCard className="mb-5 p-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <select aria-label="Request kind" className={field} value={filters.kind} onChange={e=>filter({kind:e.target.value as ReservationFilters['kind'],status:'active'})}><option value="Reservation">Reservations</option><option value="CartHandover">Cart handovers</option></select>
      <input aria-label="Find borrower" placeholder="Name, school ID or email" className={field} value={filters.user} onChange={e=>filter({user:e.target.value})}/>
      <select aria-label="Request status" className={field} value={filters.status} onChange={e=>filter({status:e.target.value})}><option value="active">Active queue</option><option value="">All reservations and history</option><option value="approved">Preparing</option><option value="pending">Waiting for a copy</option><option value="ready_for_pickup">Ready for pickup</option><option value="claimed">Collected</option><option value="cancelled">Cancelled</option><option value="expired">Expired</option></select>
      <select aria-label="Borrower role" className={field} value={filters.role} onChange={e=>filter({role:e.target.value})}><option value="">Student + Faculty</option><option>Student</option><option>Faculty</option></select>
      <input aria-label="Requested from" className={field} type="date" value={filters.dateFrom} onChange={e=>filter({dateFrom:e.target.value})}/><input aria-label="Requested through" className={field} type="date" value={filters.dateTo} onChange={e=>filter({dateTo:e.target.value})}/>
    </div></SectionCard>
    {loading&&!items.length?<SectionCard className="p-8 text-center">Loading book requests…</SectionCard>:items.length?<div className="grid gap-4 xl:grid-cols-2">{items.map(r=>{const terminal=['claimed','cancelled','expired'].includes(r.status);return <SectionCard key={r.reservationId} className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold">Request #{r.reservationId} · {r.userRole}</p><h2 className="mt-1 text-lg font-bold">{r.materialTitle}</h2></div><StatusBadge status={label(r)}/></div>
      <p className="mt-3 font-bold">{r.userName}</p>{!terminal&&r.queuePosition!==null&&<p className="mt-2 text-sm font-semibold">Queue position #{r.queuePosition}</p>}{!terminal&&r.lastSkipReason?<p className="mt-1 text-sm font-semibold">Skipped: {r.lastSkipReason}{r.lastSkippedAt?`, ${when(r.lastSkippedAt)}`:''}</p>:null}<p className="break-all text-sm">{r.institutionalId}</p>
      <dl className="my-4 grid gap-3 rounded-xl bg-[#0b5ea2]/5 p-3 text-sm sm:grid-cols-2"><div><dt>Assigned barcode</dt><dd className="mt-1 break-all font-mono font-bold">{r.barcode??'Waiting for assignment'}</dd></div><div><dt>Accession number</dt><dd className="font-semibold">{r.accessionNumber??'Not assigned'}</dd></div><div><dt>Shelf location</dt><dd className="font-semibold">{r.shelfLocation??'Location not recorded'}</dd></div><div><dt>Requested</dt><dd>{when(r.reservedAt)}</dd></div></dl>
      {r.requestKind==='CartHandover'&&r.pickupDeadline&&!terminal?<p className="mb-3 text-sm font-bold">Auto-cancels {when(r.pickupDeadline)} (Philippine time)</p>:r.pickupDeadline?<p className="mb-3 text-sm font-bold">Pickup deadline: {when(r.pickupDeadline)} (Philippine time)</p>:!terminal?<p className="mb-3 text-sm">The pickup timer has not started.</p>:null}
      {r.emailStatus==='Failed'?<p role="status" className="mb-3 rounded-xl bg-[#FFF200] p-3 text-sm">Email delivery failed. The in-app notice is available; delivery retries automatically up to five attempts.</p>:null}
      <div className="flex flex-wrap gap-2">{r.status==='approved'&&r.barcode&&r.requestKind!=='CartHandover'?<Button disabled={busy!==null} onClick={()=>void update(r,'ready_for_pickup')}><PackageCheck size={16}/> {busy===r.reservationId?'Working…':'Mark ready'}</Button>:null}{r.status==='ready_for_pickup'?<Link className="inline-flex min-h-11 items-center rounded-xl bg-[#0b5ea2] px-4 text-sm font-bold text-white" to={`${workspace}/circulation?requestId=${r.reservationId}`}>Start checkout</Link>:null}{r.requestKind!=='CartHandover'&&['approved','ready_for_pickup'].includes(r.status)&&r.assignedCopyId?<Button variant="secondary" disabled={busy!==null} onClick={()=>setSwap(r)}>Swap copy</Button>:null}{r.requestKind!=='CartHandover'&&r.status==='pending'?<><Button variant="secondary" disabled={busy!==null||r.queuePosition===1} onClick={()=>setMove({item:r,direction:'up'})}>Move up</Button><Button variant="secondary" disabled={busy!==null} onClick={()=>setMove({item:r,direction:'down'})}>Move down</Button></>:null}{!terminal?<Button variant="secondary" disabled={busy!==null} onClick={()=>setCancel(r)}>Cancel request</Button>:null}</div>
    </SectionCard>})}</div>:<SectionCard className="p-10 text-center">{filters.status==='active'?cart?'No active cart handovers.':'No active reservations. Unavailable-book reservations will appear here.':'No book requests match these filters.'}</SectionCard>}
    <div className="mt-5 flex items-center justify-between gap-3"><Button variant="secondary" disabled={page<=1||loading} onClick={()=>setPage(p=>p-1)}>Previous</Button><span className="text-sm">Page {page} of {Math.max(1,pages)}</span><Button variant="secondary" disabled={page>=pages||loading} onClick={()=>setPage(p=>p+1)}>Next</Button></div>
    {swap?<SwapCopyDialog item={swap} onClose={()=>setSwap(null)} onDone={done}/>:null}
    {move?<MoveDialog item={move.item} direction={move.direction} onClose={()=>setMove(null)} onDone={done}/>:null}
    {cancel?<DialogShell titleId="cancel-request-title" title="Cancel this book request?" busy={busy!==null} onClose={()=>setCancel(null)}><p className="my-4">{cancel.materialTitle} for {cancel.userName}. The borrower will be notified and the held copy will be offered to the next eligible person waiting.</p><div className="flex justify-end gap-2"><Button variant="secondary" disabled={busy!==null} onClick={()=>setCancel(null)}>Keep request</Button><Button disabled={busy!==null} onClick={()=>void update(cancel,'cancelled')}>Confirm cancellation</Button></div></DialogShell>:null}
  </>
}
