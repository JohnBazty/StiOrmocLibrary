import {
  BookMarked,
  BookOpen,
  Calendar,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Megaphone,
  PanelRightClose,
  PanelRightOpen,
  Printer,
  SlidersHorizontal,
  Sparkles,
  StickyNote,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

type Role = 'admin' | 'librarian' | 'staff'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const
const NOTE_STORAGE_KEY = 'sti_ilms_admin_quick_shift_note_v1'

function getManilaNow() {
  return new Date()
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
  const [now, setNow] = useState(() => getManilaNow())
  const [viewMonth, setViewMonth] = useState(() => {
    const current = getManilaNow()
    return new Date(current.getFullYear(), current.getMonth(), 1)
  })
  const [selectedDay, setSelectedDay] = useState<number>(() => getManilaNow().getDate())
  const [shiftNote, setShiftNote] = useState<string>(() => {
    try {
      return window.localStorage.getItem(NOTE_STORAGE_KEY) ?? ''
    } catch {
      return ''
    }
  })

  useEffect(() => {
    const timer = window.setInterval(() => setNow(getManilaNow()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  function updateNote(next: string) {
    setShiftNote(next)
    try {
      window.localStorage.setItem(NOTE_STORAGE_KEY, next)
    } catch {
      // ignore storage quota errors
    }
  }

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
    const cells: Array<{ day: number | null; isToday: boolean; isSunday: boolean }> = []
    for (let i = 0; i < firstWeekday; i++) {
      cells.push({ day: null, isToday: false, isSunday: false })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d)
      const isToday =
        d === now.getDate() && month === now.getMonth() && year === now.getFullYear()
      cells.push({
        day: d,
        isToday,
        isSunday: dateObj.getDay() === 0,
      })
    }
    return cells
  }, [viewMonth, now])

  const prefix = role === 'admin' ? '/admin' : role === 'staff' ? '/staff' : '/librarian'

  const quickActions = useMemo(() => {
    if (role === 'admin') {
      return [
        {
          title: 'Manage accounts',
          subtitle: 'Approve or edit campus users',
          icon: Sparkles,
          path: '/admin/users',
          accent: 'bg-[#0b5ea2]/10 text-[#0b5ea2] dark:bg-sky-500/20 dark:text-sky-300',
        },
        {
          title: 'Review clearance',
          subtitle: 'Check student library clearance',
          icon: BookMarked,
          path: '/admin/clearance',
          accent: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        },
        {
          title: 'Operating schedule',
          subtitle: 'View library hours & closures',
          icon: CalendarClock,
          path: '/admin/library-schedule',
          accent: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
        },
      ]
    }
    if (role === 'staff') {
      return [
        {
          title: 'Open counter desk',
          subtitle: 'Borrow, return & renew books',
          icon: CalendarClock,
          path: '/staff/circulation',
          accent: 'bg-[#0b5ea2]/10 text-[#0b5ea2] dark:bg-sky-500/20 dark:text-sky-300',
        },
        {
          title: 'Review book queue',
          subtitle: 'Pickup & waitlist requests',
          icon: BookMarked,
          path: '/staff/reservations',
          accent: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        },
        {
          title: 'Check print jobs',
          subtitle: 'Release queued student prints',
          icon: Printer,
          path: '/staff/printing',
          accent: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
        },
        {
          title: 'Post announcement',
          subtitle: 'Publish campus notice',
          icon: Megaphone,
          path: '/staff/announcements',
          accent: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
        },
      ]
    }
    return [
      {
        title: 'Open counter desk',
        subtitle: 'Check out, return & renew books',
        icon: CalendarClock,
        path: '/librarian/circulation',
        accent: 'bg-[#0b5ea2]/10 text-[#0b5ea2] dark:bg-sky-500/20 dark:text-sky-300',
      },
      {
        title: 'Add or import books',
        subtitle: 'Catalog holdings & Excel import',
        icon: BookOpen,
        path: '/librarian/catalog',
        accent: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      },
      {
        title: 'Review book queue',
        subtitle: 'Ready pickups & waiting list',
        icon: BookMarked,
        path: '/librarian/reservations',
        accent: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
      },
      {
        title: 'Check print jobs',
        subtitle: 'Student printing queue',
        icon: Printer,
        path: '/librarian/printing',
        accent: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
      },
      {
        title: 'Reservations & renewals setup',
        subtitle: 'Expiry, waitlist cap & renewals',
        icon: Sparkles,
        path: '/librarian/maintenance?tab=reservations',
        accent: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
      },
      {
        title: 'Fine rules setup',
        subtitle: 'Hourly, daily & maximum fine cap',
        icon: SlidersHorizontal,
        path: '/librarian/maintenance?tab=fine-rules',
        accent: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
      },
      {
        title: 'Shelves & compartments',
        subtitle: 'Manage shelf locations & space',
        icon: MapPin,
        path: '/librarian/maintenance?tab=locations',
        accent: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
      },
      {
        title: 'Post announcement',
        subtitle: 'Broadcast notice to students',
        icon: Megaphone,
        path: '/librarian/announcements',
        accent: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
      },
    ]
  }, [role])

  if (!open) {
    return (
      <div className="fixed right-0 top-20 z-30 hidden xl:block">
        <button
          type="button"
          onClick={onToggle}
          aria-label="Open quick actions sidebar"
          title="Open quick actions & calendar"
          className="flex items-center gap-1.5 rounded-l-xl border border-r-0 border-slate-200 bg-white px-2.5 py-2.5 text-xs font-bold text-[#0b5ea2] shadow-md transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-sky-300"
        >
          <PanelRightOpen size={16} />
        </button>
      </div>
    )
  }

  const selectedDateFormatted = new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), selectedDay))

  return (
    <section
      aria-label="Admin quick actions and calendar"
      className="fixed inset-y-0 right-0 z-30 hidden w-80 flex-col border-l border-slate-200/80 bg-white/95 text-slate-900 shadow-sm backdrop-blur-md xl:flex dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-100"
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-slate-200/80 px-4 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0b5ea2] text-[#FFF200]">
            <Calendar size={16} />
          </span>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-slate-100">
              Quick Actions
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Calendar &amp; Admin Desk</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Collapse quick actions sidebar"
          title="Collapse panel"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <PanelRightClose size={17} />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4 pb-24">
        {/* Live Campus Clock & Status */}
        <div className="rounded-2xl bg-gradient-to-br from-[#132a3f] to-[#0b5ea2] p-4 text-white shadow-sm">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#FFF200]">
              <Clock size={11} /> Manila Campus Time
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Open
            </span>
          </div>
          <p className="mt-2 font-display text-2xl font-black tracking-tight">{formattedTime}</p>
          <p className="text-xs text-white/80">{formattedDate}</p>
          {role === 'librarian' ? (
            <button
              type="button"
              onClick={() => navigate('/librarian/maintenance?tab=schedule')}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/15 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/25"
            >
              <CalendarClock size={13} /> Manage library hours
            </button>
          ) : null}
        </div>

        {/* Mini Interactive Calendar */}
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
          <div className="mb-2.5 flex items-center justify-between">
            <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100">{monthLabel}</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() =>
                  setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
                }
                className="rounded-md p-1 text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  const current = getManilaNow()
                  setViewMonth(new Date(current.getFullYear(), current.getMonth(), 1))
                  setSelectedDay(current.getDate())
                }}
                className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-[#0b5ea2] hover:bg-[#0b5ea2]/10 dark:text-sky-300"
              >
                Today
              </button>
              <button
                type="button"
                aria-label="Next month"
                onClick={() =>
                  setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
                }
                className="rounded-md p-1 text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400">
            {WEEKDAYS.map((day) => (
              <span key={day} className={day === 'Su' ? 'text-rose-500' : ''}>
                {day}
              </span>
            ))}
          </div>

          <div className="mt-1.5 grid grid-cols-7 gap-1 text-center text-xs">
            {calendarCells.map((cell, index) => {
              if (!cell.day) {
                return <span key={`empty-${index}`} className="h-7" />
              }
              const isSelected = cell.day === selectedDay
              return (
                <button
                  key={cell.day}
                  type="button"
                  onClick={() => setSelectedDay(cell.day!)}
                  className={`relative flex h-7 w-full items-center justify-center rounded-lg text-xs font-semibold transition ${
                    cell.isToday
                      ? 'bg-[#0b5ea2] font-bold text-white shadow-2xs'
                      : isSelected
                        ? 'border border-[#0b5ea2] bg-[#0b5ea2]/10 font-bold text-[#0b5ea2] dark:border-sky-400 dark:text-sky-300'
                        : cell.isSunday
                          ? 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                          : 'text-slate-700 hover:bg-slate-200/70 dark:text-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {cell.day}
                  {cell.isToday ? (
                    <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-[#FFF200]" />
                  ) : null}
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-200/80 pt-2.5 text-[11px] dark:border-slate-700/60">
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              Selected: <strong>{selectedDateFormatted}</strong>
            </span>
            <button
              type="button"
              onClick={() =>
                navigate(
                  role === 'librarian'
                    ? '/librarian/maintenance?tab=schedule'
                    : `${prefix}/library-schedule`,
                )
              }
              className="font-bold text-[#0b5ea2] underline-offset-2 hover:underline dark:text-sky-300"
            >
              Schedule
            </button>
          </div>
        </div>

        {/* Quick Actions List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Instant Shortcuts
            </p>
            <span className="text-[10px] font-semibold text-slate-400">1-click</span>
          </div>
          <div className="space-y-1.5">
            {quickActions.map((action) => {
              const Icon = action.icon
              return (
                <button
                  key={action.path}
                  type="button"
                  onClick={() => navigate(action.path)}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-2.5 text-left transition hover:border-[#0b5ea2]/40 hover:bg-slate-50/90 dark:border-slate-800 dark:bg-slate-800/60 dark:hover:border-sky-500/40 dark:hover:bg-slate-800"
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${action.accent}`}>
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                      {action.title}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {action.subtitle}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Librarian Shift Scratchpad */}
        <div className="rounded-2xl border border-slate-200/80 bg-amber-50/50 p-3.5 dark:border-slate-800 dark:bg-amber-950/20">
          <label className="block">
            <span className="flex items-center justify-between text-xs font-extrabold text-slate-800 dark:text-amber-200">
              <span className="inline-flex items-center gap-1.5">
                <StickyNote size={14} className="text-amber-600 dark:text-amber-400" />
                Desk Shift Reminders
              </span>
              {shiftNote ? (
                <button
                  type="button"
                  onClick={() => updateNote('')}
                  className="text-[10px] font-bold text-slate-500 hover:text-red-600"
                >
                  Clear
                </button>
              ) : null}
            </span>
            <textarea
              rows={3}
              value={shiftNote}
              onChange={(event) => updateNote(event.target.value)}
              placeholder="Write quick desk reminders, accession numbers to check, or shift notes..."
              className="mt-2 w-full rounded-xl border border-amber-200/80 bg-white p-2.5 text-xs text-slate-800 outline-none focus:border-[#0b5ea2] dark:border-amber-800/40 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
        </div>
      </div>
    </section>
  )
}
