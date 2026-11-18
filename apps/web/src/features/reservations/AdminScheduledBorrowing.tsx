import { useEffect,useState } from 'react'
import { Button,SectionCard,StatusBadge } from '../../components/ui'
import { borrowingScheduleApi,pickupDateLabel,type ScheduleQueue,type ScheduleQueueFilters } from './borrowing-schedule-api'

const initial:ScheduleQueueFilters={user:'',role:'',dateFrom:'',dateTo:''}
const field='min-h-11 w-full rounded-xl border border-[#0b5ea2]/20 bg-white px-3 text-sm text-[#0b5ea2]'
const when=(date:string)=>new Date(date).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'})

export function AdminScheduledBorrowing({refreshKey}:{refreshKey:number}) {
  const [filters,setFilters]=useState(initial),[page,setPage]=useState(1)
  const [data,setData]=useState<ScheduleQueue>({available:true,items:[],pagination:{page:1,limit:25,total:0,pages:0}})
  const [loading,setLoading]=useState(true),[error,setError]=useState('')
  useEffect(()=>{
    const controller=new AbortController();let running=false
    async function load(){
      if(running)return
      running=true;setLoading(true)
      try{const result=await borrowingScheduleApi.queue(filters,page,controller.signal);if(!controller.signal.aborted){setData(result);setError('')}}
      catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Scheduled pickups could not be loaded.')}
      finally{running=false;if(!controller.signal.aborted)setLoading(false)}
    }
    const first=setTimeout(()=>void load(),180),timer=setInterval(()=>void load(),30000)
    return()=>{controller.abort();clearTimeout(first);clearInterval(timer)}
  },[filters,page,refreshKey])
  function filter(value:Partial<ScheduleQueueFilters>){setFilters(previous=>({...previous,...value}));setPage(1)}
  return <section aria-label="Scheduled pickups">
    <p className="mb-5 text-sm opacity-75">These future pickup requests do not hold copies yet. Preparation starts one open library day before pickup, subject to availability and borrowing limits. Prepared requests move to Book requests.</p>
    <SectionCard className="mb-5 p-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <input aria-label="Find scheduled borrower or book" placeholder="Borrower, school ID or book title" className={field} value={filters.user} onChange={e=>filter({user:e.target.value})}/>
      <select aria-label="Scheduled borrower role" className={field} value={filters.role} onChange={e=>filter({role:e.target.value})}><option value="">Student + Faculty</option><option>Student</option><option>Faculty</option></select>
      <label className="text-xs">Pickup from<input aria-label="Pickup from" className={field} type="date" value={filters.dateFrom} onChange={e=>filter({dateFrom:e.target.value})}/></label>
      <label className="text-xs">Pickup through<input aria-label="Pickup through" className={field} type="date" value={filters.dateTo} onChange={e=>filter({dateTo:e.target.value})}/></label>
    </div></SectionCard>
    {error?<p role="alert" className="auth-error mb-4 rounded-xl p-4">{error}</p>:null}
    {loading?<p role="status" className="mb-3 text-sm">{data.items.length?'Refreshing scheduled pickups…':'Loading scheduled pickups…'}</p>:null}
    {data.items.length?<><p className="mb-3 text-sm">{data.pagination.total} pending {data.pagination.total===1?'schedule':'schedules'}</p><div className="grid gap-4 xl:grid-cols-2">{data.items.map(item=><SectionCard key={item.scheduleId} className="p-5">
      <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-bold">{item.title}</h2><StatusBadge status="Scheduled"/></div>
      <p className="mt-3 font-bold">{item.userName}</p><p className="break-all text-sm">{item.schoolId} · {item.userRole}</p>
      <dl className="my-4 grid gap-3 rounded-xl bg-[#0b5ea2]/5 p-3 text-sm sm:grid-cols-2"><div><dt>Preferred pickup</dt><dd className="mt-1 font-bold">{pickupDateLabel(item.pickupDate)}</dd></div><div><dt>Preparation starts</dt><dd className="mt-1">{item.preparationStartsAt?when(item.preparationStartsAt):'Pickup calendar needs review'}</dd></div><div className="sm:col-span-2"><dt>Requested</dt><dd>{when(item.requestedAt)}</dd></div></dl>
      <p className="text-sm">{item.reason??'No copy held. Waiting for the preparation window.'}</p>
    </SectionCard>)}</div></>:!loading?<SectionCard className="p-10 text-center">{data.available?'No pending schedules match these filters.':'Scheduled borrowing is not available yet.'}</SectionCard>:null}
    <div className="mt-5 flex items-center justify-between gap-3"><Button variant="secondary" disabled={page<=1||loading} onClick={()=>setPage(p=>p-1)}>Previous</Button><span className="text-sm">Page {page} of {Math.max(1,data.pagination.pages)}</span><Button variant="secondary" disabled={page>=data.pagination.pages||loading} onClick={()=>setPage(p=>p+1)}>Next</Button></div>
  </section>
}
