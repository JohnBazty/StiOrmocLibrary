import { Bell, Camera, ClipboardCheck, RefreshCw, UserRound } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, PageHeader, SectionCard } from '../../components/ui'
import { getAccessToken } from '../auth/auth-storage'

type Notice = { id: string; kind: 'registration' | 'avatar' | 'profile' | 'status'; title: string; body: string; createdAt: string; actionPath: string }
type Inbox = { pendingCount: number; pending: Notice[]; activity: Notice[] }
const date = (value: string) => new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })

function NoticeCard({ notice }: { notice: Notice }) {
  const Icon = notice.kind === 'registration' ? ClipboardCheck : notice.kind === 'avatar' ? Camera : UserRound
  return <li className="flex flex-wrap items-start gap-4 border-b border-[#003399]/10 p-5 last:border-b-0 dark:border-white/10">
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#003399]/10 text-[#003399] dark:bg-white/10 dark:text-white"><Icon size={20} /></span>
    <div className="min-w-0 flex-1">
      <p className="font-bold text-[#003399] dark:text-white">{notice.title}</p>
      <p className="mt-1 text-sm text-[#003399]/70 dark:text-white/70">{notice.body}</p>
      <p className="mt-2 text-xs text-[#003399]/50 dark:text-white/50">{date(notice.createdAt)}</p>
    </div>
    <Link to={notice.actionPath} className="rounded-xl border border-[#003399]/20 px-4 py-2 text-sm font-bold text-[#003399] hover:bg-[#003399]/5 dark:border-white/20 dark:text-white dark:hover:bg-white/10">{notice.kind === 'registration' || notice.kind === 'avatar' ? 'Review' : 'View users'}</Link>
  </li>
}

export function AdminNotificationsPage() {
  const [inbox, setInbox] = useState<Inbox | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/v1/admin/notifications', { credentials: 'include', headers: { Accept: 'application/json', Authorization: `Bearer ${getAccessToken() ?? ''}` } })
      const payload = await response.json() as { data?: Inbox; message?: string }
      if (!response.ok || !payload.data) throw new Error(payload.message ?? 'Unable to load Admin notifications.')
      setInbox(payload.data); setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load Admin notifications.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 30_000); return () => window.clearInterval(timer) }, [load])
  return <>
    <PageHeader eyebrow="Accounts" title="Admin notifications" description="Account registrations, profile pictures, and account changes." action={<Button variant="secondary" disabled={loading} onClick={() => void load()}><RefreshCw size={16} /> Refresh</Button>} />
    {error ? <p role="alert" className="mb-5 rounded-xl bg-[#FFF200] p-4 font-bold text-[#003399]">{error}</p> : null}
    <SectionCard className="mb-6 overflow-hidden">
      <div className="flex items-center gap-3 border-b border-[#003399]/10 px-5 py-4 dark:border-white/10"><Bell size={19} /><div><h2 className="font-display text-lg font-bold">Needs your review</h2><p className="text-xs opacity-65">{inbox?.pendingCount ?? 0} pending · Entries clear after approval or rejection.</p></div></div>
      {inbox?.pending.length ? <ul>{inbox.pending.map(notice => <NoticeCard key={notice.id} notice={notice} />)}</ul> : <p className="p-6 text-sm text-[#003399]/65 dark:text-white/65">No account or picture approvals are pending.</p>}
      {inbox && inbox.pendingCount > inbox.pending.length ? <p className="border-t border-[#003399]/10 p-4 text-sm dark:border-white/10">More items are waiting. Open <Link to="/admin/approvals" className="font-bold underline">Approvals</Link> to review them.</p> : null}
    </SectionCard>
    <SectionCard className="overflow-hidden">
      <div className="border-b border-[#003399]/10 px-5 py-4 dark:border-white/10"><h2 className="font-display text-lg font-bold">Recent account activity</h2><p className="text-xs opacity-65">Profile edits and account status changes remain in account history.</p></div>
      {inbox?.activity.length ? <ul>{inbox.activity.map(notice => <NoticeCard key={notice.id} notice={notice} />)}</ul> : <p className="p-6 text-sm text-[#003399]/65 dark:text-white/65">No recent account changes.</p>}
    </SectionCard>
  </>
}
