import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { useState } from 'react'
import { Button, SectionCard } from '../../components/ui'
import { UnsavedGuard } from '../../components/UnsavedChanges'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { notificationApi } from './notification-api'
import type { ManagedLibrarySchedule } from './types'
import { RefreshButton } from '../../components/RefreshButton'

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const calendarDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const field =
  'mt-1 min-h-[38px] w-full rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3 py-1.5 text-sm text-[var(--sl-text)] outline-none focus:border-[#0b5ea2] focus:ring-3 focus:ring-[#0b5ea2]/15'

const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)

function toIsoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function addDaysIso(iso: string, delta: number): string {
  const parsed = new Date(`${iso}T12:00:00+08:00`)
  parsed.setUTCDate(parsed.getUTCDate() + delta)
  return parsed.toISOString().slice(0, 10)
}

function expandDateRange(start: string, end: string): string[] {
  if (!start) return []
  if (!end || end === start) return [start]
  const [from, to] = start <= end ? [start, end] : [end, start]
  const dates: string[] = []
  let cursor = from
  // Guard against overly large accidental ranges (max 90 days per add).
  for (let i = 0; i < 90 && cursor <= to; i++) {
    dates.push(cursor)
    cursor = addDaysIso(cursor, 1)
  }
  return dates
}

type ClosureItem = ManagedLibrarySchedule['upcomingClosures'][number]
type ClosureGroup = {
  startDate: string
  endDate: string
  dates: string[]
  reason: string
  startsAt?: string | null
  endsAt?: string | null
}

/** Groups consecutive closure dates that share the same reason and hours into one readable multi-day entry. */
export function groupConsecutiveClosures(closures: ClosureItem[]): ClosureGroup[] {
  const sorted = [...closures].sort((a, b) => a.date.localeCompare(b.date))
  const groups: ClosureGroup[] = []
  for (const item of sorted) {
    const prev = groups[groups.length - 1]
    const samePolicy =
      prev &&
      prev.reason.trim() === item.reason.trim() &&
      (prev.startsAt ?? '') === (item.startsAt ?? '') &&
      (prev.endsAt ?? '') === (item.endsAt ?? '') &&
      addDaysIso(prev.endDate, 1) === item.date
    if (samePolicy) {
      prev.endDate = item.date
      prev.dates.push(item.date)
    } else {
      groups.push({
        startDate: item.date,
        endDate: item.date,
        dates: [item.date],
        reason: item.reason,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
      })
    }
  }
  return groups
}

function formatClosureRange(startDate: string, endDate: string, count: number): string {
  if (count <= 1 || startDate === endDate) return formatPhDate(startDate)
  return `${formatPhDate(startDate, 'medium')} – ${formatPhDate(endDate, 'medium')} (${count} days)`
}

