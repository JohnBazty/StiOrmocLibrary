import { useLiveQuery } from '../../hooks/useLiveQuery'
import { fetchAdminNotifications, type AdminNotice as Notice } from './admin-notifications-api'
import { RefreshCw, UserRound } from 'lucide-react'

import { Link } from 'react-router-dom'
import { Button, PageHeader, SectionCard } from '../../components/ui'

const date = (value: string) => new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })

function NoticeCard({ notice }: { notice: Notice }) {
  return <li className="flex flex-wrap items-start gap-4 border-b border-[#0b5ea2]/10 p-5 last:border-b-0 dark:border-white/10">
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0b5ea2]/10 text-[#0b5ea2] dark:bg-white/10 dark:text-white"><UserRound size={20} /></span>
    <div className="min-w-0 flex-1">
      <p className="font-bold text-[#0b5ea2] dark:text-white">{notice.title}</p>
      <p className="mt-1 text-sm text-[#0b5ea2]/70 dark:text-white/70">{notice.body}</p>
      <p className="mt-2 text-xs text-[#0b5ea2]/50 dark:text-white/50">{date(notice.createdAt)}</p>
    </div>
    <Link to={notice.actionPath} className="rounded-xl border border-[#0b5ea2]/20 px-4 py-2 text-sm font-bold text-[#0b5ea2] hover:bg-[#0b5ea2]/5 dark:border-white/20 dark:text-white dark:hover:bg-white/10">View users</Link>
  </li>
}

export function AdminNotificationsPage() {
  const query=useLiveQuery('admin-notifications',fetchAdminNotifications)
  const inbox=query.data,error=query.error?.message??'',loading=query.loading,load=query.refresh
  return <>
    <PageHeader eyebrow="Accounts" title="Admin notifications" description="Staff account setup, profile edits, and account status changes." action={<Button variant="secondary" disabled={loading} onClick={() => void load()}><RefreshCw size={16} /> Refresh</Button>} />
    {error ? <p role="alert" className="mb-5 rounded-xl bg-[#FFF200] p-4 font-bold text-[#0b5ea2]">{error}</p> : null}
    {!inbox && loading ? <p role="status" className="rounded-xl border border-[#0b5ea2]/15 p-5 text-sm text-[#0b5ea2]/70 dark:border-white/15 dark:text-white/70">Loading Admin notifications…</p> : null}
    {inbox ? <>
    <SectionCard className="overflow-hidden">
      <div className="border-b border-[#0b5ea2]/10 px-5 py-4 dark:border-white/10"><h2 className="font-display text-lg font-bold">Recent account activity</h2><p className="text-xs opacity-65">Profile edits and account status changes remain in account history.</p></div>
      {inbox?.activity.length ? <ul>{inbox.activity.map(notice => <NoticeCard key={notice.id} notice={notice} />)}</ul> : <p className="p-6 text-sm text-[#0b5ea2]/65 dark:text-white/65">No recent account changes.</p>}
    </SectionCard>
    </> : null}
  </>
}
