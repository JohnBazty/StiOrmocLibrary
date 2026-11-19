import { Link } from 'react-router-dom'
import { SectionCard } from '../../components/ui'
import type { AdminDashboardData } from './types'

type AnalyticsData = Pick<AdminDashboardData, 'weeklyAttendance' | 'popularCategories'>

export function DashboardAnalytics({data}:{data:AnalyticsData}) {
  const attendanceMax=Math.max(1,...data.weeklyAttendance.map(item=>item.value))
  const categoryMax=Math.max(1,...data.popularCategories.map(item=>item.value))
  const hasVisits=data.weeklyAttendance.some(item=>item.value>0)
  const visits=data.weeklyAttendance.reduce((total,item)=>total+item.value,0)
  return <div className="grid min-w-0 items-start gap-3 md:grid-cols-2">
    <SectionCard className="min-w-0 p-4">
      <div className="flex items-start justify-between gap-3"><div><h3 className="text-balance text-base font-bold">Weekly attendance</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-300">This week · Asia/Manila</p></div><span className="shrink-0 rounded-lg bg-[#0b5ea2]/5 px-2.5 py-1 text-sm font-bold tabular-nums dark:bg-white/10">{visits} <span className="font-normal">{visits===1?'visit':'visits'}</span></span></div>
      {hasVisits?<ul aria-label="Daily attendance counts" className="mt-6 flex h-24 items-end gap-3 sm:gap-5">
        {data.weeklyAttendance.map(item=><li key={item.label} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-3"><div className="relative flex flex-1 items-end"><div aria-hidden="true" className="w-full rounded-t-lg bg-[#0b5ea2] dark:bg-blue-400" style={{height:item.value/attendanceMax*100+'%'}}/><span className="absolute left-1/2 -translate-x-1/2 text-xs font-semibold tabular-nums" style={{bottom:`calc(${item.value/attendanceMax*100}% + 4px)`}}>{item.value}</span></div><span className="text-center text-xs text-slate-600 dark:text-slate-300">{item.label}</span></li>)}
      </ul>:<div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 rounded-lg bg-slate-50 px-3 py-1 dark:bg-white/5"><p className="text-pretty text-sm text-slate-600 dark:text-slate-300">No visits recorded this week.</p><Link to="/librarian/attendance" className="inline-flex min-h-11 items-center text-sm font-semibold underline">Open attendance records</Link></div>}
    </SectionCard>
    <SectionCard className="min-w-0 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-balance text-base font-bold">Popular categories</h3><span className="text-xs text-slate-500 dark:text-slate-300">Last 30 days</span></div>
      {data.popularCategories.length?<ul aria-label="Borrowing counts by category" className="mt-3 space-y-3">{data.popularCategories.map(item=><li key={item.label}><div className="mb-1.5 flex items-start justify-between gap-3 text-sm"><span className="min-w-0 break-words font-semibold">{item.label}</span><span className="shrink-0 text-slate-600 tabular-nums dark:text-slate-300">{item.value} {item.value===1?'borrow':'borrows'}</span></div><div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className="h-full rounded-full bg-[#0b5ea2] dark:bg-blue-400" style={{width:item.value/categoryMax*100+'%'}}/></div></li>)}</ul>:<div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 rounded-lg bg-slate-50 px-3 py-1 dark:bg-white/5"><p className="text-pretty text-sm text-slate-600 dark:text-slate-300">No borrowing activity in the last 30 days.</p><Link to="/librarian/reports" className="inline-flex min-h-11 items-center text-sm font-semibold underline">Open collection reports</Link></div>}
    </SectionCard>
  </div>
}
