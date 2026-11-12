import { Bell, Check, List } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { getCsrfToken } from '../auth/auth-storage'
import { notificationApi } from './notification-api'
import { formatNotificationDate, notificationIcon, notificationRoute, notificationsUpdated } from './notification-display'
import type { NotificationItem } from './types'

export function NotificationShortcut({ path }: { path: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const navigate = useNavigate()
  const location = useLocation()
  const enabled = Boolean(getCsrfToken())
  const badge = useLiveQuery(`notification-unread:${path}`, async signal => (await notificationApi.list(signal, 1)).unreadCount, { enabled, events: [notificationsUpdated] })
  const preview = useLiveQuery(`notification-preview:${path}`, signal => notificationApi.list(signal, 5), { enabled: enabled && open, events: [notificationsUpdated] })
  const unreadCount = badge.data ?? 0

  useEffect(() => { setOpen(false) }, [location.key])
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  async function read(item: NotificationItem, followLink: boolean) {
    setActionError('')
    setBusy(true)
    try {
      if (!item.isRead) {
        await notificationApi.markRead(item.notificationId)
        window.dispatchEvent(new Event(notificationsUpdated))
      }
      const target = followLink ? notificationRoute(item.actionPath) : null
      if (target) { setOpen(false); navigate(target) }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not mark the notification as read. Try again.')
    } finally { setBusy(false) }
  }

  return <div ref={container} className="sm:relative" onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); trigger.current?.focus() }
  }}>
    <button ref={trigger} type="button" onClick={() => { setActionError(''); setOpen(value => !value) }} aria-label="Notifications"
      aria-expanded={open} aria-controls={open ? panelId : undefined} className="relative grid size-11 place-items-center rounded-xl border border-[#003399]/15 bg-white text-[#003399]/65 hover:bg-[#003399]/5 dark:border-white/15 dark:bg-[#001a4d] dark:text-white/80 dark:hover:bg-white/10">
      <Bell size={18} aria-hidden="true" />
      {unreadCount > 0 && <span aria-label={`${unreadCount} unread notifications`} className="absolute -right-2 -top-2 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-700 px-1 text-[10px] font-bold tabular-nums text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </button>
    {open && <section id={panelId} aria-label="Recent notifications" className="absolute inset-x-3 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-[#003399]/15 bg-white text-[#003399] shadow-xl sm:left-auto sm:right-0 sm:w-96 dark:border-white/15 dark:bg-[#001a4d] dark:text-white">
      <div className="flex items-center justify-between border-b border-current/10 px-4 py-3">
        <h2 className="font-display font-bold">Notifications</h2><span className="text-xs tabular-nums opacity-70">{unreadCount} unread</span>
      </div>
      {actionError && <p role="alert" className="px-4 py-2 text-sm text-red-700 dark:text-red-200">{actionError}</p>}
      {preview.error ? <div className="px-4 py-3 text-sm"><p role="alert">Unable to load notifications.</p><button type="button" className="min-h-11 font-bold underline" onClick={() => void preview.refresh()}>Try again</button></div>
        : enabled && !preview.data ? <p role="status" className="px-4 py-6 text-sm">Loading notifications…</p>
        : preview.data?.items.length ? <ul className="max-h-[min(24rem,50dvh)] divide-y divide-current/10 overflow-y-auto">
          {preview.data.items.map(item => {
            const Icon = notificationIcon(item.type)
            return <li key={item.notificationId} className={`flex items-center gap-1 px-2 ${item.isRead ? '' : 'bg-[#003399]/5 dark:bg-white/10'}`}>
              <button type="button" disabled={busy} onClick={() => void read(item, true)} className="flex min-w-0 flex-1 items-start gap-3 rounded-lg p-2 text-left hover:bg-[#003399]/10 dark:hover:bg-white/10">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#003399]/10 dark:bg-white/10"><Icon size={18} aria-hidden="true" /></span>
                <span className="min-w-0"><span className={`block truncate text-sm ${item.isRead ? 'font-medium' : 'font-bold'}`}>{item.title}</span><span className="block truncate text-sm opacity-80">{item.body}</span><span className="mt-1 block text-xs opacity-70">{formatNotificationDate(item.createdAt)}</span></span>
              </button>
              {!item.isRead && <button type="button" disabled={busy} aria-label={`Mark ${item.title} as read`} title="Mark as read" onClick={() => void read(item, false)} className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-[#003399]/10 dark:hover:bg-white/10"><Check size={18} aria-hidden="true" /></button>}
            </li>
          })}
        </ul> : <p role="status" className="px-4 py-8 text-center text-sm opacity-75">No notifications yet.</p>}
      <Link to={path} onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2 border-t border-current/10 bg-[#003399]/5 px-4 text-sm font-bold hover:bg-[#003399]/10 dark:bg-white/5 dark:hover:bg-white/10"><List size={17} aria-hidden="true" /> See all</Link>
    </section>}
  </div>
}
