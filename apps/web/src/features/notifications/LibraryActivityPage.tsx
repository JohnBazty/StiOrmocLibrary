import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, ArrowUpRight, BookOpen, CalendarCheck, Printer, RefreshCw } from 'lucide-react'
import { Button, PageHeader, SectionCard } from '../../components/ui'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { notificationApi } from './notification-api'

const categories = [['all','All activity'],['borrowing','Borrowing & returns'],['reservations','Reservations & carts'],['attendance','Attendance'],['printing','Printing & payments']]
const icons = {borrowing: BookOpen, reservations: BookOpen, attendance: CalendarCheck, printing: Printer}
const timestamp = (value:string) => new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'})

export function LibraryActivityPage() {
  const [category,setCategory] = useState('all')
  const query = useLiveQuery(`library-activity:${category}`,signal=>notificationApi.activity(category,signal))
  return <>
    <PageHeader eyebrow="Library operations" title="Recent library activity"
      description="See what happened across the library. Updates appear automatically; routine activity does not add to your unread alerts."
      action={<Button variant="secondary" disabled={query.loading} onClick={()=>void query.refresh()}><RefreshCw size={16}/>Refresh</Button>}/>
    <p className="mb-5 text-sm leading-6 opacity-70">Updates appear automatically. Routine activity does not add to your unread alerts. Use View related records to open the matching borrower’s records.</p>
    <SectionCard className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#003399]/10 p-5 dark:border-white/10">
        <div className="flex items-center gap-3"><Activity size={22}/><div><h2 className="font-bold">Latest activity</h2><p className="text-xs opacity-65">Up to 50 latest events · Philippine time</p></div></div>
        <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">Show
          <select value={category} onChange={event=>setCategory(event.target.value)} className="min-h-11 max-w-full rounded-xl border border-[#003399]/20 bg-white px-3 text-[#003399] dark:border-white/20 dark:bg-[#001a4d] dark:text-white">
            {categories.map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select>
        </label>
      </div>
      {query.error ? <p role="alert" className="m-5 rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">Activity updates are temporarily unavailable. {query.error.message} Use Refresh to try again.</p> : null}
      {!query.data && query.loading ? <p role="status" className="p-8 text-sm opacity-65">Loading library activity…</p> : null}
      {query.data?.items.length ? <ul className="divide-y divide-[#003399]/10 dark:divide-white/10">{query.data.items.map(item=>{
        const Icon = icons[item.category as keyof typeof icons] ?? Activity
        return <li key={item.id} className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#003399]/10 dark:bg-white/10"><Icon size={19}/></span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">{item.title}</p>
            <p className="mt-1 break-words text-sm font-semibold">{item.person}{item.schoolId ? ` · ${item.schoolId}` : ''}</p>
            {item.resource ? <p className="mt-1 break-words text-sm">{item.resource}</p> : null}
            <p className="mt-1 break-words text-sm opacity-70">{item.body}</p>
            <p className="mt-2 text-xs opacity-60">{item.reference} · <time dateTime={item.createdAt}>{timestamp(item.createdAt)}</time></p>
            <Link to={item.actionPath} className="mt-3 inline-flex min-h-11 items-center gap-1 rounded-xl border border-[#003399]/20 px-3 text-sm font-semibold hover:bg-[#003399]/5 dark:border-white/20 dark:hover:bg-white/10">View related records<ArrowUpRight size={16}/></Link>
          </div>
        </li>
      })}</ul> : query.data ? <p className="p-8 text-sm opacity-65">No activity recorded for this selection.</p> : null}
      {query.data?.hasMore ? <p className="border-t border-[#003399]/10 p-5 text-sm opacity-70 dark:border-white/10">Showing the latest 50 events. Choose an activity type to narrow the list, or open Book Reports for older records.</p> : null}
    </SectionCard>
  </>
}
