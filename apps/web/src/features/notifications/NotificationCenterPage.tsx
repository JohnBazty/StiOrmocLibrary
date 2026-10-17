import { AlertTriangle, Bell, BookMarked, CalendarClock, CheckCircle2, Megaphone, Printer, RefreshCw, Trash2 } from 'lucide-react'
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
  const role = getCurrentIdentity()?.role
  if (role === 'Faculty') return path.replace('/student/', '/faculty/')
  if (role === 'Librarian' || role === 'Staff') {
    const prefix = role === 'Librarian' ? '/librarian' : '/staff'
    if (path === '/student/notifications') return `${prefix}/notifications`
    return path.replace('/admin/', `${prefix}/`)
  }
  return path
}

export function NotificationCenterPage() {
  const [data, setData] = useState<NotificationList | null>(null)
  const [schedule, setSchedule] = useState<LibrarySchedule | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false)
  const navigate = useNavigate()
  const load = useCallback(async () => {
    setError('')
    try { const [items, hours] = await Promise.all([notificationApi.list(), notificationApi.schedule()]); setData(items); setSchedule(hours); window.dispatchEvent(new Event('smartlib:notifications-updated')) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Notifications are unavailable.') }
  }, [])
  useEffect(() => { void load(); const timer = window.setInterval(() => { if (!document.hidden) void load() }, 30_000); return () => window.clearInterval(timer) }, [load])
  async function read(item: NotificationItem) {
    setError('')
    try {
      if (!item.isRead) { await notificationApi.markRead(item.notificationId); window.dispatchEvent(new Event('smartlib:notifications-updated')) }
      const target = route(item.actionPath); if (target) navigate(target)
      else await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The notification could not be opened. Try again.') }
  }
  async function readAll() { setBusy(true); setError(''); try { await notificationApi.markAllRead(); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Notifications could not be marked read. Try again.') } finally { setBusy(false) } }
  async function remove(item: NotificationItem) {
    setDeletingId(item.notificationId); setError('')
    try { await notificationApi.remove(item.notificationId); await load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The notification could not be deleted.') }
    finally { setDeletingId(null) }
  }
  async function removeAll() {
    setBusy(true); setError('')
    try { await notificationApi.removeAll(); setShowDeleteAllConfirm(false); await load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The notifications could not be deleted.') }
    finally { setBusy(false) }
  }
  return <>
    <PageHeader eyebrow="Activity center" title="Notifications" description="Due reminders, reservation updates, printing progress, schedules, and announcements." action={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void load()}><RefreshCw size={16} /> Refresh</Button><Button disabled={busy || !data?.unreadCount} onClick={() => void readAll()}><CheckCircle2 size={16} /> Mark all read</Button><Button variant="secondary" className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700" disabled={busy || !data?.items.length} onClick={() => setShowDeleteAllConfirm(true)}><Trash2 size={16}/> Delete all</Button></div>} />
    {error ? <div role="alert" className="mb-5 flex gap-2 rounded-xl bg-[#FFF200] p-4 font-bold text-[#0b5ea2]"><AlertTriangle size={18} />{error}</div> : null}
    <div className="mb-5 grid gap-4 xl:grid-cols-[1fr_1.5fr]">
      <SectionCard className="p-5"><h2 className="font-display text-lg font-bold text-[#0b5ea2]">Library schedule</h2><p className="mt-1 text-xs text-[#0b5ea2]/60">Asia/Manila campus time</p><div className="mt-4 grid grid-cols-2 gap-2 text-sm">{schedule?.weekly.map((entry) => <div key={entry.dayOfWeek} className="rounded-xl bg-[#0b5ea2]/5 p-3"><p className="font-bold text-[#0b5ea2]">{days[entry.dayOfWeek]}</p><p className="mt-1 text-xs text-[#0b5ea2]/65">{entry.isOpen ? `${String(entry.opensAt).slice(0,5)} - ${String(entry.closesAt).slice(0,5)}` : 'Closed'}</p></div>)}</div></SectionCard>
      <SectionCard className="p-5"><h2 className="font-display text-lg font-bold text-[#0b5ea2]">Upcoming closures</h2><div className="mt-4 space-y-2">{schedule?.upcomingClosures.length ? schedule.upcomingClosures.map((closure) => <div key={closure.date} className="rounded-xl border border-[#0b5ea2]/15 p-3"><p className="font-bold text-[#0b5ea2]">{date(closure.date)}</p><p className="mt-1 text-sm text-[#0b5ea2]/65">{closure.reason}</p></div>) : <p className="rounded-xl bg-[#0b5ea2]/5 p-4 text-sm text-[#0b5ea2]/65">No upcoming closures are recorded.</p>}</div></SectionCard>
    </div>
    <SectionCard className="overflow-hidden">
      <div className="border-b border-[#0b5ea2]/15 px-5 py-4">
        <h2 className="font-bold text-[#0b5ea2]">Inbox</h2>
        <p className="text-xs text-[#0b5ea2]/60">{data?.unreadCount ?? 0} unread</p>
      </div>
      <div className="divide-y divide-[#0b5ea2]/10">
        {data?.items.length ? data.items.map((item) => {
          const Icon = icon(item.type)
          return <div key={item.notificationId} className={`flex items-start gap-2 p-3 transition hover:bg-[#0b5ea2]/5 ${item.isRead ? 'bg-white' : 'bg-[#FFF200]/20'}`}>
            <button type="button" onClick={() => void read(item)} className="flex min-w-0 flex-1 gap-4 rounded-xl p-2 text-left">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0b5ea2]/10 text-[#0b5ea2]"><Icon size={20} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="text-[#0b5ea2]">{item.title}</strong>
                  <span className="rounded-full border border-[#0b5ea2]/20 px-2 py-0.5 text-[10px] font-bold uppercase text-[#0b5ea2]">{item.priority}</span>
                  {!item.isRead ? <span className="h-2 w-2 rounded-full bg-[#0b5ea2]" /> : null}
                </span>
                <span className="mt-1 block text-sm leading-6 text-[#0b5ea2]/70">{item.body}</span>
                <span className="mt-2 block text-xs text-[#0b5ea2]/50">{item.type} · {date(item.createdAt)}</span>
              </span>
            </button>
            <button type="button" aria-label={`Delete ${item.title}`} title="Delete notification" disabled={deletingId===item.notificationId} onClick={() => void remove(item)} className="mt-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-200 text-red-600 transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-45">
              <Trash2 size={17}/>
            </button>
          </div>
        }) : <div className="p-12 text-center font-semibold text-[#0b5ea2]">No notifications yet.</div>}
      </div>
    </SectionCard>
    {showDeleteAllConfirm ? <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#0b5ea2]/65 p-4 backdrop-blur-sm">
      <section role="alertdialog" aria-modal="true" aria-labelledby="delete-all-notifications-title" aria-describedby="delete-all-notifications-description" className="w-full max-w-md overflow-hidden rounded-3xl border border-[#0b5ea2]/15 bg-white shadow-2xl shadow-[#0b5ea2]/30">
        <div className="h-2 bg-[#FFF200]"/>
        <div className="p-6 sm:p-7">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600"><Trash2 size={23}/></span>
          <h2 id="delete-all-notifications-title" className="mt-5 font-display text-2xl font-bold text-[#0b5ea2]">Delete all notifications?</h2>
          <p id="delete-all-notifications-description" className="mt-2 text-sm leading-6 text-[#0b5ea2]/65">This will clear every notification currently in your inbox. This action cannot be undone.</p>
          <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" disabled={busy} onClick={() => setShowDeleteAllConfirm(false)}>Cancel</Button>
            <Button className="bg-red-600 text-white hover:bg-red-700" disabled={busy} onClick={() => void removeAll()}><Trash2 size={16}/>{busy?'Deleting…':'Delete notifications'}</Button>
          </div>
        </div>
      </section>
    </div> : null}
  </>
}
