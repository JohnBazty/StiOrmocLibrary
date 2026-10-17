import { Bell, CheckCircle2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAccessToken, getCurrentIdentity } from '../auth/auth-storage'
import { notificationApi } from './notification-api'
import type { NotificationItem } from './types'

type BellRole = 'student' | 'faculty' | 'admin' | 'librarian' | 'staff'

function formatWhen(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function inboxPath(role: BellRole) {
  if (role === 'faculty') return '/faculty/notifications'
  if (role === 'admin') return '/admin/notifications'
  if (role === 'librarian') return '/librarian/notifications'
  if (role === 'staff') return '/staff/notifications'
  return '/student/notifications'
}

function resolveActionPath(path: string | null) {
  if (!path) return null
  return getCurrentIdentity()?.role === 'Faculty' ? path.replace('/student/', '/faculty/') : path
}

export function NotificationBell({ role }: { role: BellRole }) {
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [authStopped, setAuthStopped] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const navigate = useNavigate()

  useEffect(() => {
    if (authStopped) return
    let active = true
    const pollUnread = async () => {
      if (!getAccessToken()) {
        if (active) {
          setUnreadCount(0)
          setAuthStopped(true)
        }
        return
      }
      try {
        const data = await notificationApi.list({ limit: 1, status: 'unread' })
        if (active) setUnreadCount(Number(data.unreadCount ?? 0))
      } catch {
        /* Quiet background poll: connectivity issues stay off the page. */
      }
    }
    void pollUnread()
    const timer = window.setInterval(() => void pollUnread(), 60_000)
    const update = () => { if (!document.hidden) void pollUnread() }
    window.addEventListener('smartlib:notifications-updated', update)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('smartlib:notifications-updated', update)
    }
  }, [authStopped, role])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  async function loadPanel() {
    if (!getAccessToken()) {
      setAuthStopped(true)
      setError('')
      setItems([])
      setUnreadCount(0)
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await notificationApi.list({ limit: 8 })
      setItems(data.items)
      setUnreadCount(Number(data.unreadCount ?? 0))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load notifications.')
    } finally {
      setLoading(false)
    }
  }

  async function toggleOpen() {
    const next = !open
    setOpen(next)
    if (next) await loadPanel()
  }

  async function openItem(item: NotificationItem) {
    setBusy(true)
    try {
      if (!item.isRead && getAccessToken()) await notificationApi.markRead(item.notificationId)
      const target = resolveActionPath(item.actionPath)
      setOpen(false)
      if (target) navigate(target)
      else await loadPanel()
      setUnreadCount((count) => (item.isRead ? count : Math.max(0, count - 1)))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to open this notification.')
    } finally {
      setBusy(false)
    }
  }

  async function markAllRead() {
    if (!getAccessToken()) return
    setBusy(true)
    setError('')
    try {
      await notificationApi.markAllRead()
      setItems((current) => current.map((item) => ({ ...item, isRead: true })))
      setUnreadCount(0)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to mark notifications as read.')
    } finally {
      setBusy(false)
    }
  }

  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount)

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        onClick={() => void toggleOpen()}
        className="relative rounded-xl border border-[#0b5ea2]/15 bg-white p-2.5 text-[#0b5ea2]/65 transition hover:bg-[#0b5ea2]/5 dark:border-white/15 dark:bg-[#22232e] dark:text-white/80 dark:hover:bg-white/10"
      >
        <Bell size={18} />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FFF200] px-1 text-[10px] font-black text-[#0b5ea2] ring-2 ring-white dark:ring-[#14151b]">
            {badgeLabel}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={menuId}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#0b5ea2]/15 bg-white shadow-xl dark:border-white/15 dark:bg-[#22232e]"
        >
          <div className="flex items-center justify-between border-b border-[#0b5ea2]/10 px-3 py-2.5 dark:border-white/10">
            <div>
              <p className="text-sm font-bold text-[#0b5ea2] dark:text-white">Notifications</p>
              <p className="text-xs text-[#0b5ea2]/60 dark:text-white/60">{unreadCount} unread</p>
            </div>
            <button
              type="button"
              disabled={busy || unreadCount === 0}
              onClick={() => void markAllRead()}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-[#0b5ea2] transition hover:bg-[#0b5ea2]/5 disabled:opacity-40 dark:text-[#FFF200] dark:hover:bg-white/10"
            >
              <CheckCircle2 size={14} />
              Mark all read
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {error ? <p role="alert" className="px-3 py-3 text-sm font-semibold text-red-600 dark:text-red-400">{error}</p> : null}
            {loading ? <p className="px-3 py-8 text-center text-sm text-[#0b5ea2]/60 dark:text-white/60">Loading…</p> : null}
            {!loading && !error && items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm font-semibold text-[#0b5ea2]/60 dark:text-white/60">You are all caught up.</p>
            ) : null}
            {!loading ? items.map((item) => (
              <button
                key={item.notificationId}
                type="button"
                disabled={busy}
                onClick={() => void openItem(item)}
                className={`flex w-full flex-col gap-1 border-b border-[#0b5ea2]/10 px-3 py-3 text-left transition last:border-b-0 hover:bg-[#0b5ea2]/5 disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/5 ${item.isRead ? '' : 'bg-[#FFF200]/20'}`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 text-sm font-bold text-[#0b5ea2] dark:text-white">{item.title}</span>
                  {!item.isRead ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#0b5ea2]" aria-hidden /> : null}
                </span>
                <span className="line-clamp-2 text-xs leading-5 text-[#0b5ea2]/70 dark:text-white/70">{item.body}</span>
                <span className="text-[11px] text-[#0b5ea2]/45 dark:text-white/45">{item.type} · {formatWhen(item.createdAt)}</span>
              </button>
            )) : null}
          </div>
          <div className="border-t border-[#0b5ea2]/10 p-2 dark:border-white/10">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                navigate(inboxPath(role))
              }}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-bold text-[#0b5ea2] transition hover:bg-[#0b5ea2]/5 dark:text-[#FFF200] dark:hover:bg-white/10"
            >
              View all
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
