import { useCallback, useEffect, useState } from 'react'
import { useConfirmSave } from '../../components/ConfirmSaveDialog'
import { Button, LumoDialog, NoticeBanner, SectionCard, StatusBadge } from '../../components/ui'
import { UnsavedGuard } from '../../components/UnsavedChanges'
import { attendanceApi, type LibraryEvent, type OperationalState } from './attendance-api'
import { RefreshButton } from '../../components/RefreshButton'

const time = (v: string | null) =>
  v
    ? new Date(v).toLocaleTimeString('en-PH', {
        timeZone: 'Asia/Manila',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
    : '—'

const dateTime = (v: string) =>
  new Date(v).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
  })

const localInput = (v: string) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(v))
    .replace(' ', 'T')

const empty = {
  title: '',
  kind: 'Class',
  spaceName: '',
  startsAt: '',
  endsAt: '',
  capacity: '',
  allowWalkIns: false,
  allowBorrowing: true,
  allowPrinting: true,
  version: 1,
}

export function LibraryOperationsPanel({
  manage = false,
  collapseEventForm = false,
  onChanged,
}: {
  manage?: boolean
  collapseEventForm?: boolean
  onChanged?: () => void
}) {
  const [state, setState] = useState<OperationalState | null>(null)
  const [events, setEvents] = useState<LibraryEvent[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState<number | null>(null)
  const [form, setForm] = useState(empty)
  const [cancel, setCancel] = useState<LibraryEvent | null>(null)
  const [minutes, setMinutes] = useState('5')
  const [policyOpen, setPolicyOpen] = useState(false)
  const [eventDrawerOpen, setEventDrawerOpen] = useState(!collapseEventForm)
  const { ask, dialog: confirmSave } = useConfirmSave()

  const load = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([attendanceApi.state(), attendanceApi.events()])
      setState(s)
      setEvents(e)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load library operations.')
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 30_000)
    return () => clearInterval(timer)
  }, [load])

  const patchForm = (patch: Partial<typeof empty>) => setForm(current => ({ ...current, ...patch }))

  useEffect(() => {
    setMinutes(String(state?.policy.preclosingMinutes ?? 5))
  }, [state?.policy.preclosingMinutes])

  const act = async (task: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await task()
      await load()
      onChanged?.()
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update library operations.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    const ok = await act(() =>
      attendanceApi.saveEvent(edit, {
        ...form,
        capacity: Number(form.capacity),
        startsAt: `${form.startsAt}:00+08:00`,
        endsAt: `${form.endsAt}:00+08:00`,
      }),
    )
    if (ok) {
      setForm(empty)
      setEdit(null)
    }
  }

  const beginEdit = (e: LibraryEvent) => {
    setEdit(e.event_id)
    setEventDrawerOpen(true)
    setForm({
      title: e.title,
      kind: e.event_kind,
      spaceName: e.space_name,
      startsAt: localInput(e.starts_at),
      endsAt: localInput(e.ends_at),
      capacity: String(e.seat_capacity),
      allowWalkIns: e.allow_walk_ins,
      allowBorrowing: e.allow_borrowing,
      allowPrinting: e.allow_printing,
      version: e.row_version,
    })
  }

  const eventFormContent = (
    <>
      <h3 className="font-display text-sm font-semibold text-[var(--sl-text-header)]">
        {edit ? 'Edit event' : 'Schedule class, meeting or seminar'}
      </h3>
      <UnsavedGuard className="contents" cleanOnSubmit>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={e => {
            e.preventDefault()
            ask(`${edit ? 'Save changes to' : 'Schedule'} ${form.title}.`, () => {
              void save()
            })
          }}
        >
          <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
            Event title
            <input
              className="sl-input mt-1"
              value={form.title}
              required
              maxLength={150}
              onChange={e => patchForm({ title: e.target.value })}
            />
          </label>
          <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
            Event type
            <select
              className="sl-input mt-1"
              value={form.kind}
              onChange={e => patchForm({ kind: e.target.value })}
            >
              {['Class', 'Meeting', 'Seminar'].map(v => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
            Affected space
            <input
              className="sl-input mt-1"
              value={form.spaceName}
              required
              maxLength={150}
              placeholder="Example: Main reading area"
              onChange={e => patchForm({ spaceName: e.target.value })}
            />
          </label>
          <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
            Remaining library seats
            <input
              className="sl-input mt-1"
              type="number"
              required
              min="0"
              max="5000"
              value={form.capacity}
              onChange={e => patchForm({ capacity: e.target.value })}
            />
          </label>
          <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
            Starts at (Manila)
            <input
              className="sl-input mt-1"
              type="datetime-local"
              required
              value={form.startsAt}
              onChange={e => patchForm({ startsAt: e.target.value })}
            />
          </label>
          <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
            Ends at (Manila)
            <input
              className="sl-input mt-1"
              type="datetime-local"
              required
              value={form.endsAt}
              onChange={e => patchForm({ endsAt: e.target.value })}
            />
          </label>
          <div className="flex flex-wrap gap-4 sm:col-span-2">
            {(['allowWalkIns', 'allowBorrowing', 'allowPrinting'] as const).map((key, i) => (
              <label key={key} className="flex items-center gap-2 text-xs font-medium text-[var(--sl-text)]">
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={e => patchForm({ [key]: e.target.checked })}
                />
                {['Allow walk-ins', 'Allow borrowing', 'Allow printing'][i]}
              </label>
            ))}
          </div>
          <p className="text-xs text-[var(--sl-text-muted)] sm:col-span-2">
            Enter the seats remaining for regular visitors during this event. When events overlap, the lowest capacity and all active service restrictions apply.
          </p>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? 'Saving…' : edit ? 'Save event' : 'Schedule event'}
            </Button>
            {edit ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEdit(null)
                  setForm(empty)
                }}
                disabled={busy}
              >
                Cancel edit
              </Button>
            ) : null}
          </div>
        </form>
      </UnsavedGuard>
    </>
  )

  return (
    <SectionCard className="mb-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Library operations</h2>
            {state?.state ? <StatusBadge status={state.state} /> : null}
          </div>
          <p className="mt-1 text-xs font-medium text-[var(--sl-text-secondary)]">
            {state?.state ?? 'Loading…'} · {state?.current ?? '—'} seats occupied · {state?.serviceVisits ?? '—'} printing visits
          </p>
        </div>
        <RefreshButton label="Refresh operations" onRefresh={() => load()} variant="secondary" size="sm" disabled={busy} />
      </div>

      {error ? (
        <div className="mt-3">
          <NoticeBanner tone="error">{error}</NoticeBanner>
        </div>
      ) : null}

      {state ? (
        <div className="mt-3 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-3.5 text-xs text-[var(--sl-text-secondary)]">
          <p className="font-medium text-[var(--sl-text-header)]">
            Available seats: {state.available} of {state.capacity}.{' '}
            {state.cutoffAt ? (
              <>
                Entry stops and automatic checkout runs at {time(state.cutoffAt)}; closing is {time(state.closesAt)} (Manila).
              </>
            ) : (
              <>
                No operating hours today. On operating days, entry stops and automatic checkout runs{' '}
                {state.policy.preclosingMinutes} minutes before closing.
              </>
            )}
          </p>
          <p className="mt-1.5">
            Walk-ins: <strong>{state.allowWalkIns ? 'Allowed' : 'Closed'}</strong> · Borrowing:{' '}
            <strong>{state.allowBorrowing ? 'Allowed' : 'Closed'}</strong> · Printing:{' '}
            <strong>{state.allowPrinting ? 'Allowed' : 'Closed'}</strong>
          </p>
          <p className="mt-1 text-[var(--sl-text-muted)]">
            Only printing visits are excluded from occupied seats. Attendance checkout does not return borrowed books.
          </p>
        </div>
      ) : null}

      {manage && state ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPolicyOpen(v => !v)}>
              Attendance cutoff settings
            </Button>
            {collapseEventForm ? (
              <Button variant="secondary" size="sm" onClick={() => setEventDrawerOpen(v => !v)}>
                {eventDrawerOpen ? 'Hide event scheduler' : 'Schedule class, meeting or seminar'}
              </Button>
            ) : null}
          </div>

          {policyOpen ? (
            <UnsavedGuard className="contents" cleanOnSubmit>
              <form
                className="mt-3 flex flex-wrap items-end gap-3 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-3.5"
                onSubmit={e => {
                  e.preventDefault()
                  ask(`Save the attendance cutoff at ${minutes} minutes before closing.`, () => {
                    void act(() =>
                      attendanceApi.updatePolicy({
                        servicePurposes: ['Printing'],
                        preclosingMinutes: Number(minutes),
                        version: state.policy.version,
                      }),
                    )
                  })
                }}
              >
                <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
                  Minutes before closing
                  <input
                    className="sl-input mt-1 w-36"
                    type="number"
                    min="1"
                    max="60"
                    required
                    value={minutes}
                    onChange={e => setMinutes(e.target.value)}
                  />
                </label>
                <Button disabled={busy} size="sm" type="submit">
                  Save cutoff
                </Button>
              </form>
            </UnsavedGuard>
          ) : null}

          {eventDrawerOpen ? (
            <div className="mt-4 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-4">
              {eventFormContent}
            </div>
          ) : null}
        </>
      ) : null}

      <div className="mt-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--sl-text-muted)]">
          Scheduled events ({events.length})
        </h3>
        <div className="mt-2 space-y-2.5">
          {events.length ? (
            events.map(e => (
              <div
                className="flex flex-wrap items-start justify-between gap-3 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-3.5"
                key={e.event_id}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm text-[var(--sl-text-header)]">{e.title}</strong>
                    <StatusBadge status={e.lifecycle_status} />
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
                    {e.event_kind} · {e.space_name}
                  </p>
                  <p className="mt-1 text-xs font-medium tabular-nums text-[var(--sl-text)]">
                    {dateTime(e.starts_at)} – {dateTime(e.ends_at)}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">
                    {e.seat_capacity} seats remain · Walk-ins {e.allow_walk_ins ? 'allowed' : 'closed'} · Borrowing{' '}
                    {e.allow_borrowing ? 'allowed' : 'closed'} · Printing {e.allow_printing ? 'allowed' : 'closed'}
                  </p>
                </div>
                {manage && e.lifecycle_status === 'Active' ? (
                  <div className="flex gap-1.5">
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => beginEdit(e)}>
                      Edit event
                    </Button>
                    <Button variant="danger" size="sm" disabled={busy} onClick={() => setCancel(e)}>
                      Cancel event
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-xs text-[var(--sl-text-secondary)]">No scheduled events.</p>
          )}
        </div>
      </div>

      {cancel ? (
        <LumoDialog
          role="alertdialog"
          size="sm"
          eyebrow="Cancel scheduled event"
          title={`Cancel “${cancel.title}”?`}
          description="Its seat limit and service restrictions stop applying. The event stays in history."
          busy={busy}
          onClose={() => setCancel(null)}
          footer={
            <>
              <Button variant="secondary" disabled={busy} onClick={() => setCancel(null)}>
                Keep event
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() =>
                  void act(() => attendanceApi.cancelEvent(cancel.event_id, cancel.row_version)).then(ok => {
                    if (ok) setCancel(null)
                  })
                }
              >
                {busy ? 'Cancelling…' : 'Yes, cancel event'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-[var(--sl-text)]">
            {cancel.space_name} · {new Date(cancel.starts_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </LumoDialog>
      ) : null}

      {confirmSave}
    </SectionCard>
  )
}
