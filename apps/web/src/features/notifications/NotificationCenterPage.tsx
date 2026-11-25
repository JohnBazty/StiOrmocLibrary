import {DeviceNotifications} from './DeviceNotifications'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { CheckCircle2, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, LumoDialog, NoticeBanner, PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { formatManilaTime12 } from './LibrarySchedulePage'
import { notificationApi } from './notification-api'
import { formatNotificationDate, notificationIcon, notificationRoute, notificationsUpdated } from './notification-display'
import type { NotificationItem } from './types'
import { RefreshButton } from '../../components/RefreshButton'

const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function NotificationCenterPage({ workspace }: { workspace?: 'admin' | 'librarian' | 'staff' } = {}) {
  const inbox=useLiveQuery('notification-inbox',signal=>notificationApi.list(signal),{poll:false,events:[notificationsUpdated]})
  const hours=useLiveQuery('notification-schedule',()=>notificationApi.schedule(),{enabled:!workspace,poll:false})
  const data=inbox.data,schedule=hours.data
  const refreshInbox = inbox.refresh
  const refreshSchedule = hours.refresh
  useEffect(() => {
    const timer = window.setInterval(() => { void refreshInbox(); if (!workspace) void refreshSchedule() }, 30_000)
    return () => window.clearInterval(timer)
  }, [refreshInbox, refreshSchedule, workspace])
  const [actionError,setError]=useState('')
  const error=actionError||inbox.error?.message||hours.error?.message||''
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false)
  const navigate = useNavigate()
  const load=async()=>{setError('');await Promise.all([refreshInbox(),workspace ? undefined : refreshSchedule()])}
  const refreshAfterChange=()=>window.dispatchEvent(new Event(notificationsUpdated))
  async function read(item: NotificationItem) {
    setError('')
    try {
      if (!item.isRead) { await notificationApi.markRead(item.notificationId); refreshAfterChange() }
      const target = notificationRoute(item.actionPath); if (target) navigate(target)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The notification could not be opened. Try again.') }
  }
  async function readAll() { setBusy(true); setError(''); try { await notificationApi.markAllRead(); refreshAfterChange() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Notifications could not be marked read. Try again.') } finally { setBusy(false) } }
  async function remove(item: NotificationItem) {
    setDeletingId(item.notificationId); setError('')
    try { await notificationApi.remove(item.notificationId); refreshAfterChange() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The notification could not be deleted.') }
    finally { setDeletingId(null) }
  }
  async function removeAll() {
    setBusy(true); setError('')
    try { await notificationApi.removeAll(); setShowDeleteAllConfirm(false); refreshAfterChange() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The notifications could not be deleted.') }
    finally { setBusy(false) }
  }
  return <>
    <PageHeader eyebrow="Activity center" title={workspace === 'staff' ? 'Staff notifications' : workspace ? 'Admin notifications' : 'Notifications'} description={workspace ? 'Your library alerts, updates and announcements. Open a notification to review its details.' : 'Due reminders, reservation updates, printing progress, schedules, and announcements.'} action={<div className="flex flex-wrap gap-2"><RefreshButton onRefresh={() => load()} variant="secondary" /><Button disabled={busy || !data?.unreadCount} onClick={() => void readAll()}><CheckCircle2 size={16} /> Mark all read</Button><Button variant="secondary" className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700" disabled={busy || !data?.items.length} onClick={() => setShowDeleteAllConfirm(true)}><Trash2 size={16}/> Delete all</Button></div>} />
    <DeviceNotifications/>
    {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
    {!workspace ? <div className="mb-5 grid gap-4 xl:grid-cols-[1fr_1.5fr]">
      <SectionCard className="p-5"><h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Library schedule</h2><p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">Campus hours (12-hour AM/PM)</p><div className="mt-4 grid grid-cols-2 gap-2 text-sm">{schedule?.weekly.map((entry) => <div key={entry.dayOfWeek} className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/50 p-3"><p className="font-semibold text-[var(--sl-text-header)]">{days[entry.dayOfWeek]}</p><p className="mt-1 text-xs tabular-nums text-[var(--sl-text-secondary)]">{entry.isOpen ? `${formatManilaTime12(entry.opensAt)} – ${formatManilaTime12(entry.closesAt)}` : 'Closed'}</p></div>)}</div></SectionCard>
      <SectionCard className="p-5"><h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Upcoming closures</h2><div className="mt-4 space-y-2">{schedule?.upcomingClosures.length ? schedule.upcomingClosures.map((closure) => <div key={closure.date} className="rounded-[8px] border border-[var(--sl-border)] p-3"><p className="font-semibold text-[var(--sl-text-header)]">{formatNotificationDate(closure.date)}{closure.startsAt && closure.endsAt ? ` · ${formatManilaTime12(closure.startsAt)} – ${formatManilaTime12(closure.endsAt)}` : ' · All day'}</p><p className="mt-1 text-sm text-[var(--sl-text-secondary)]">{closure.reason}</p></div>) : <p className="rounded-[8px] bg-[var(--sl-bg-subtle)] p-4 text-sm text-[var(--sl-text-secondary)]">No upcoming closures are recorded.</p>}</div></SectionCard>
    </div> : null}
    <SectionCard className="overflow-hidden">
      <div className="border-b border-[var(--sl-border)] px-5 py-4">
        <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Inbox</h2>
        <p className="text-xs text-[var(--sl-text-muted)] tabular-nums">{data?.unreadCount ?? 0} unread</p>
      </div>
      <div className="divide-y divide-[var(--sl-border)]">
        {!data && inbox.loading ? <p role="status" className="p-6 text-sm text-[var(--sl-text-secondary)]">Loading notifications…</p> : !data && inbox.error ? <p className="p-6 text-sm text-[var(--sl-text-secondary)]">Notifications could not be loaded. Choose Refresh to try again.</p> : data?.items.length ? data.items.map((item) => {
          const Icon = notificationIcon(item.type)
          return <div key={item.notificationId} className={`flex items-start gap-2 p-3 transition-colors hover:bg-[var(--sl-bg-hover)] ${item.isRead ? 'bg-[var(--sl-bg-elevated)]' : 'bg-[var(--sl-brand-soft)]'}`}>
            <button type="button" onClick={() => void read(item)} className="flex min-w-0 flex-1 gap-3.5 rounded-[8px] p-2 text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[var(--sl-info-soft)] text-[#0b5ea2] dark:text-[#93c5fd]"><Icon size={19} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="text-[var(--sl-text-header)]">{item.title}</strong>
                  {item.priority ? <StatusBadge status={item.priority} /> : null}
                  {!item.isRead ? <span className="h-2 w-2 rounded-full bg-[#0b5ea2] dark:bg-[#93c5fd]" aria-label="Unread" /> : null}
                </span>
                <span className="mt-1 block text-sm leading-6 text-[var(--sl-text-secondary)]">{item.body}</span>
                <span className="mt-1.5 block text-xs text-[var(--sl-text-muted)]">{item.type} · {formatNotificationDate(item.createdAt)}</span>
              </span>
            </button>
            <button type="button" aria-label={`Delete ${item.title}`} title="Delete notification" disabled={deletingId===item.notificationId} onClick={() => void remove(item)} className="mt-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-[#fecaca] text-[#b42318] transition-colors hover:bg-[#fef2f2] disabled:cursor-wait disabled:opacity-45 dark:border-red-400/35 dark:text-red-300 dark:hover:bg-red-950/40">
              <Trash2 size={16} aria-hidden="true"/>
            </button>
          </div>
        }) : <div className="p-12 text-center text-sm font-medium text-[var(--sl-text-muted)]">No notifications yet.</div>}
      </div>
    </SectionCard>
    {showDeleteAllConfirm ? (
      <LumoDialog
        role="alertdialog"
        size="sm"
        title="Delete all notifications?"
        description="This will clear every notification currently in your inbox. This action cannot be undone."
        busy={busy}
        onClose={() => { if (!busy) setShowDeleteAllConfirm(false) }}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setShowDeleteAllConfirm(false)}>Cancel</Button>
            <Button variant="danger" disabled={busy} onClick={() => void removeAll()}><Trash2 size={16} aria-hidden="true"/>{busy ? 'Deleting…' : 'Delete notifications'}</Button>
          </>
        }
      >
        <p className="text-sm text-[var(--sl-text-secondary)]">You can continue receiving new alerts and announcements after clearing your inbox.</p>
      </LumoDialog>
    ) : null}
  </>
}