function ClosureMultiCalendar({
  selectedDates,
  existingDates,
  minDate,
  onToggleDate,
}: {
  selectedDates: string[]
  existingDates: Set<string>
  minDate: string
  onToggleDate: (iso: string) => void
}) {
  const initial = new Date(`${minDate}T12:00:00+08:00`)
  const [viewYear, setViewYear] = useState(initial.getUTCFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getUTCMonth())

  const firstOfMonth = new Date(Date.UTC(viewYear, viewMonth, 1, 4, 0, 0))
  const startWeekday = firstOfMonth.getUTCDay()
  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0, 4, 0, 0)).getUTCDate()
  const monthLabel = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(firstOfMonth)
  const selectedSet = new Set(selectedDates)

  function shiftMonth(delta: number) {
    const next = new Date(Date.UTC(viewYear, viewMonth + delta, 1, 4, 0, 0))
    setViewYear(next.getUTCFullYear())
    setViewMonth(next.getUTCMonth())
  }

  return (
    <div className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => shiftMonth(-1)}
          className="inline-flex size-8 items-center justify-center rounded-[6px] border border-[var(--sl-border)] text-[var(--sl-text-secondary)] hover:bg-[var(--sl-bg-subtle)]"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <p className="text-sm font-semibold text-[var(--sl-text-header)]">{monthLabel}</p>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => shiftMonth(1)}
          className="inline-flex size-8 items-center justify-center rounded-[6px] border border-[var(--sl-border)] text-[var(--sl-text-secondary)] hover:bg-[var(--sl-bg-subtle)]"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[var(--sl-text-muted)]">
        {calendarDays.map((day) => (
          <div key={day} className="py-1">{day}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1" role="grid" aria-label={`Select closure days in ${monthLabel}`}>
        {Array.from({ length: startWeekday }).map((_, index) => (
          <div key={`pad-${index}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const dayNum = index + 1
          const iso = toIsoDate(viewYear, viewMonth, dayNum)
          const isPast = iso < minDate
          const isExisting = existingDates.has(iso)
          const isSelected = selectedSet.has(iso)
          return (
            <button
              key={iso}
              type="button"
              disabled={isPast || isExisting}
              aria-pressed={isSelected}
              aria-label={`${formatPhDate(iso, 'medium')}${isExisting ? ' (already closed)' : isSelected ? ' (selected)' : ''}`}
              onClick={() => onToggleDate(iso)}
              className={`min-h-8 rounded-[6px] text-xs font-medium tabular-nums transition-colors ${
                isSelected
                  ? 'bg-[#0b5ea2] font-bold text-white shadow-xs'
                  : isExisting
                    ? 'cursor-not-allowed bg-[#fee2e2] text-[#b42318] line-through opacity-80 dark:bg-[#991b1b]/35 dark:text-[#fca5a5]'
                    : isPast
                      ? 'cursor-not-allowed text-[var(--sl-text-muted)] opacity-40'
                      : 'text-[var(--sl-text)] hover:bg-[#0b5ea2]/12'
              }`}
            >
              {dayNum}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[11px] text-[var(--sl-text-muted)]">
        Click any dates to select or unselect multiple closure days (e.g. pick 3 days for a 3-day closure).
      </p>
    </div>
  )
}

function currentManilaDayOfWeek(): number {
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
  }).format(new Date())
  return ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[short] ?? 1
}

export function formatPhDate(value: string, style: 'long' | 'medium' = 'long') {
  if (!value) return value
  const parsed = new Date(`${value}T12:00:00+08:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: style })
}

export function formatManilaTime12(hhmm: string | null | undefined): string {
  if (!hhmm) return '—'
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim())
  if (!match) return hhmm
  const hours24 = Number(match[1])
  const period = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 || 12
  return `${hours12}:${match[2]} ${period}`
}

function ScheduleDetails({ data }: { data: ManagedLibrarySchedule }) {
  const todayDow = currentManilaDayOfWeek()
  const hasClosures = data.upcomingClosures.length > 0

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <SectionCard className="border-t-[3px] border-t-[#0f766e] p-5">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--sl-border)] pb-3.5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0f766e] dark:text-[#5eead4]">
              Regular hours
            </p>
            <h2 className="mt-0.5 font-display text-lg font-semibold text-[var(--sl-text-header)]">
              Weekly operating hours
            </h2>
            <p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">
              All times shown in 12-hour Manila time (PHT).
            </p>
          </div>
          <Clock size={18} className="mt-0.5 shrink-0 text-[#0f766e] dark:text-[#5eead4]" />
        </div>

        <ul className="mt-3 divide-y divide-[var(--sl-border)]">
          {data.weekly.map((day) => {
            const isToday = day.dayOfWeek === todayDow
            return (
              <li
                key={day.dayOfWeek}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-[8px] px-3 py-2.5 text-sm transition-colors ${
                  isToday ? 'bg-[#f0f7ff] dark:bg-[#0b5ea2]/18' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <strong className="font-semibold text-[var(--sl-text-header)]">
                    {weekdays[day.dayOfWeek - 1]}
                  </strong>
                  {isToday ? (
                    <span className="rounded-full bg-[#0b5ea2] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      Today
                    </span>
                  ) : null}
                </div>
                {day.isOpen ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#dcfce7]/75 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-[#166534] dark:bg-[#166534]/30 dark:text-[#86efac]">
                    <span className="size-1.5 rounded-full bg-[#16a34a]" aria-hidden="true" />
                    {formatManilaTime12(day.opensAt)} – {formatManilaTime12(day.closesAt)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fee2e2] px-2.5 py-0.5 text-xs font-semibold text-[#b42318] dark:bg-[#991b1b]/35 dark:text-[#fca5a5]">
                    <span className="size-1.5 rounded-full bg-[#dc2626]" aria-hidden="true" />
                    Closed
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </SectionCard>

      <SectionCard
        className={`border-t-[3px] p-5 ${
          hasClosures ? 'border-t-[#eab308]' : 'border-t-[#16a34a]'
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--sl-border)] pb-3.5">
          <div>
            <p
              className={`text-[11px] font-bold uppercase tracking-[0.12em] ${
                hasClosures
                  ? 'text-[#92400e] dark:text-[#fde047]'
                  : 'text-[#166534] dark:text-[#86efac]'
              }`}
            >
              Schedule exceptions
            </p>
            <h2 className="mt-0.5 font-display text-lg font-semibold text-[var(--sl-text-header)]">
              Upcoming closures &amp; time windows
            </h2>
            <p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">
              These dates and closure hours override the regular weekly hours.
            </p>
          </div>
          <CalendarDays
            size={18}
            className={`mt-0.5 shrink-0 ${
              hasClosures ? 'text-[#eab308]' : 'text-[#16a34a]'
            }`}
          />
        </div>

        {hasClosures ? (
          <ul className="mt-3.5 space-y-2.5">
            {groupConsecutiveClosures(data.upcomingClosures).map((group) => (
              <li
                key={group.startDate}
                className="rounded-[10px] border border-[#dc2626]/20 bg-[#fef2f2]/60 p-3.5 dark:border-[#dc2626]/30 dark:bg-[#991b1b]/15"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm font-semibold text-[var(--sl-text-header)]">
                    {formatClosureRange(group.startDate, group.endDate, group.dates.length)}
                  </strong>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#fee2e2] px-2.5 py-0.5 text-xs font-semibold tabular-nums text-[#b42318] dark:bg-[#991b1b]/40 dark:text-[#fca5a5]">
                    <Clock size={11} />
                    {group.startsAt && group.endsAt
                      ? `${formatManilaTime12(group.startsAt)} – ${formatManilaTime12(group.endsAt)}`
                      : 'All day'}
                  </span>
                </div>
                <p className="mt-1.5 break-words text-sm text-[var(--sl-text-secondary)]">
                  {group.dates.length > 1
                    ? `Library closed for ${group.dates.length} days: ${group.reason}`
                    : group.reason}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 flex items-start gap-3 rounded-[10px] border border-[#16a34a]/30 bg-[#dcfce7]/55 p-4 text-[#166534] dark:border-[#16a34a]/35 dark:bg-[#166534]/20 dark:text-[#86efac]">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Regular weekly hours apply</p>
              <p className="mt-0.5 text-xs opacity-90">No upcoming closures are scheduled.</p>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

export function LibrarySchedulePage({ manage = false, embedded = false }: { manage?: boolean; embedded?: boolean }) {
  const query = useLiveQuery('library-schedule', (signal) => notificationApi.librarySchedule(signal))
  const [draft, setDraft] = useState<ManagedLibrarySchedule | null>(null)
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [closureDate, setClosureDate] = useState('')
  const [closureEndDate, setClosureEndDate] = useState('')
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [closureAllDay, setClosureAllDay] = useState(true)
  const [closureStart, setClosureStart] = useState('08:00')
  const [closureEnd, setClosureEnd] = useState('17:00')
  const [closureReason, setClosureReason] = useState('')

  function toggleCalendarDate(iso: string) {
    setSelectedDates((prev) =>
      prev.includes(iso) ? prev.filter((item) => item !== iso) : [...prev, iso].sort(),
    )
    setError('')
  }

  function effectiveNewClosureDates(): string[] {
    if (selectedDates.length > 0) return [...selectedDates].sort()
    if (!closureDate) return []
    return expandDateRange(closureDate, closureEndDate || closureDate)
  }

  function addClosure() {
    if (!draft) return
    const datesToAdd = effectiveNewClosureDates()
    if (!datesToAdd.length || datesToAdd.some((d) => d < today()) || !closureReason.trim()) {
      setError('Select one or more dates today or later and enter a closure reason.')
      return
    }
    if (closureDate && closureEndDate && closureEndDate < closureDate) {
      setError('Closure end date must be on or after the start date.')
      return
    }
    if (!closureAllDay && (!closureStart || !closureEnd || closureEnd <= closureStart)) {
      setError('Closure end time must be after the closure start time.')
      return
    }
    const existing = new Set(draft.upcomingClosures.map((closure) => closure.date))
    const duplicates = datesToAdd.filter((d) => existing.has(d))
    if (duplicates.length > 0) {
      setError(
        duplicates.length === 1
          ? `${formatPhDate(duplicates[0], 'medium')} already has a closure. Edit its reason or hours below.`
          : `Some selected dates already have a closure (${duplicates.map((d) => formatPhDate(d, 'medium')).join(', ')}).`,
      )
      return
    }
    const reasonText = closureReason.trim()
    const newEntries = datesToAdd.map((date) =>
      closureAllDay
        ? { date, reason: reasonText }
        : { date, reason: reasonText, startsAt: closureStart, endsAt: closureEnd },
    )
    setDraft({
      ...draft,
      upcomingClosures: [...draft.upcomingClosures, ...newEntries].sort((a, b) => a.date.localeCompare(b.date)),
    })
    setClosureDate('')
    setClosureEndDate('')
    setSelectedDates([])
    setClosureAllDay(true)
    setClosureStart('08:00')
    setClosureEnd('17:00')
    setClosureReason('')
    setError('')
  }

  function reviewChanges() {
    if (!draft) return
    if (closureDate || closureEndDate || selectedDates.length > 0 || closureReason.trim()) {
      setError('Add the closure to the list or clear its fields before reviewing.')
      return
    }
    if (!draft.weekly.some((day) => day.isOpen)) {
      setError('Keep at least one operating day. Use dated closures for temporary breaks.')
      return
    }
    if (draft.weekly.some((day) => day.isOpen && (!day.opensAt || !day.closesAt || day.closesAt <= day.opensAt))) {
      setError('Each open day needs a closing time after its opening time.')
      return
    }
    if (
      draft.upcomingClosures.some(
        (closure) =>
          !closure.reason.trim() ||
          closure.reason.trim().length > 191 ||
          closure.date < today() ||
          (Boolean(closure.startsAt) !== Boolean(closure.endsAt)) ||
          (closure.startsAt && closure.endsAt && closure.endsAt <= closure.startsAt),
      )
    ) {
      setError('Every closure needs a current or future date, a valid closure time (or All day), and a reason.')
      return
    }
    setError('')
    setReview(true)
  }

  async function save() {
    if (!draft || busy || !review) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await notificationApi.saveLibrarySchedule(draft)
      setDraft(null)
      setReview(false)
      setNotice('Library schedule saved. All roles will see the updated hours and closures.')
      await query.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The schedule could not be saved.')
      setReview(false)
    } finally {
      setBusy(false)
    }
  }

  const todayRow = query.data?.weekly.find((day) => day.dayOfWeek === currentManilaDayOfWeek())
  const actions = (
    <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
      <RefreshButton label="Refresh schedule" onRefresh={() => query.refresh()} variant="secondary" disabled={busy} />
      {manage && !draft && query.data ? (
        <Button
          onClick={() => {
            setDraft(structuredClone(query.data!))
            setReview(false)
            setError('')
            setNotice('')
          }}
        >
          Edit schedule
        </Button>
      ) : null}
    </div>
  )

  return (
    <div className="space-y-5">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-[var(--sl-text-header)]">
            Library schedule maintenance
          </h2>
          {actions}
        </div>
      ) : (
        <header className="flex flex-col gap-4 rounded-[12px] border border-[var(--sl-border)] border-t-[3px] border-t-[#0f766e] bg-gradient-to-r from-[#f0fdfa] via-[var(--sl-bg-elevated)] to-[#fffdf0] p-5 shadow-[var(--sl-shadow-xs)] dark:from-[#122a2a] dark:via-[#1a2232] dark:to-[#24251c] lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-[#0f766e]/14 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#0f766e] dark:bg-[#0f766e]/25 dark:text-[#5eead4]">
                Library information
              </span>
              {todayRow ? (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    todayRow.isOpen
                      ? 'bg-[#dcfce7] text-[#166534] dark:bg-[#166534]/30 dark:text-[#86efac]'
                      : 'bg-[#fee2e2] text-[#b42318] dark:bg-[#991b1b]/30 dark:text-[#fca5a5]'
                  }`}
                >
                  <span
                    className={`size-1.5 rounded-full ${
                      todayRow.isOpen ? 'bg-[#16a34a]' : 'bg-[#dc2626]'
                    }`}
                  />
                  {todayRow.isOpen
                    ? `Open today · ${formatManilaTime12(todayRow.opensAt)} – ${formatManilaTime12(todayRow.closesAt)}`
                    : 'Closed today'}
                </span>
              ) : null}
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[var(--sl-text-header)] sm:text-[1.75rem]">
              Library schedule
            </h1>
            <p className="mt-1 text-sm text-[var(--sl-text-secondary)]">
              Weekly hours, closure dates, and closure time windows in Manila time (PHT).
            </p>
          </div>
          {actions}
        </header>
      )}

      {error || query.error ? (
        <p role="alert" className="auth-error rounded-[8px] p-3 text-sm">
          {error || query.error?.message}
        </p>
      ) : null}
      {notice ? (
        <p role="status" data-tone="success" className="rounded-[8px] border border-green-600/30 p-3 text-sm">
          {notice}
        </p>
      ) : null}
      {!query.data && query.loading ? <p role="status">Loading library schedule…</p> : null}
      {query.data && !draft ? <ScheduleDetails data={query.data} /> : null}

      {draft ? (
        <UnsavedGuard
          dirty={JSON.stringify(draft) !== JSON.stringify(query.data)}
          onSave={async () => {
            reviewChanges()
            return false
          }}
        >
          <section className="space-y-5 rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-5 shadow-[var(--sl-shadow-xs)]">
            {review ? (
              <>
                <h2 className="text-lg font-semibold text-[var(--sl-text-header)]">Review library schedule</h2>
                <ScheduleDetails data={draft} />
                <p className="text-sm text-[var(--sl-text-secondary)]">
                  Confirm the full weekly schedule and closure list. Removed future closures will no longer close the library.
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <Button disabled={busy} onClick={() => void save()}>
                    {busy ? 'Saving…' : 'Confirm schedule changes'}
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => setReview(false)}>
                    Change details
                  </Button>
                </div>
              </>
            ) : (
              <>
                <fieldset disabled={busy} className="space-y-2.5">
                  <legend className="mb-2 text-base font-semibold text-[var(--sl-text-header)]">
                    Weekly opening hours (Manila time)
                  </legend>
                  {draft.weekly.map((day, index) => (
                    <div
                      key={day.dayOfWeek}
                      className="grid items-end gap-3 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/40 p-3 sm:grid-cols-3"
                    >
                      <label className="flex min-h-[38px] items-center gap-2 text-sm font-semibold text-[var(--sl-text-header)]">
                        <input
                          type="checkbox"
                          checked={day.isOpen}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              weekly: draft.weekly.map((value, position) =>
                                position === index
                                  ? {
                                      ...value,
                                      isOpen: event.target.checked,
                                      opensAt: value.opensAt ?? '08:00',
                                      closesAt: value.closesAt ?? '17:00',
                                    }
                                  : value,
                              ),
                            })
                          }
                        />
                        {weekdays[day.dayOfWeek - 1]} open
                      </label>
                      <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
                        {weekdays[day.dayOfWeek - 1]} opens
                        <input
                          className={field}
                          type="time"
                          disabled={!day.isOpen}
                          value={day.opensAt ?? ''}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              weekly: draft.weekly.map((value, position) =>
                                position === index ? { ...value, opensAt: event.target.value } : value,
                              ),
                            })
                          }
                        />
                      </label>
                      <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
                        {weekdays[day.dayOfWeek - 1]} closes
                        <input
                          className={field}
                          type="time"
                          disabled={!day.isOpen}
                          value={day.closesAt ?? ''}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              weekly: draft.weekly.map((value, position) =>
                                position === index ? { ...value, closesAt: event.target.value } : value,
                              ),
                            })
                          }
                        />
                      </label>
                      {day.dayOfWeek <= 6 ? (
                        <div className="sm:col-span-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Apply ${weekdays[day.dayOfWeek - 1]} hours to Monday–Saturday`}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                // Sunday is never part of this shortcut; set it on its own row.
                                weekly: draft.weekly.map((value) =>
                                  value.dayOfWeek <= 6
                                    ? { ...value, isOpen: day.isOpen, opensAt: day.opensAt, closesAt: day.closesAt }
                                    : value,
                                ),
                              })
                            }
                          >
                            Apply these hours to Monday–Saturday
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </fieldset>

                <fieldset disabled={busy} className="space-y-3 border-t border-[var(--sl-border)] pt-4">
                  <legend className="mb-1 text-base font-semibold text-[var(--sl-text-header)]">
                    Dated closures &amp; closure time windows
                  </legend>
                  <p className="text-xs text-[var(--sl-text-muted)]">
                    Schedule either an all-day closure or a specific closure time window (e.g., 1:00 PM – 5:00 PM Manila time).
                  </p>

                  {draft.upcomingClosures.map((closure) => {
                    const isAllDay = !closure.startsAt && !closure.endsAt
                    return (
                      <div
                        key={closure.date}
                        className="space-y-2.5 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/40 p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-[var(--sl-text-header)]">
                            {formatPhDate(closure.date)}
                          </span>
                          <div className="flex items-center gap-3">
                            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--sl-text-secondary)]">
                              <input
                                type="checkbox"
                                checked={isAllDay}
                                onChange={(event) =>
                                  setDraft({
                                    ...draft,
                                    upcomingClosures: draft.upcomingClosures.map((value) =>
                                      value.date === closure.date
                                        ? event.target.checked
                                          ? { date: value.date, reason: value.reason }
                                          : { ...value, startsAt: '08:00', endsAt: '17:00' }
                                        : value,
                                    ),
                                  })
                                }
                              />
                              All day
                            </label>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                setDraft({
                                  ...draft,
                                  upcomingClosures: draft.upcomingClosures.filter(
                                    (value) => value.date !== closure.date,
                                  ),
                                })
                              }
                            >
                              Remove {formatPhDate(closure.date, 'medium')}
                            </Button>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-4">
                          <label className="text-xs font-semibold text-[var(--sl-text-secondary)] sm:col-span-2">
                            Reason for {formatPhDate(closure.date)}
                            <input
                              className={field}
                              value={closure.reason}
                              maxLength={170}
                              onChange={(event) =>
                                setDraft({
                                  ...draft,
                                  upcomingClosures: draft.upcomingClosures.map((value) =>
                                    value.date === closure.date ? { ...value, reason: event.target.value } : value,
                                  ),
                                })
                              }
                            />
                          </label>
                          {!isAllDay ? (
                            <>
                              <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
                                Closure starts
                                <input
                                  type="time"
                                  className={field}
                                  value={closure.startsAt ?? '08:00'}
                                  onChange={(event) =>
                                    setDraft({
                                      ...draft,
                                      upcomingClosures: draft.upcomingClosures.map((value) =>
                                        value.date === closure.date
                                          ? { ...value, startsAt: event.target.value }
                                          : value,
                                      ),
                                    })
                                  }
                                />
                              </label>
                              <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
                                Closure ends
                                <input
                                  type="time"
                                  className={field}
                                  value={closure.endsAt ?? '17:00'}
                                  onChange={(event) =>
                                    setDraft({
                                      ...draft,
                                      upcomingClosures: draft.upcomingClosures.map((value) =>
                                        value.date === closure.date
                                          ? { ...value, endsAt: event.target.value }
                                          : value,
                                      ),
                                    })
                                  }
                                />
                              </label>
                            </>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}

                  {/* Add new closure form */}
                  <div className="space-y-3 rounded-[8px] border border-dashed border-[var(--sl-border-strong)] p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-[var(--sl-text-header)]">Add a new closure (single day or multiple days)</p>
                      <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--sl-text-secondary)]">
                        <input
                          type="checkbox"
                          checked={closureAllDay}
                          onChange={(event) => setClosureAllDay(event.target.checked)}
                        />
                        All-day closure
                      </label>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
                      <ClosureMultiCalendar
                        selectedDates={selectedDates}
                        existingDates={new Set(draft.upcomingClosures.map((c) => c.date))}
                        minDate={today()}
                        onToggleDate={toggleCalendarDate}
                      />
                      <div className="space-y-3">
                        {selectedDates.length > 0 ? (
                          <div className="rounded-[8px] border border-[#0b5ea2]/25 bg-[#f0f7ff] p-2.5 text-xs text-[var(--sl-text-header)] dark:bg-[#0b5ea2]/15">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <strong>{selectedDates.length} {selectedDates.length === 1 ? 'day' : 'days'} selected:</strong>
                              <button
                                type="button"
                                className="font-semibold text-[#0b5ea2] underline dark:text-[#93c5fd]"
                                onClick={() => setSelectedDates([])}
                              >
                                Clear selection
                              </button>
                            </div>
                            <p className="mt-1 text-[var(--sl-text-secondary)]">
                              {selectedDates.map((d) => formatPhDate(d, 'medium')).join(', ')}
                            </p>
                          </div>
                        ) : (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
                              Closure date
                              <input
                                type="date"
                                min={today()}
                                className={field}
                                value={closureDate}
                                onChange={(event) => setClosureDate(event.target.value)}
                              />
                            </label>
                            <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
                              End date (optional, for multi-day)
                              <input
                                type="date"
                                min={closureDate || today()}
                                className={field}
                                value={closureEndDate}
                                onChange={(event) => setClosureEndDate(event.target.value)}
                              />
                            </label>
                          </div>
                        )}
                        {!closureAllDay ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
                              Closure starts
                              <input
                                type="time"
                                className={field}
                                value={closureStart}
                                onChange={(event) => setClosureStart(event.target.value)}
                              />
                            </label>
                            <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
                              Closure ends
                              <input
                                type="time"
                                className={field}
                                value={closureEnd}
                                onChange={(event) => setClosureEnd(event.target.value)}
                              />
                            </label>
                          </div>
                        ) : null}
                        <label className="block text-xs font-semibold text-[var(--sl-text-secondary)]">
                          Closure reason
                          <input
                            className={field}
                            maxLength={170}
                            placeholder="e.g., Campus holiday, library maintenance, inventory"
                            value={closureReason}
                            onChange={(event) => setClosureReason(event.target.value)}
                          />
                        </label>
                        <div>
                          <Button variant="secondary" onClick={addClosure}>
                            {effectiveNewClosureDates().length > 1
                              ? `Add ${effectiveNewClosureDates().length}-day closure`
                              : 'Add closure'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </fieldset>

                <div className="flex flex-wrap gap-2.5 border-t border-[var(--sl-border)] pt-4">
                  <Button onClick={reviewChanges}>Review schedule changes</Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setDraft(null)
                      setReview(false)
                      setClosureDate('')
                      setClosureEndDate('')
                      setSelectedDates([])
                      setClosureAllDay(true)
                      setClosureStart('08:00')
                      setClosureEnd('17:00')
                      setClosureReason('')
                      setError('')
                    }}
                  >
                    Cancel changes
                  </Button>
                </div>
              </>
            )}
          </section>
        </UnsavedGuard>
      ) : null}
    </div>
  )
}
