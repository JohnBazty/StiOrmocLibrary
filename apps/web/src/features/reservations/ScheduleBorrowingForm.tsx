import { useEffect, useRef, useState } from 'react'
import { useConfirmSave } from '../../components/ConfirmSaveDialog'
import { Button, FormField, NoticeBanner } from '../../components/ui'
import { borrowingScheduleApi, pickupDateLabel, type BorrowingSchedule } from './borrowing-schedule-api'

const MAX_PENDING_SCHEDULES = 2

export function ScheduleBorrowingForm({
  titleId,
  title,
  role,
  onClose,
}: {
  titleId: number
  title: string
  role: string
  onClose: () => void
}) {
  const [dates, setDates] = useState<string[]>([])
  const [pendingSchedules, setPendingSchedules] = useState<BorrowingSchedule[]>([])
  const [date, setDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const { ask, dialog } = useConfirmSave()
  const key = useRef({ date: '', value: '' })
  const submitting = useRef(false)

  useEffect(() => {
    let mounted = true
    let running = false
    async function refresh() {
      if (running) return
      running = true
      try {
        const [result, mine] = await Promise.all([
          borrowingScheduleApi.dates(),
          typeof borrowingScheduleApi.mine === 'function'
            ? borrowingScheduleApi.mine().catch(() => [] as BorrowingSchedule[])
            : Promise.resolve([] as BorrowingSchedule[]),
        ])
        if (mounted) {
          setDates(result.dates)
          setPendingSchedules(mine.filter(row => row.status === 'scheduled'))
          setError(result.available ? '' : 'Scheduled borrowing is not available yet.')
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Pickup dates could not be loaded.')
      } finally {
        running = false
        if (mounted) setLoading(false)
      }
    }
    void refresh()
    const timer = setInterval(() => void refresh(), 30000)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [titleId])

  async function save() {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setError('')
    if (key.current.date !== date) key.current = { date, value: crypto.randomUUID() }
    try {
      await borrowingScheduleApi.create({ titleId, pickupDate: date, clientRequestId: key.current.value })
      setSaved(true)
      window.dispatchEvent(new Event('smartlib:circulation-updated'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The schedule could not be saved.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  const reservationsHref = `${role === 'Faculty' ? '/faculty' : '/student'}/reservations`
  const duplicate = pendingSchedules.find(row => row.titleId === titleId) ?? null
  const limitReached = !duplicate && pendingSchedules.length >= MAX_PENDING_SCHEDULES

  return (
    <section
      aria-label="Schedule borrowing"
      className="mt-5 rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-4 text-[var(--sl-text)] shadow-[var(--sl-shadow-xs)]"
    >
      <h3 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Schedule borrowing</h3>
      <p className="mt-1.5 text-sm text-[var(--sl-text-secondary)]">
        We’ll try to prepare a copy for this date. Wait for a ready-for-pickup notice before visiting the counter.
      </p>
      <p className="mt-1 text-xs text-[var(--sl-text-muted)]">
        Choose within the next seven open days. Up to {MAX_PENDING_SCHEDULES} pending schedules are allowed (separate from your borrowing limit). Existing reservations keep priority.
      </p>

      {error ? (
        <NoticeBanner tone="error" className="mb-0 mt-3">
          {error}
        </NoticeBanner>
      ) : null}

      {saved ? (
        <NoticeBanner
          tone="success"
          className="mb-0 mt-3"
          action={
            <a className="inline-flex min-h-8 items-center font-semibold underline" href={reservationsHref}>
              View requests &amp; reservations
            </a>
          }
        >
          Schedule saved for {pickupDateLabel(date)}. No copy is held yet.
        </NoticeBanner>
      ) : loading ? (
        <p role="status" className="mt-3 text-sm text-[var(--sl-text-secondary)]">
          Loading open pickup dates…
        </p>
      ) : duplicate ? (
        <NoticeBanner
          tone="warning"
          className="mb-0 mt-3"
          title="You already have a pending schedule for this book"
          action={
            <a className="inline-flex min-h-8 items-center font-semibold underline" href={reservationsHref}>
              View requests &amp; reservations
            </a>
          }
        >
          Scheduled pickup: {pickupDateLabel(duplicate.pickupDate)}. Cancel it first if you need a different date.
        </NoticeBanner>
      ) : limitReached ? (
        <NoticeBanner
          tone="warning"
          className="mb-0 mt-3"
          title={`Scheduled borrowing limit reached (${pendingSchedules.length} of ${MAX_PENDING_SCHEDULES} pending)`}
          action={
            <a className="inline-flex min-h-8 items-center font-semibold underline" href={reservationsHref}>
              View requests &amp; reservations
            </a>
          }
        >
          Cancel one of your pending schedules before booking another date.
        </NoticeBanner>
      ) : dates.length ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={e => {
            e.preventDefault()
            if (date && dates.includes(date) && !busy) {
              ask(`Schedule ${title} for ${pickupDateLabel(date)}. Availability is not guaranteed.`, () => {
                void save()
              })
            }
          }}
        >
          <FormField id="scheduled-pickup-date" label="Preferred pickup date" required>
            <select
              id="scheduled-pickup-date"
              value={date}
              onChange={e => setDate(e.target.value)}
              disabled={busy}
              required
              className="sl-input"
            >
              <option value="">Choose a date</option>
              {date && !dates.includes(date) ? (
                <option value={date} disabled>
                  {pickupDateLabel(date)} — no longer available
                </option>
              ) : null}
              {dates.map(d => (
                <option key={d} value={d}>
                  {pickupDateLabel(d)}
                </option>
              ))}
            </select>
          </FormField>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="submit" disabled={busy || !dates.includes(date)}>
              {busy ? 'Saving…' : 'Review schedule'}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <NoticeBanner tone="info" className="mb-0 mt-3">
          No open pickup dates are available in the next seven days.
        </NoticeBanner>
      )}

      {saved || !dates.length || duplicate || limitReached ? (
        <div className="mt-3">
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            {saved ? 'Close schedule' : 'Cancel'}
          </Button>
        </div>
      ) : null}
      {dialog}
    </section>
  )
}
