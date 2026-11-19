import {
  AlertTriangle,
  ArrowLeftRight,
  BookMarked,
  Calendar,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  PanelRightClose,
  PanelRightOpen,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { attendanceApi, type LibraryEvent } from '../features/attendance/attendance-api'
import { getCsrfToken } from '../features/auth/auth-storage'
import { notificationApi } from '../features/notifications/notification-api'
import type { Announcement, ManagedLibrarySchedule, NotificationItem } from '../features/notifications/types'
import { borrowingScheduleApi, type AdminBorrowingSchedule } from '../features/reservations/borrowing-schedule-api'
import { reservationApi } from '../features/reservations/reservation-api'
import type { ReservationQueueItem } from '../features/reservations/types'

type Role = 'admin' | 'librarian' | 'staff'

type AuditLogSummary = {
  id: string
  category: string
  actionLabel: string
  actorName: string
  summary: string
  occurredAt: string
}

type AgendaEntry = {
  id: string
  kind: 'closure' | 'reservation' | 'transaction' | 'notice'
  title: string
  subtitle: string
  timeLabel?: string
  badgeText: string
  tone: 'error' | 'warning' | 'info' | 'success'
  actionPath?: string
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function toManilaDateKey(dateInput: Date | string | null | undefined): string | null {
  if (!dateInput) return null
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim()
  }
  const parsed = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (Number.isNaN(parsed.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed)
}

function formatManilaTime(value: string | null | undefined): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(parsed)
}

function formatClock12Hour(hhmm: string | null | undefined, fallback: string): string {
  const raw = (hhmm || fallback).trim()
  const match = /^(\d{1,2}):(\d{2})/.exec(raw)
  if (!match) return raw
  const hours24 = Number(match[1])
  const minutes = match[2]
  const period = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 || 12
  return `${hours12}:${minutes} ${period}`
}

function formatDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

async function fetchRecentAuditLogs(signal?: AbortSignal): Promise<AuditLogSummary[]> {
  const headers = new Headers({ Accept: 'application/json' })
  const token = getCsrfToken()
  if (token) headers.set('X-CSRF-Token', token)
  const response = await fetch('/api/v1/admin/reports/audit-logs?limit=60', {
    credentials: 'include',
    headers,
    signal,
  })
  if (!response.ok) return []
  const payload = (await response.json().catch(() => null)) as {
    data?: { items?: AuditLogSummary[] }
  } | null
  return payload?.data?.items ?? []
}

export function AdminRightQuickSidebar({
  role,
  open,
  onToggle,
}: {
  role: Role
  open: boolean
  onToggle: () => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [now, setNow] = useState(() => new Date())
  const todayKey = useMemo(() => toManilaDateKey(now) ?? new Date().toISOString().slice(0, 10), [now])

  const [viewMonth, setViewMonth] = useState(() => {
    const [y, m] = (toManilaDateKey(new Date()) ?? '2026-11-20').split('-').map(Number)
    return new Date(y, (m || 1) - 1, 1)
  })
  const [selectedDateKey, setSelectedDateKey] = useState<string>(() => todayKey)

  const [schedule, setSchedule] = useState<ManagedLibrarySchedule | null>(null)
  const [events, setEvents] = useState<LibraryEvent[]>([])
  const [reservations, setReservations] = useState<ReservationQueueItem[]>([])
  const [pickups, setPickups] = useState<AdminBorrowingSchedule[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLogSummary[]>([])
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loadingAgenda, setLoadingAgenda] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const loadCalendarData = useCallback(async (signal?: AbortSignal) => {
    setLoadingAgenda(true)
    const results = await Promise.allSettled([
      notificationApi.librarySchedule(signal),
      attendanceApi.events(),
      reservationApi.queue(
        { status: '', dateFrom: '', dateTo: '', user: '', role: '', kind: 'Reservation' },
        1,
      ),
      borrowingScheduleApi.queue({ user: '', role: '', dateFrom: '', dateTo: '' }, 1, signal),
      fetchRecentAuditLogs(signal),
      notificationApi.list(signal, 40),
      notificationApi.announcements(),
    ])
    if (signal?.aborted) return
    if (results[0].status === 'fulfilled') setSchedule(results[0].value)
    if (results[1].status === 'fulfilled') setEvents(results[1].value ?? [])
    if (results[2].status === 'fulfilled') setReservations(results[2].value?.items ?? [])
    if (results[3].status === 'fulfilled') setPickups(results[3].value?.items ?? [])
    if (results[4].status === 'fulfilled') setAuditLogs(results[4].value ?? [])
    if (results[5].status === 'fulfilled') setNotifications(results[5].value?.items ?? [])
    if (results[6].status === 'fulfilled') setAnnouncements(results[6].value ?? [])
    setLoadingAgenda(false)
  }, [])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    void loadCalendarData(controller.signal)
    const timer = window.setInterval(() => void loadCalendarData(controller.signal), 45_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [open, loadCalendarData])

  const prefix = role === 'admin' ? '/admin' : role === 'staff' ? '/staff' : '/librarian'
  const schedulePath =
    role === 'librarian' ? '/librarian/maintenance?tab=schedule' : `${prefix}/library-schedule`

  // Map closures and weekly operating rules
  const closureByDate = useMemo(() => {
    const map = new Map<string, { reason: string; startsAt?: string | null; endsAt?: string | null }>()
    for (const closure of schedule?.upcomingClosures ?? []) {
      map.set(closure.date, { reason: closure.reason, startsAt: closure.startsAt, endsAt: closure.endsAt })
    }
    return map
  }, [schedule])

  const getDayOperatingInfo = useCallback(
    (dateKey: string) => {
      const explicit = closureByDate.get(dateKey)
      if (explicit) {
        const timeWindow =
          explicit.startsAt && explicit.endsAt
            ? `${formatClock12Hour(explicit.startsAt, '08:00')} – ${formatClock12Hour(explicit.endsAt, '17:00')}`
            : 'All day'
        return {
          isClosed: true,
          isDatedClosure: true,
          label: `Closed (${timeWindow})`,
          detail: explicit.reason,
        }
      }
      const [y, m, d] = dateKey.split('-').map(Number)
      const jsDay = new Date(y, (m || 1) - 1, d || 1).getDay() // 0 = Sun .. 6 = Sat
      const isoDay = jsDay === 0 ? 7 : jsDay // 1 = Mon .. 7 = Sun
      const weeklyRule = schedule?.weekly.find((item) => item.dayOfWeek === isoDay)
      if (weeklyRule && !weeklyRule.isOpen) {
        return {
          isClosed: true,
          isDatedClosure: false,
          label: 'Closed',
          detail: 'Regular weekly closed day in library schedule.',
        }
      }
      if (weeklyRule && weeklyRule.isOpen) {
        const open12 = formatClock12Hour(weeklyRule.opensAt, '08:00')
        const close12 = formatClock12Hour(weeklyRule.closesAt, '17:00')
        return {
          isClosed: false,
          isDatedClosure: false,
          label: `Open ${open12} – ${close12}`,
          detail: `Operating hours (${open12} – ${close12} Manila time)`,
        }
      }
      if (jsDay === 0) {
        return {
          isClosed: true,
          isDatedClosure: false,
          label: 'Closed',
          detail: 'Sunday weekly library closure.',
        }
      }
      return {
        isClosed: false,
        isDatedClosure: false,
        label: 'Open 8:00 AM – 5:00 PM',
        detail: 'Standard campus operating hours (8:00 AM – 5:00 PM)',
      }
    },
    [closureByDate, schedule],
  )

  // Build map of agenda entries per YYYY-MM-DD
  const agendaByDate = useMemo(() => {
    const map = new Map<string, AgendaEntry[]>()
    const push = (dateKey: string | null, entry: AgendaEntry) => {
      if (!dateKey) return
      const list = map.get(dateKey) ?? []
      if (!list.some((item) => item.id === entry.id)) {
        list.push(entry)
        map.set(dateKey, list)
      }
    }

    // 1. Dated closures from Library Hours
    for (const closure of schedule?.upcomingClosures ?? []) {
      const windowText =
        closure.startsAt && closure.endsAt
          ? `${formatClock12Hour(closure.startsAt, '08:00')} – ${formatClock12Hour(closure.endsAt, '17:00')}`
          : 'All day'
      push(closure.date, {
        id: `closure-${closure.date}`,
        kind: 'closure',
        title: 'Library Closure Flag',
        subtitle: `${closure.reason} (${windowText})`,
        timeLabel: windowText,
        badgeText: 'Closed',
        tone: 'error',
        actionPath: schedulePath,
      })
    }

    // 2. Scheduled Library Events / Room blocks
    for (const ev of events) {
      if (ev.lifecycle_status === 'Cancelled') continue
      const key = toManilaDateKey(ev.starts_at)
      const restrictions = [
        !ev.allow_walk_ins ? 'No walk-ins' : null,
        !ev.allow_borrowing ? 'Borrowing paused' : null,
        !ev.allow_printing ? 'Printing paused' : null,
      ]
        .filter(Boolean)
        .join(' · ')
      push(key, {
        id: `event-${ev.event_id}`,
        kind: !ev.allow_borrowing || !ev.allow_printing ? 'closure' : 'notice',
        title: `${ev.title} (${ev.space_name})`,
        subtitle: restrictions || `${ev.event_kind} scheduled in ${ev.space_name}`,
        timeLabel: `${formatManilaTime(ev.starts_at)} – ${formatManilaTime(ev.ends_at)}`,
        badgeText: ev.event_kind,
        tone: !ev.allow_borrowing || !ev.allow_printing ? 'warning' : 'info',
        actionPath: `${prefix}/attendance`,
      })
    }

    // 3. Scheduled Borrowing Pickups
    for (const item of pickups) {
      push(toManilaDateKey(item.pickupDate), {
        id: `pickup-${item.scheduleId}`,
        kind: 'reservation',
        title: item.title,
        subtitle: `Scheduled pickup · ${item.userName} (${item.schoolId})`,
        badgeText: 'Pickup',
        tone: 'warning',
        actionPath: role === 'admin' ? '/admin/audit-logs' : `${prefix}/reservations`,
      })
    }

    // 4. Reservations Queue (requested date & pickup expiry date)
    for (const res of reservations) {
      const reqKey = toManilaDateKey(res.reservedAt)
      const isReady = res.status === 'ready_for_pickup'
      push(reqKey, {
        id: `res-${res.reservationId}`,
        kind: 'reservation',
        title: res.materialTitle,
        subtitle: `${res.userName} · ${res.statusLabel ?? res.status.replace(/_/g, ' ')}`,
        timeLabel: formatManilaTime(res.reservedAt),
        badgeText: isReady ? 'Ready' : 'Reservation',
        tone: isReady ? 'success' : 'warning',
        actionPath: role === 'admin' ? '/admin/audit-logs' : `${prefix}/reservations`,
      })
      if (res.pickupDeadline && isReady) {
        const expKey = toManilaDateKey(res.pickupDeadline)
        if (expKey && expKey !== reqKey) {
          push(expKey, {
            id: `res-exp-${res.reservationId}`,
            kind: 'reservation',
            title: `Pickup deadline: ${res.materialTitle}`,
            subtitle: `Reserved by ${res.userName}`,
            timeLabel: formatManilaTime(res.pickupDeadline),
            badgeText: 'Expires',
            tone: 'warning',
            actionPath: role === 'admin' ? '/admin/audit-logs' : `${prefix}/reservations`,
          })
        }
      }
    }

    // 5. Transactions & Audit Activity
    for (const log of auditLogs) {
      const key = toManilaDateKey(log.occurredAt)
      push(key, {
        id: `tx-${log.id}`,
        kind: 'transaction',
        title: log.actionLabel,
        subtitle: log.summary,
        timeLabel: formatManilaTime(log.occurredAt),
        badgeText: log.category,
        tone: 'info',
        actionPath: role === 'staff' ? '/staff/circulation' : `${prefix}/audit-logs`,
      })
    }

    // 6. Announcements & System Notices
    for (const ann of announcements) {
      const key = toManilaDateKey(ann.publishedAt ?? ann.publishAt ?? ann.createdAt)
      push(key, {
        id: `ann-${ann.announcementId}`,
        kind: 'notice',
        title: ann.title,
        subtitle: ann.body,
        timeLabel: formatManilaTime(ann.publishedAt ?? ann.createdAt),
        badgeText: 'Notice',
        tone: ann.priority === 'Urgent' ? 'error' : 'success',
        actionPath: role === 'admin' ? '/admin/notifications' : `${prefix}/announcements`,
      })
    }

    for (const notif of notifications.slice(0, 20)) {
      const key = toManilaDateKey(notif.createdAt)
      push(key, {
        id: `notif-${notif.notificationId}`,
        kind: notif.type.toLowerCase().includes('reserve') ? 'reservation' : 'notice',
        title: notif.title,
        subtitle: notif.body,
        timeLabel: formatManilaTime(notif.createdAt),
        badgeText: notif.priority === 'Urgent' ? 'Urgent' : 'Alert',
        tone: notif.priority === 'Urgent' ? 'error' : 'info',
        actionPath: notif.actionPath ?? `${prefix}/notifications`,
      })
    }

    return map
  }, [schedule, events, pickups, reservations, auditLogs, announcements, notifications, prefix, role, schedulePath])

  const formattedTime = useMemo(
    () =>
      new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        hour: 'numeric',
        minute: '2-digit',
      }).format(now),
    [now],
  )

  const formattedDate = useMemo(
    () =>
      new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(now),
    [now],
  )

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('en-PH', {
        month: 'long',
        year: 'numeric',
      }).format(viewMonth),
    [viewMonth],
  )

  const calendarCells = useMemo(() => {
    const year = viewMonth.getFullYear()
    const month = viewMonth.getMonth()
    const firstWeekday = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: Array<{
      day: number | null
      dateKey: string | null
      isToday: boolean
      isClosed: boolean
      isDatedClosure: boolean
      hasReservation: boolean
      hasTransaction: boolean
      hasNotice: boolean
      totalFlags: number
    }> = []

    for (let i = 0; i < firstWeekday; i++) {
      cells.push({
        day: null,
        dateKey: null,
        isToday: false,
        isClosed: false,
        isDatedClosure: false,
        hasReservation: false,
        hasTransaction: false,
        hasNotice: false,
        totalFlags: 0,
      })
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = formatDateKey(year, month, d)
      const op = getDayOperatingInfo(dateKey)
      const items = agendaByDate.get(dateKey) ?? []
      const hasReservation = items.some((i) => i.kind === 'reservation')
      const hasTransaction = items.some((i) => i.kind === 'transaction')
      const hasNotice = items.some((i) => i.kind === 'notice')
      const isDatedClosure = op.isDatedClosure || items.some((i) => i.kind === 'closure')
      cells.push({
        day: d,
        dateKey,
        isToday: dateKey === todayKey,
        isClosed: op.isClosed,
        isDatedClosure,
        hasReservation,
        hasTransaction,
        hasNotice,
        totalFlags: items.length,
      })
    }
    return cells
  }, [viewMonth, todayKey, getDayOperatingInfo, agendaByDate])

  // Core shortcuts only (2-3 essential items following Vaadin Lumo Side Nav Item 5232:2175)
  const coreShortcuts = useMemo(() => {
    if (role === 'admin') {
      return [
        {
          title: 'Attendance monitoring',
          subtitle: 'Live occupancy & gate logs',
          icon: QrCode,
          path: '/admin/attendance',
          badge: 'Core',
        },
        {
          title: 'User accounts',
          subtitle: 'Students, faculty & staff',
          icon: Users,
          path: '/admin/users',
          badge: 'Core',
        },
        {
          title: 'System audit logs',
          subtitle: 'All library transactions',
          icon: ShieldCheck,
          path: '/admin/audit-logs',
          badge: String(auditLogs.length || ''),
        },
      ]
    }
    return [
      {
        title: 'Attendance monitoring',
        subtitle: 'QR entry gate & live headcount',
        icon: QrCode,
        path: `${prefix}/attendance`,
        badge: 'Core',
      },
      {
        title: 'Borrow & return counter',
        subtitle: 'Check out, return & renew books',
        icon: ArrowLeftRight,
        path: `${prefix}/circulation`,
        badge: 'Desk',
      },
      {
        title: 'Book queue & pickups',
        subtitle: 'Reservations & scheduled pickups',
        icon: BookMarked,
        path: `${prefix}/reservations`,
        badge: reservations.length + pickups.length > 0 ? String(reservations.length + pickups.length) : '',
      },
    ]
  }, [role, prefix, auditLogs.length, reservations.length, pickups.length])

  const todayOperating = useMemo(() => getDayOperatingInfo(todayKey), [getDayOperatingInfo, todayKey])
  const selectedOperating = useMemo(
    () => getDayOperatingInfo(selectedDateKey),
    [getDayOperatingInfo, selectedDateKey],
  )
  const selectedAgenda = useMemo(
    () => agendaByDate.get(selectedDateKey) ?? [],
    [agendaByDate, selectedDateKey],
  )

  const selectedDateHeading = useMemo(() => {
    const [y, m, d] = selectedDateKey.split('-').map(Number)
    return new Intl.DateTimeFormat('en-PH', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(y, (m || 1) - 1, d || 1))
  }, [selectedDateKey])

  if (!open) {
    return (
      <div className="fixed right-0 top-20 z-30 hidden xl:block">
        <button
          type="button"
          onClick={onToggle}
          aria-label="Open quick actions sidebar"
          title="Open calendar & agendas"
          className="flex items-center gap-1.5 rounded-l-[6px] border border-r-0 border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-2.5 py-2.5 text-xs font-semibold text-[#0b5ea2] shadow-[var(--sl-shadow-s)] transition hover:bg-[var(--sl-bg-subtle)] dark:text-sky-300"
        >
          <PanelRightOpen size={16} />
        </button>
      </div>
    )
  }

  return (
    <section
      aria-label="Admin quick actions and calendar"
      className="fixed inset-y-0 right-0 z-30 hidden w-80 flex-col border-l border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text)] shadow-[var(--sl-shadow-xs)] xl:flex"
    >
      {/* Vaadin Lumo App Panel Header */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--sl-border)] px-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-[#132a3f] text-[#FFF200]">
            <Calendar size={16} />
          </span>
          <div>
            <p className="text-[14px] font-semibold leading-tight text-[var(--sl-text-header)]">
              Calendar &amp; Agenda
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-[var(--sl-text-muted)]">
              <Clock size={11} /> {formattedTime} · {formattedDate}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void loadCalendarData()}
            aria-label="Refresh calendar agendas"
            title="Refresh calendar flags"
            className="flex h-8 w-8 items-center justify-center rounded-[4px] text-[var(--sl-text-secondary)] transition hover:bg-[var(--sl-bg-hover)] hover:text-[var(--sl-text-header)]"
          >
            <RefreshCw size={14} className={loadingAgenda ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse quick actions sidebar"
            title="Collapse panel"
            className="flex h-8 w-8 items-center justify-center rounded-[4px] text-[var(--sl-text-secondary)] transition hover:bg-[var(--sl-bg-hover)] hover:text-[var(--sl-text-header)]"
          >
            <PanelRightClose size={16} />
          </button>
        </div>
      </div>

      {/* Scrollable Workspace Body */}
      <div className="flex-1 space-y-3.5 overflow-y-auto p-3.5 pb-24">
        {/* Live Operating Status Bar (Vaadin Lumo Flat Card 6810:5398 + Badge 1468:10581) */}
        <div className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-[var(--sl-text-secondary)]">Campus Library Status</p>
            <p className="truncate text-xs font-semibold text-[var(--sl-text-header)]">{todayOperating.label}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-[25px] px-2.5 py-0.5 text-[11px] font-semibold ${
                todayOperating.isClosed
                  ? 'bg-[#fef2f2] text-[#991b1b] dark:bg-red-950/40 dark:text-red-300'
                  : 'bg-[#f0fdf4] text-[#166534] dark:bg-emerald-950/40 dark:text-emerald-300'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  todayOperating.isClosed ? 'bg-[#b42318]' : 'bg-[#166534]'
                }`}
              />
              {todayOperating.isClosed ? 'Closed' : 'Open'}
            </span>
            <button
              type="button"
              onClick={() => navigate(schedulePath)}
              className="rounded-[4px] px-2 py-1 text-[11px] font-semibold text-[#0b5ea2] transition hover:bg-[#0b5ea2]/10 dark:text-sky-300"
            >
              Hours
            </button>
          </div>
        </div>

        {/* Vaadin Lumo Date Picker Calendar (Figma Node 292:859 + 1307:1800 + 5475:7240) */}
        <div
          data-node-id="292:859"
          className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-3 shadow-[var(--sl-shadow-xs)]"
        >
          {/* Month Header */}
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-[14px] font-semibold text-[var(--sl-text-header)]">{monthLabel}</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                className="flex h-7 w-7 items-center justify-center rounded-[4px] text-[var(--sl-text-secondary)] transition hover:bg-[var(--sl-bg-hover)] hover:text-[var(--sl-text-header)]"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                onClick={() => {
                  const [y, m] = todayKey.split('-').map(Number)
                  setViewMonth(new Date(y, (m || 1) - 1, 1))
                  setSelectedDateKey(todayKey)
                }}
                className="h-7 rounded-[4px] px-2 text-xs font-semibold text-[#0b5ea2] transition hover:bg-[#0b5ea2]/10 dark:text-sky-300"
              >
                Today
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                className="flex h-7 w-7 items-center justify-center rounded-[4px] text-[var(--sl-text-secondary)] transition hover:bg-[var(--sl-bg-hover)] hover:text-[var(--sl-text-header)]"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          {/* Weekday Row (Figma Node 292:804: 13px regular tertiary text) */}
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-[var(--sl-text-muted)]">
            {WEEKDAYS.map((day) => (
              <span key={day} className={day === 'Sun' ? 'text-[#b42318] dark:text-red-400' : ''}>
                {day}
              </span>
            ))}
          </div>

          {/* 36x36px Lumo Day Grid (Selected day 1307:1800, Focused/Today day 5475:7240) */}
          <div className="mt-1.5 grid grid-cols-7 gap-1 text-center">
            {calendarCells.map((cell, index) => {
              if (!cell.day || !cell.dateKey) {
                return <span key={`empty-${index}`} className="h-9" />
              }
              const isSelected = cell.dateKey === selectedDateKey
              return (
                <button
                  key={cell.dateKey}
                  type="button"
                  onClick={() => setSelectedDateKey(cell.dateKey!)}
                  aria-label={`${cell.dateKey}${cell.isClosed ? ' (Closed)' : ''}${cell.totalFlags ? ` (${cell.totalFlags} items)` : ''}`}
                  aria-pressed={isSelected}
                  className={`relative flex h-9 w-full flex-col items-center justify-center rounded-[4px] text-[13px] tabular-nums transition ${
                    isSelected
                      ? 'bg-[#0b5ea2] font-semibold text-white shadow-[var(--sl-shadow-xs)]'
                      : cell.isToday
                        ? 'border-2 border-[#0b5ea2]/80 font-semibold text-[#0b5ea2] dark:border-sky-400 dark:text-sky-300'
                        : cell.isDatedClosure
                          ? 'bg-[#fef2f2] font-semibold text-[#991b1b] hover:bg-red-100/80 dark:bg-red-950/35 dark:text-red-300'
                          : cell.isClosed
                            ? 'text-[#b42318]/80 hover:bg-[var(--sl-bg-hover)] dark:text-red-400/80'
                            : 'text-[var(--sl-text)] hover:bg-[var(--sl-bg-hover)]'
                  }`}
                >
                  <span className="leading-none">{cell.day}</span>
                  {/* Semantic Event / Closure Indicator Dots */}
                  {cell.isDatedClosure || cell.hasReservation || cell.hasTransaction || cell.hasNotice ? (
                    <span className="mt-0.5 flex items-center justify-center gap-0.5">
                      {cell.isDatedClosure ? (
                        <span
                          title="Closure date"
                          className={`h-1 w-1 rounded-full ${isSelected ? 'bg-[#FFF200]' : 'bg-[#b42318]'}`}
                        />
                      ) : null}
                      {cell.hasReservation ? (
                        <span
                          title="Reservations or pickups"
                          className={`h-1 w-1 rounded-full ${isSelected ? 'bg-amber-200' : 'bg-[#b45309]'}`}
                        />
                      ) : null}
                      {cell.hasTransaction ? (
                        <span
                          title="Transactions recorded"
                          className={`h-1 w-1 rounded-full ${isSelected ? 'bg-white' : 'bg-[#0b5ea2]'}`}
                        />
                      ) : null}
                      {cell.hasNotice ? (
                        <span
                          title="Notices or events"
                          className={`h-1 w-1 rounded-full ${isSelected ? 'bg-emerald-200' : 'bg-[#166534]'}`}
                        />
                      ) : null}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>

          {/* Flag Legend Strip */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 border-t border-[var(--sl-border)] pt-2 text-[10px] font-medium text-[var(--sl-text-muted)]">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#b42318]" /> Closure
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#b45309]" /> Reservation
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0b5ea2]" /> Transaction
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#166534]" /> Notice
            </span>
          </div>
        </div>

        {/* Selected Day Agenda & Flags Card (Vaadin Lumo Outlined Card 6810:5428) */}
        <div
          aria-live="polite"
          className="space-y-2.5 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-3.5 shadow-[var(--sl-shadow-xs)]"
        >
          <div className="flex items-start justify-between gap-2 border-b border-[var(--sl-border)] pb-2.5">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sl-text-muted)]">
                Day Agenda
              </p>
              <h3 className="truncate text-[14px] font-semibold text-[var(--sl-text-header)]">
                {selectedDateHeading}
              </h3>
            </div>
            <span
              className={`shrink-0 rounded-[4px] px-2 py-0.5 text-[11px] font-semibold ${
                selectedOperating.isClosed
                  ? 'bg-[#fef2f2] text-[#991b1b] dark:bg-red-950/40 dark:text-red-300'
                  : 'bg-[#f0fdf4] text-[#166534] dark:bg-emerald-950/40 dark:text-emerald-300'
              }`}
            >
              {selectedOperating.isClosed ? 'Closed' : 'Open'}
            </span>
          </div>

          {/* Closure / Operating Schedule Flag */}
          {selectedOperating.isClosed ? (
            <div
              role="status"
              className="flex items-start gap-2 rounded-[6px] border border-red-200 bg-[#fef2f2] p-2.5 text-xs text-[#991b1b] dark:border-red-900/50 dark:bg-red-950/35 dark:text-red-200"
            >
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#b42318] dark:text-red-400" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{selectedOperating.label}</p>
                <p className="mt-0.5 text-[11px] opacity-90">{selectedOperating.detail}</p>
                <p className="mt-1 text-[11px] font-medium">
                  Student &amp; faculty accounts are view-only during closures.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-[6px] bg-[var(--sl-bg-subtle)] px-2.5 py-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-medium text-[var(--sl-text-secondary)]">
                <CalendarClock size={13} className="text-[#0b5ea2] dark:text-sky-300" />
                {selectedOperating.label}
              </span>
              <button
                type="button"
                onClick={() => navigate(schedulePath)}
                className="text-[11px] font-semibold text-[#0b5ea2] hover:underline dark:text-sky-300"
              >
                Edit
              </button>
            </div>
          )}

          {/* Flagged Agenda Items for Selected Day */}
          {selectedAgenda.length > 0 ? (
            <ul className="max-h-60 divide-y divide-[var(--sl-border)] overflow-y-auto">
              {selectedAgenda.slice(0, 10).map((item) => {
                const badgeStyle =
                  item.tone === 'error'
                    ? 'bg-[#fef2f2] text-[#991b1b] dark:bg-red-950/40 dark:text-red-300'
                    : item.tone === 'warning'
                      ? 'bg-[#fffbeb] text-[#92400e] dark:bg-amber-950/40 dark:text-amber-300'
                      : item.tone === 'success'
                        ? 'bg-[#f0fdf4] text-[#166534] dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'bg-[#0b5ea2]/10 text-[#0b5ea2] dark:bg-sky-500/20 dark:text-sky-300'
                return (
                  <li key={item.id} className="py-2 first:pt-0.5 last:pb-0.5">
                    <button
                      type="button"
                      onClick={() => item.actionPath && navigate(item.actionPath)}
                      className="group w-full rounded-[4px] p-1 text-left transition hover:bg-[var(--sl-bg-hover)]"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className={`rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold ${badgeStyle}`}>
                          {item.badgeText}
                        </span>
                        {item.timeLabel ? (
                          <span className="text-[10px] tabular-nums text-[var(--sl-text-muted)]">
                            {item.timeLabel}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs font-semibold text-[var(--sl-text-header)] group-hover:text-[#0b5ea2] dark:group-hover:text-sky-300">
                        {item.title}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--sl-text-secondary)]">
                        {item.subtitle}
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="rounded-[6px] border border-dashed border-[var(--sl-border)] px-3 py-3 text-center">
              <p className="text-xs font-medium text-[var(--sl-text-secondary)]">
                No reservations, transactions, or notices flagged on this date.
              </p>
              <button
                type="button"
                onClick={() => navigate(schedulePath)}
                className="mt-1.5 text-[11px] font-semibold text-[#0b5ea2] hover:underline dark:text-sky-300"
              >
                Add closure or check library schedule
              </button>
            </div>
          )}
        </div>

        {/* Core Instant Shortcuts (Vaadin Lumo Side Nav Items 5232:2175) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <p className="text-[12px] font-semibold text-[var(--sl-text-secondary)]">Core Shortcuts</p>
            <span className="text-[11px] text-[var(--sl-text-muted)]">Vaadin Nav</span>
          </div>
          <nav aria-label="Core desk shortcuts" className="space-y-1">
            {coreShortcuts.map((shortcut) => {
              const Icon = shortcut.icon
              const isCurrent = location.pathname.startsWith(shortcut.path)
              return (
                <button
                  key={shortcut.path}
                  type="button"
                  data-node-id="5232:2175"
                  onClick={() => navigate(shortcut.path)}
                  className={`flex min-h-[40px] w-full items-center gap-3 rounded-[4px] border px-2.5 py-2 text-left transition ${
                    isCurrent
                      ? 'border-[#0b5ea2]/30 bg-[var(--sl-brand-soft)] text-[#0b5ea2] dark:text-sky-300'
                      : 'border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text)] hover:bg-[var(--sl-bg-hover)]'
                  }`}
                >
                  <Icon
                    size={18}
                    className={`shrink-0 ${
                      isCurrent ? 'text-[#0b5ea2] dark:text-sky-300' : 'text-[var(--sl-text-secondary)]'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium leading-tight">
                      {shortcut.title}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--sl-text-muted)]">
                      {shortcut.subtitle}
                    </span>
                  </span>
                  {shortcut.badge ? (
                    <span className="shrink-0 rounded-[25px] bg-[var(--sl-bg-subtle)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--sl-text-secondary)]">
                      {shortcut.badge}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </nav>
        </div>
      </div>
    </section>
  )
}
