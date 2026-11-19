import { UrgentCases } from '../fines/UrgentCases'
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Button, PageHeader } from '../../components/ui'
import { dashboardApi } from './dashboard-api'
import { deskDashboardApi, type DeskTaskFilters } from './desk-dashboard-api'
import { useDashboardResource } from './useDashboardResource'
import { DashboardActionCards } from './DashboardActionCards'
import { DashboardTaskTable } from './DashboardTaskTable'
import { CollectionSnapshot } from './CollectionSnapshot'
import { DashboardAnalytics } from './DashboardAnalytics'
import { RefundRequestsNotice } from '../payments/RefundRequestsNotice'
const initial:DeskTaskFilters={tab:'overdue',department:'',program:'',level:'',q:'',page:1}
export function AdminDashboardPage(){
 const [refreshKey,setRefreshKey]=useState(0),[days,setDays]=useState(30),[filters,setFilters]=useState(initial),[reminderRequest,setReminderRequest]=useState(0),[reminderBusy,setReminderBusy]=useState(false)
 const loader=useCallback((signal:AbortSignal)=>deskDashboardApi.overview(days,signal),[days])
 const overview=useDashboardResource(loader,refreshKey)
 const analyticsLoader=useCallback(()=>dashboardApi.admin(),[])
 const analytics=useDashboardResource(analyticsLoader,refreshKey)
 const changed=useCallback(()=>setRefreshKey(value=>value+1),[])
 function select(tab:DeskTaskFilters['tab']){setFilters(current=>({...current,tab,page:1}));document.getElementById('desk-task-list')?.scrollIntoView({block:'start'})}
 return <>
  <PageHeader eyebrow="Library overview" title="Admin dashboard" action={<div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={overview.loading||analytics.loading} onClick={changed}><RefreshCw size={16}/>{overview.loading||analytics.loading?'Refreshing…':'Refresh dashboard'}</Button><Link to="/librarian/circulation" className="inline-flex min-h-11 items-center rounded-xl border border-current/15 px-4 text-sm font-semibold">Open full counter</Link></div>}/>
  <DashboardActionCards reminderBusy={reminderBusy} data={overview.data} onSelect={select} onRemind={()=>{setReminderRequest(value=>value+1);document.getElementById('desk-task-list')?.scrollIntoView({block:'start'})}}/>
  <RefundRequestsNotice/>
  <DashboardTaskTable filters={filters} setFilters={setFilters} overview={overview.data} refreshKey={refreshKey} onChanged={changed} reminderRequest={reminderRequest} onReminderBusy={setReminderBusy}/>
  <UrgentCases/>
  <section aria-labelledby="dashboard-analytics-heading" className="mb-6">
   <div className="mb-3"><h2 id="dashboard-analytics-heading" className="text-balance text-xl font-bold">Library analytics</h2></div>
   {analytics.error?<p role="alert" className="auth-error mb-4 rounded-xl p-4 text-sm">{analytics.error} {analytics.data?'Showing last confirmed analytics.':''}<button onClick={changed} className="ml-2 min-h-11 font-bold underline">Retry analytics</button></p>:null}
   {analytics.data?<DashboardAnalytics data={analytics.data}/>:!analytics.error?<div role="status" aria-label="Loading analytics" className="grid gap-3 md:grid-cols-2">{[1,2].map(item=><div key={item} aria-hidden="true" className="h-32 rounded-2xl bg-slate-100 dark:bg-white/5"/>)}<span className="sr-only">Loading analytics…</span></div>:null}
   {overview.error?<p role="alert" className="auth-error my-4 rounded-xl p-4 text-sm">{overview.error} {overview.data?'Showing last confirmed totals.':''}<button onClick={changed} className="ml-2 min-h-11 font-bold underline">Retry totals</button></p>:null}
   <div className="mt-4"><CollectionSnapshot data={overview.data} days={days} onDays={setDays}/></div>
  </section>
  <p className="mt-4 text-right text-xs opacity-75">{analytics.data?'Last confirmed '+new Date(analytics.data.generatedAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'}):'Waiting for analytics'} · {overview.loading||analytics.loading?'Updating…':'Refreshes every 30 seconds while visible'}</p>
 </>
}
