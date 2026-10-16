import { Activity, BookCopy, BookOpen, CalendarDays, Download, LibraryBig, PhilippinePeso, RefreshCw, RotateCcw, UserCheck, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button, PageHeader, SectionCard, StatCard, StatusBadge, TableShell } from '../../components/ui'
import { dashboardApi } from './dashboard-api'
import type { AdminDashboardData } from './types'
import { Link } from 'react-router-dom'
import { WorkspaceTasks } from './WorkspaceTasks'

const peso=(value:number)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(value)
const count=(value:number)=>new Intl.NumberFormat('en-PH').format(value)
const first=(name:string)=>name.trim().split(/\s+/)[0]||'Administrator'

export function AdminDashboardPage(){
  const[data,setData]=useState<AdminDashboardData|null>(null);const[error,setError]=useState('');const[loading,setLoading]=useState(true)
  const load=useCallback(async()=>{setLoading(true);setError('');try{setData(await dashboardApi.admin())}catch(value){setError(value instanceof Error?value.message:'The dashboard could not be loaded.')}finally{setLoading(false)}},[])
  useEffect(()=>{void load()},[load])

  if(!data&&loading)return <DashboardLoading />
  if(!data)return <DashboardError message={error} retry={load}/>
  const k=data.kpis,max=Math.max(1,...data.weeklyAttendance.map(item=>item.value)),categoryMax=Math.max(1,...data.popularCategories.map(item=>item.value)),occupancyPercent=Math.min(100,Math.round(data.occupancy.current/data.occupancy.capacity*100))
  const cards=[
    ['Total books',count(k.totalBooks),BookCopy,'blue'],['Active borrowed',count(k.activeBorrowed),BookOpen,'violet'],['Available books',count(k.availableBooks),LibraryBig,'emerald'],['Overdue books',count(k.overdueBooks),CalendarDays,'red'],
    ['Active users',count(k.activeUsers),Users,'cyan'],['Daily attendance',count(k.dailyAttendance),UserCheck,'blue'],['Reservations',count(k.activeReservations),CalendarDays,'violet'],['Outstanding fines',peso(k.outstandingFines),PhilippinePeso,'orange'],
  ] as const
  return <>
    <PageHeader eyebrow="Library operations" title={`Good day, ${first(data.staff.name)}`} action={<div className="flex gap-2"><Button variant="secondary" disabled={loading} onClick={()=>void load()}><RefreshCw size={15}/>{loading?'Refreshing…':'Refresh'}</Button><Link to="/librarian/reports" className="inline-flex items-center rounded-xl bg-[#003399] px-4 py-2 text-sm font-bold text-white"><Download size={15} className="mr-2"/>View reports</Link></div>}/>
    {error?<div role="alert" className="mb-5 rounded-2xl bg-[#b42318] px-4 py-3 text-sm font-semibold text-white">{error}</div>:null}
    <WorkspaceTasks />
    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label,value,icon,tone],index)=><Link key={label} className="rounded-2xl transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-4" to={['/librarian/inventory','/librarian/circulation','/librarian/inventory','/librarian/circulation','/librarian/users','/librarian/attendance','/librarian/reservations','/librarian/fines'][index]}><StatCard label={label} value={value} icon={icon} tone={tone}/></Link>)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <SectionCard className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-[#003399]/45">Visitor analytics</p><h2 className="mt-1 font-display text-lg font-bold text-[#003399]">Weekly attendance</h2></div><span className="text-xs font-semibold text-[#003399]/55">Asia/Manila</span></div><div className="mt-8 flex h-52 items-end gap-3 sm:gap-5">{data.weeklyAttendance.map(item=><div key={item.label} className="flex h-full flex-1 flex-col justify-end gap-2"><div className="relative flex flex-1 items-end rounded-t-lg bg-[#003399]/5"><div style={{height:`${Math.max(item.value?8:0,item.value/max*100)}%`}} className="relative w-full rounded-t-lg bg-[#003399]"><span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-[#003399]">{item.value}</span></div></div><span className="text-center text-[10px] font-semibold text-[#003399]/45">{item.label}</span></div>)}</div></SectionCard>
      <SectionCard className="p-5"><p className="text-xs font-bold uppercase tracking-wider text-[#003399]/45">Collection demand</p><h2 className="mt-1 font-display text-lg font-bold text-[#003399]">Popular categories</h2><div className="mt-6 space-y-5">{data.popularCategories.length?data.popularCategories.map(item=><div key={item.label}><div className="mb-2 flex justify-between text-xs"><span className="font-semibold text-[#003399]">{item.label}</span><span className="text-[#003399]/45">{item.value} borrows</span></div><div className="h-2 overflow-hidden rounded-full bg-[#003399]/5"><div style={{width:`${item.value/categoryMax*100}%`}} className="h-full rounded-full bg-[#003399]"/></div></div>):<Empty text="No borrowing activity in the last 30 days."/>}</div></SectionCard>
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <TableShell title="Recent circulation"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-[#003399]/5 text-[11px] uppercase tracking-wider text-[#003399]/65"><tr><th className="px-5 py-3">User and resource</th><th className="px-5 py-3">Activity date</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{data.recentCirculation.map(item=><tr key={item.id}><td className="px-5 py-4"><p className="font-semibold text-[#003399]">{item.title}</p><p className="mt-1 text-xs text-[#003399]/65">{item.userName} · {item.schoolId} · {item.barcode}</p></td><td className="px-5 py-4 text-xs text-[#003399]/65">{item.eventAt}</td><td className="px-5 py-4"><StatusBadge status={item.status}/></td></tr>)}{!data.recentCirculation.length?<tr><td colSpan={3}><Empty text="No circulation activity yet."/></td></tr>:null}</tbody></table></TableShell>
      <SectionCard className="p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-[#003399]/45">Live conditions</p><h2 className="mt-1 font-display text-lg font-bold text-[#003399]">Occupied library seats</h2><p className="mt-1 text-xs">Peak occupied seats today: {data.occupancy.peakOccupancy??0} · Printing visits: {data.occupancy.serviceVisits??0}</p></div><Activity className="text-[#003399]" size={20}/></div><div className="mt-6 flex items-end gap-2"><span className="font-display text-5xl font-bold text-[#003399]">{data.occupancy.current}</span><span className="mb-1 text-sm text-[#003399]/45">of {data.occupancy.capacity} seats</span></div><div className="mt-4 h-3 overflow-hidden rounded-full bg-[#003399]/5"><div style={{width:`${occupancyPercent}%`}} className="h-full rounded-full bg-[#003399]"/></div><div className="mt-6 grid grid-cols-2 gap-3"><Mini label="Busiest arrival hour" value={data.occupancy.peakHour??'—'}/><Mini label="Avg. visit" value={data.occupancy.averageMinutes?`${data.occupancy.averageMinutes} min`:'—'}/></div></SectionCard>
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <SectionCard className="p-5"><p className="text-xs font-bold uppercase tracking-wider text-[#003399]/45">Attendance purpose today</p><h2 className="mt-1 font-display text-lg font-bold text-[#003399]">Why visitors came in</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{data.purposeBreakdown.map(item=><Mini key={item.label} label={item.label} value={String(item.value)}/>)}{!data.purposeBreakdown.length?<Empty text="No attendance recorded today."/>:null}</div></SectionCard>
      <SectionCard className="p-5"><p className="text-xs font-bold uppercase tracking-wider text-[#003399]/45">Operational feed</p><h2 className="mt-1 font-display text-lg font-bold text-[#003399]">Recent activity</h2><div className="mt-3 divide-y divide-[#003399]/10">{data.recentActivity.map(item=><div key={item.id} className="py-3"><p className="text-sm font-semibold text-[#003399]">{item.title}</p><p className="mt-1 line-clamp-2 text-xs text-[#003399]/65">{item.message}</p><p className="mt-1 text-[10px] text-[#003399]/45">{item.createdAt}</p></div>)}{!data.recentActivity.length?<Empty text="No recent operational events."/>:null}</div></SectionCard>
    </div>
    <p className="mt-4 text-right text-[11px] text-[#003399]/45">Last updated {new Date(data.generatedAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</p>
  </>
}

function DashboardLoading(){return <div className="space-y-4" aria-label="Loading dashboard"><div className="h-10 w-72 animate-pulse rounded-xl bg-[#003399]/10"/><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({length:8},(_,i)=><div key={i} className="h-28 animate-pulse rounded-2xl bg-[#003399]/5"/>)}</div></div>}
function DashboardError({message,retry}:{message:string;retry:()=>Promise<void>}){return <SectionCard className="p-8 text-center"><p className="font-display text-xl font-bold text-[#003399]">Dashboard unavailable</p><p role="alert" className="mt-4 rounded-xl p-4 text-sm">{message}</p><Button className="mt-5" onClick={()=>void retry()}><RotateCcw size={16}/>Try again</Button></SectionCard>}
function Empty({text}:{text:string}){return <p className="py-6 text-center text-sm text-[#003399]/45">{text}</p>}
function Mini({label,value}:{label:string;value:string}){return <div className="rounded-xl bg-[#003399]/5 p-3"><p className="text-[10px] font-bold uppercase text-[#003399]/45">{label}</p><p className="mt-1 font-bold text-[#003399]">{value}</p></div>}
