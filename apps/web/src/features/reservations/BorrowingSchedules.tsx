import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, LumoDialog, NoticeBanner, SectionCard, StatusBadge } from '../../components/ui'
import { borrowingScheduleApi, pickupDateLabel, type BorrowingSchedule } from './borrowing-schedule-api'

export function BorrowingSchedules() {
  const [items, setItems] = useState<BorrowingSchedule[]>([])
  const [error, setError] = useState('')
  const [cancelError, setCancelError] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [cancel, setCancel] = useState<BorrowingSchedule | null>(null)
  const running = useRef(false)
  const mounted = useRef(false)
  const acting = useRef(false)
  const revision = useRef(0)

  const load = useCallback(async () => {
    if (running.current) return
    running.current = true
    const started = revision.current
    try {
      const rows = await borrowingScheduleApi.mine()
      if (mounted.current && started === revision.current) {
        setItems(rows)
        setError('')
      }
    } catch (e) {
      if (mounted.current && started === revision.current) {
        setError(e instanceof Error ? e.message : 'Scheduled requests could not be loaded.')
      }
    } finally {
      running.current = false
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    void load()
    const timer = setInterval(() => void load(), 30000)
    const refresh = () => void load()
    window.addEventListener('smartlib:circulation-updated', refresh)
    return () => {
      mounted.current = false
      clearInterval(timer)
      window.removeEventListener('smartlib:circulation-updated', refresh)
    }
  }, [load])

  async function confirmCancel() {
    if (!cancel || acting.current) return
    acting.current = true
    setBusy(cancel.scheduleId)
    setCancelError('')
    try {
      const saved = await borrowingScheduleApi.cancel(cancel.scheduleId)
      revision.current++
      setItems(rows => rows.map(row => (row.scheduleId === saved.scheduleId ? { ...row, ...saved } : row)))
      setCancel(null)
      await load()
      window.dispatchEvent(new Event('smartlib:circulation-updated'))
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : 'The schedule could not be cancelled.')
    } finally {
      setBusy(null)
      acting.current = false
    }
  }

  const visible = items.filter(r => r.status !== 'prepared')
  if (!visible.length && !error) return null

  return (
    <section aria-label="Scheduled borrowing" className="mb-6">
      <div className="mb-3">
        <h2 className="font-display text-lg font-semibold text-[var(--sl-text-header)]">Scheduled borrowing</h2>
        <p className="mt-1 text-sm text-[var(--sl-text-secondary)]">
          Pending schedules do not hold a copy. Preparation starts one open library day before pickup, subject to availability and your borrowing allowance. Prepared schedules appear with your book requests below.
        </p>
      </div>
      {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {visible.map(r => (
          <SectionCard key={r.scheduleId} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-display text-base font-semibold text-[var(--sl-text-header)]">{r.title}</h3>
                <p className="mt-1 text-sm text-[var(--sl-text-secondary)]">
                  Preferred pickup: <span className="font-medium text-[var(--sl-text)]">{pickupDateLabel(r.pickupDate)}</span>
                </p>
              </div>
              <StatusBadge
                status={r.status === 'scheduled' ? 'Scheduled' : r.status === 'unfulfilled' ? 'Unfulfilled' : 'Cancelled'}
              />
            </div>
            {r.reason ? <p className="mt-2.5 text-sm text-[var(--sl-text-secondary)]">{r.reason}</p> : null}
            {r.status === 'scheduled' ? (
              <div className="mt-3.5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => {
                    setCancelError('')
                    setCancel(r)
                  }}
                >
                  Cancel schedule
                </Button>
              </div>
            ) : null}
          </SectionCard>
        ))}
      </div>
      {cancel ? (
        <LumoDialog
          role="alertdialog"
          size="sm"
          title="Cancel this schedule?"
          busy={busy !== null}
          onClose={() => {
            if (busy === null) {
              setCancel(null)
              setCancelError('')
            }
          }}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() => {
                  setCancel(null)
                  setCancelError('')
                }}
              >
                Keep schedule
              </Button>
              <Button variant="danger" disabled={busy !== null} onClick={() => void confirmCancel()}>
                {busy !== null ? 'Cancelling…' : 'Confirm cancellation'}
              </Button>
            </>
          }
        >
          <p className="font-medium text-[var(--sl-text-header)]">
            {cancel.title} — {pickupDateLabel(cancel.pickupDate)}
          </p>
          <p className="mt-1 text-xs text-[var(--sl-text-secondary)]">
            This frees one scheduled borrowing slot immediately.
          </p>
          {cancelError ? (
            <NoticeBanner tone="error" className="mb-0 mt-3">
              {cancelError}
            </NoticeBanner>
          ) : null}
        </LumoDialog>
      ) : null}
    </section>
  )
}
