import { AlertTriangle, Bell, BookMarked, CalendarClock, CheckCircle2, Megaphone, Printer, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, PageHeader, SectionCard } from '../../components/ui'
import { getCurrentIdentity } from '../auth/auth-storage'
import { notificationApi } from './notification-api'
import type { LibrarySchedule, NotificationItem, NotificationList } from './types'

const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
function date(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) }
function icon(type: string) {
  if (type === 'Due Date' || type === 'Overdue Penalty') return CalendarClock
  if (type === 'Reservation Arrival') return BookMarked
  if (type === 'Printing Update') return Printer
  if (type === 'Announcement') return Megaphone
  return Bell
}
function route(path: string | null) {
  if (!path) return null
  return getCurrentIdentity()?.role === 'Faculty' ? path.replace('/student/', '/faculty/') : path
}

export function NotificationCenterPage() {
  const [data, setData] = useState<NotificationList | null>(null)
  const [schedule, setSchedule] = useState<LibrarySchedule | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const load = useCallback(async () => {
    setError('')
    try { const [items, hours] = await Promise.all([notificationApi.list(), notificationApi.schedule()]); setData(items); setSchedule(hours) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Notifications are unavailable.') }
  }, [])
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 30_000); return () => window.clearInterval(timer) }, [load])
  async function read(item: NotificationItem) {
    if (!item.isRead) await notificationApi.markRead(item.notificationId)
    const target = route(item.actionPath); if (target) navigate(target)
    await load()
  }
  async function readAll() { setBusy(true); try { await notificationApi.markAllRead(); await load() } finally { setBusy(false) } }
  return <>
    <PageHeader eyebrow="Activity center" title="Notifications" description="Due reminders, reservation updates, printing progress, schedules, and announcements." action={<div className="flex gap-2"><Button variant="secondary" onClick={() => void load()}><RefreshCw size={16} /> Refresh</Button><Button disabled={busy || !data?.unreadCount} onClick={() => void readAll()}><CheckCircle2 size={16} /> Mark all read</Button></div>} />
    {error ? <div role="alert" className="mb-5 flex gap-2 rounded-xl bg-[#FFF200] p-4 font-bold text-[#003399]"><AlertTriangle size={18} />{error}</div> : null}
    <div className="mb-5 grid gap-4 xl:grid-cols-[1fr_1.5fr]">
      <SectionCard className="p-5"><h2 className="font-display text-lg font-bold text-[#003399]">Library schedule</h2><p className="mt-1 text-xs text-[#003399]/60">Asia/Manila campus time</p><div className="mt-4 grid grid-cols-2 gap-2 text-sm">{schedule?.weekly.map((entry) => <div key={entry.dayOfWeek} className="rounded-xl bg-[#003399]/5 p-3"><p className="font-bold text-[#003399]">{days[entry.dayOfWeek]}</p><p className="mt-1 text-xs text-[#003399]/65">{entry.isOpen ? `${String(entry.opensAt).slice(0,5)} - ${String(entry.closesAt).slice(0,5)}` : 'Closed'}</p></div>)}</div></SectionCard>
      <SectionCard className="p-5"><h2 className="font-display text-lg font-bold text-[#003399]">Upcoming closures</h2><div className="mt-4 space-y-2">{schedule?.upcomingClosures.length ? schedule.upcomingClosures.map((closure) => <div key={closure.date} className="rounded-xl border border-[#003399]/15 p-3"><p className="font-bold text-[#003399]">{date(closure.date)}</p><p className="mt-1 text-sm text-[#003399]/65">{closure.reason}</p></div>) : <p className="rounded-xl bg-[#003399]/5 p-4 text-sm text-[#003399]/65">No upcoming closures are recorded.</p>}</div></SectionCard>
    </div>
    <SectionCard className="overflow-hidden"><div className="border-b border-[#003399]/15 px-5 py-4"><h2 className="font-bold text-[#003399]">Inbox</h2><p className="text-xs text-[#003399]/60">{data?.unreadCount ?? 0} unread</p></div><div className="divide-y divide-[#003399]/10">{data?.items.length ? data.items.map((item) => { const Icon = icon(item.type); return <button key={item.notificationId} onClick={() => void read(item)} className={`flex w-full gap-4 p-5 text-left transition hover:bg-[#003399]/5 ${item.isRead ? 'bg-white' : 'bg-[#FFF200]/20'}`}><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#003399]/10 text-[#003399]"><Icon size={20} /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="text-[#003399]">{item.title}</strong><span className="rounded-full border border-[#003399]/20 px-2 py-0.5 text-[10px] font-bold uppercase text-[#003399]">{item.priority}</span>{!item.isRead ? <span className="h-2 w-2 rounded-full bg-[#003399]" /> : null}</span><span className="mt-1 block text-sm leading-6 text-[#003399]/70">{item.body}</span><span className="mt-2 block text-xs text-[#003399]/50">{item.type} · {date(item.createdAt)}</span></span></button> }) : <div className="p-12 text-center font-semibold text-[#003399]">No notifications yet.</div>}</div></SectionCard>
  </>
}
