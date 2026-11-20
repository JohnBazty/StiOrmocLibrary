import { Clock, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Button, PageHeader, SectionCard } from '../../components/ui'
import { UnsavedGuard } from '../../components/UnsavedChanges'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { notificationApi } from './notification-api'
import type { ManagedLibrarySchedule } from './types'
import { RefreshButton } from '../../components/RefreshButton'

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const field =
  'mt-1 min-h-[38px] w-full rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3 py-1.5 text-sm text-[var(--sl-text)] outline-none focus:border-[#0b5ea2] focus:ring-3 focus:ring-[#0b5ea2]/15'

const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)

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
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard className="p-5">
        <h2 className="text-base font-semibold text-[var(--sl-text-header)]">Weekly operating hours</h2>
        <p className="mt-1 text-xs text-[var(--sl-text-muted)]">All times shown in 12-hour Manila time (PHT).</p>
        <ul className="mt-3 divide-y divide-[var(--sl-border)]">
          {data.weekly.map((day) => (
            <li key={day.dayOfWeek} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <strong className="font-semibold text-[var(--sl-text-header)]">{weekdays[day.dayOfWeek - 1]}</strong>
              <span
                className={
                  day.isOpen
                    ? 'font-medium tabular-nums text-[var(--sl-text)]'
                    : 'rounded-[4px] bg-[#fef2f2] px-2 py-0.5 text-xs font-semibold text-[#991b1b] dark:bg-red-950/40 dark:text-red-300'
                }
              >
                {day.isOpen
                  ? `${formatManilaTime12(day.opensAt)} – ${formatManilaTime12(day.closesAt)}`
                  : 'Closed'}
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>
      <SectionCard className="p-5">
        <h2 className="text-base font-semibold text-[var(--sl-text-header)]">Upcoming closures &amp; time windows</h2>
        <p className="mt-1 text-xs text-[var(--sl-text-muted)]">
          These dates and closure hours override the regular weekly hours.
        </p>
        {data.upcomingClosures.length ? (
          <ul className="mt-3 divide-y divide-[var(--sl-border)]">
            {data.upcomingClosures.map((closure) => (
              <li key={closure.date} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm font-semibold text-[var(--sl-text-header)]">
                    {formatPhDate(closure.date)}
                  </strong>
                  <span className="inline-flex items-center gap-1 rounded-[4px] bg-[#fef2f2] px-2 py-0.5 text-xs font-semibold tabular-nums text-[#991b1b] dark:bg-red-950/40 dark:text-red-300">
                    <Clock size={11} />
                    {closure.startsAt && closure.endsAt
                      ? `${formatManilaTime12(closure.startsAt)} – ${formatManilaTime12(closure.endsAt)}`
                      : 'All day'}
                  </span>
                </div>
                <p className="mt-1 break-words text-sm text-[var(--sl-text-secondary)]">{closure.reason}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-[var(--sl-text-secondary)]">No upcoming closures are scheduled.</p>
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
  const [closureAllDay, setClosureAllDay] = useState(true)
  const [closureStart, setClosureStart] = useState('08:00')
  const [closureEnd, setClosureEnd] = useState('17:00')
  const [closureReason, setClosureReason] = useState('')

  function addClosure() {
    if (!draft) return
    if (!closureDate || closureDate < today() || !closureReason.trim()) {
      setError('Choose a date today or later and enter a closure reason.')
      return
    }
    if (!closureAllDay && (!closureStart || !closureEnd || closureEnd <= closureStart)) {
      setError('Closure end time must be after the closure start time.')
      return
    }
    if (draft.upcomingClosures.some((closure) => closure.date === closureDate)) {
      setError('That date already has a closure. Edit its reason or hours below.')
      return
    }
    const nextEntry = closureAllDay
      ? { date: closureDate, reason: closureReason.trim() }
      : { date: closureDate, reason: closureReason.trim(), startsAt: closureStart, endsAt: closureEnd }
    setDraft({
      ...draft,
      upcomingClosures: [...draft.upcomingClosures, nextEntry].sort((a, b) => a.date.localeCompare(b.date)),
    })
    setClosureDate('')
    setClosureAllDay(true)
    setClosureStart('08:00')
    setClosureEnd('17:00')
    setClosureReason('')
    setError('')
  }

  function reviewChanges() {
    if (!draft) return
    if (closureDate || closureReason.trim()) {
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

  return (
    <div className="space-y-4">
      {embedded ? (
        <h2 className="text-xl font-semibold text-[var(--sl-text-header)]">Library schedule maintenance</h2>
      ) : (
        <PageHeader
          eyebrow="Library information"
          title="Library schedule"
          description="Weekly hours, closure dates, and closure time windows in Manila time (PHT)."
        />
      )}

      <div className="flex items-start gap-3 rounded-[8px] border border-[var(--sl-info-border)] bg-[var(--sl-info-soft)] px-4 py-3 text-xs sm:text-sm text-[var(--sl-text)]">
        <ShieldAlert size={18} className="mt-0.5 shrink-0 text-[#0b5ea2] dark:text-sky-300" />
        <div>
          <p className="font-semibold text-[var(--sl-text-header)]">
            Manila time (12-hour AM/PM) &amp; View-Only Enforcement
          </p>
          <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
            Hours use Asia/Manila time and Philippine date format for library access, due-date calculations, and overdue fines. During closed hours or scheduled closures, <strong>Student and Faculty accounts remain view-only</strong> (borrowing, reservations, check-ins, and printing are disabled).
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5">
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
                      <p className="text-xs font-semibold text-[var(--sl-text-header)]">Add a new closure</p>
                      <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--sl-text-secondary)]">
                        <input
                          type="checkbox"
                          checked={closureAllDay}
                          onChange={(event) => setClosureAllDay(event.target.checked)}
                        />
                        All-day closure
                      </label>
                    </div>
                    <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                      {!closureAllDay ? (
                        <>
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
                        </>
                      ) : null}
                      <label
                        className={`text-xs font-semibold text-[var(--sl-text-secondary)] ${
                          closureAllDay ? 'sm:col-span-2' : 'sm:col-span-2 lg:col-span-3'
                        }`}
                      >
                        Closure reason
                        <input
                          className={field}
                          maxLength={170}
                          placeholder="e.g., Campus holiday, library maintenance, inventory"
                          value={closureReason}
                          onChange={(event) => setClosureReason(event.target.value)}
                        />
                      </label>
                      <Button variant="secondary" onClick={addClosure}>
                        Add closure
                      </Button>
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
