import { Clock, Users } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button, SectionCard } from '../../components/ui'
import { catalogInput } from '../catalog/CatalogDetailsPanel'
import { reservationApi, type ReservationSettingsView } from './reservation-api'

const message = (e: unknown) => (e instanceof Error ? e.message : 'Unable to save this setting.')

function lastChanged(by: string | null, at: string | null) {
  if (!at) return 'Default'
  return `Last changed by ${by ?? 'a librarian'} on ${new Date(at).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
  })}`
}

function SettingCard({
  title,
  scopeBadge,
  scopeTone = 'teal',
  unitLabel,
  action,
  label,
  help,
  min = 1,
  initial,
  status,
  allowBlank = false,
  onSave,
  anchor,
}: {
  title: string
  scopeBadge: string
  scopeTone?: 'teal' | 'blue' | 'indigo'
  unitLabel: string
  action: string
  label: string
  help: string
  min?: number
  initial: string
  status: string
  allowBlank?: boolean
  onSave: (value: string) => Promise<void>
  anchor?: string
}) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const id = useId()
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setValue(initial)
  }, [initial])

  // A shortcut link such as #pickup-window lands on this setting once it has loaded.
  useEffect(() => {
    if (anchor && window.location.hash === `#${anchor}`) {
      field.current?.scrollIntoView?.({ block: 'center' })
      field.current?.focus({ preventScroll: true })
    }
  }, [anchor])

  async function save() {
    setBusy(true)
    setError('')
    try {
      await onSave(value)
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(false)
    }
  }

  const isDirty = value !== initial
  const topBorder =
    scopeTone === 'indigo'
      ? 'border-t-[#4f46e5]'
      : scopeTone === 'blue'
        ? 'border-t-[#0b5ea2]'
        : 'border-t-[#0f766e]'
  const scopeClass =
    scopeTone === 'indigo'
      ? 'bg-[#4f46e5]/12 text-[#4f46e5] dark:bg-[#4f46e5]/25 dark:text-[#c7d2fe]'
      : scopeTone === 'blue'
        ? 'bg-[#0b5ea2]/12 text-[#0b5ea2] dark:bg-[#0b5ea2]/25 dark:text-[#93c5fd]'
        : 'bg-[#0f766e]/12 text-[#0f766e] dark:bg-[#0f766e]/25 dark:text-[#5eead4]'

  // Keep <h2> as a direct child of SectionCard so card(heading) parentElement lookup in tests matches SectionCard
  return (
    <SectionCard className={`flex flex-col justify-between space-y-3.5 border-t-[3px] ${topBorder} p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${scopeClass}`}>
          <Clock size={12} />
          {scopeBadge} · {unitLabel}
        </span>
        {isDirty ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#fef9c3] px-2.5 py-0.5 text-[11px] font-semibold text-[#92400e] dark:bg-[#854d0e]/30 dark:text-[#fde047]">
            <span className="size-1.5 rounded-full bg-[#eab308]" />
            Unsaved change
          </span>
        ) : allowBlank && value.trim() === '' ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[11px] font-semibold text-[#166534] dark:bg-[#166534]/30 dark:text-[#86efac]">
            <span className="size-1.5 rounded-full bg-[#16a34a]" />
            Never expires
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-[#166534] dark:bg-[#166534]/30 dark:text-[#86efac]">
            <span className="size-1.5 rounded-full bg-[#16a34a]" />
            Active · {value} {Number(value) === 1 ? 'day' : 'days'}
          </span>
        )}
      </div>

      <h2 className="font-display text-lg font-bold text-[var(--sl-text-header)]">{title}</h2>

      <label className="block text-xs font-bold uppercase tracking-wide text-[var(--sl-text-secondary)]" id={anchor}>
        {label}
        <input
          ref={field}
          type="number"
          min={min}
          step={1}
          placeholder={allowBlank ? 'Blank = never expires (or 1+ days)' : '1 or more days'}
          className={catalogInput}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${helpId} ${errorId}` : helpId}
        />
      </label>

      <p id={helpId} className="text-xs leading-relaxed text-[var(--sl-text-secondary)]">
        {help}
      </p>

      {error ? (
        <p id={errorId} role="alert" className="rounded-[10px] bg-[#b42318] p-3 text-xs font-semibold text-white">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sl-border)] pt-3">
        <Button disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : action}
        </Button>
        <span role="status" className="text-xs font-medium text-[var(--sl-text-muted)]">
          {status}
        </span>
      </div>
    </SectionCard>
  )
}

export function ReservationSettingsPanel({
  roleTab: controlledRole,
  onRoleTabChange,
}: {
  roleTab?: 'Student' | 'Faculty'
  onRoleTabChange?: (role: 'Student' | 'Faculty') => void
} = {}) {
  const [view, setView] = useState<ReservationSettingsView | null>(null)
  const [error, setError] = useState('')
  const [internalRole, setInternalRole] = useState<'Student' | 'Faculty'>('Student')
  const roleTab = controlledRole ?? internalRole

  function selectRole(next: 'Student' | 'Faculty') {
    setInternalRole(next)
    onRoleTabChange?.(next)
  }

  useEffect(() => {
    let live = true
    reservationApi
      .settings()
      .then((v) => {
        if (live) setView(v)
      })
      .catch((e) => {
        if (live) setError(message(e))
      })
    return () => {
      live = false
    }
  }, [])

  if (error) {
    return (
      <p role="alert" className="rounded-[10px] bg-[#b42318] p-3 text-sm font-semibold text-white">
        {error}
      </p>
    )
  }
  if (!view) return <p className="text-sm text-[var(--sl-text-secondary)]">Loading reservation settings…</p>

  const tabClass = (active: boolean, role: 'Student' | 'Faculty') =>
    `inline-flex items-center gap-1.5 rounded-[8px] px-3.5 py-2 text-sm font-semibold transition ${
      active
        ? role === 'Faculty'
          ? 'bg-[#4f46e5] text-white shadow-xs'
          : 'bg-[#0b5ea2] text-white shadow-xs'
        : 'text-[var(--sl-text-secondary)] hover:bg-[var(--sl-bg-subtle)]'
    }`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Borrower policy role"
          className="inline-flex gap-1 rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-1 shadow-[var(--sl-shadow-xs)]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={roleTab === 'Student'}
            className={tabClass(roleTab === 'Student', 'Student')}
            onClick={() => selectRole('Student')}
          >
            <Users size={14} />
            Student
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={roleTab === 'Faculty'}
            className={tabClass(roleTab === 'Faculty', 'Faculty')}
            onClick={() => selectRole('Faculty')}
          >
            <Users size={14} />
            Faculty
          </button>
        </div>
        <span className="text-xs text-[var(--sl-text-muted)]">
          Pickup window is shared across all borrowers; waiting-list expiry is configured per role.
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SettingCard
          anchor="pickup-window"
          title="Pickup window"
          scopeBadge="Shared · Student & Faculty"
          scopeTone="teal"
          unitLabel="Starts at 1 day · No max limit"
          action="Save pickup window"
          label="Pickup window (days)"
          min={1}
          initial={String(view.pickupWindowDays)}
          help="How long a book marked ready is held at the desk for the borrower, starting from 1 day with no maximum day limit."
          status={lastChanged(view.pickupWindowChangedBy, view.pickupWindowChangedAt)}
          onSave={async (value) => setView(await reservationApi.saveSettings({ pickupWindowDays: value }))}
        />
        {roleTab === 'Student' ? (
          <SettingCard
            key="student-waiting"
            title="Waiting-list limit"
            scopeBadge="Student queue expiry"
            scopeTone="blue"
            unitLabel="Starts at 1 day · No max limit"
            action="Save waiting-list limit"
            label="Waiting-list limit (days)"
            min={1}
            allowBlank
            initial={view.waitingExpiryDays === null ? '' : String(view.waitingExpiryDays)}
            help="How many days a student reservation can wait in queue for a copy before it expires, starting from 1 day with no maximum day limit. Leave it blank so waiting reservations never expire. Any save restarts the count for every waiting reservation."
            status={lastChanged(view.waitingExpiryChangedBy, view.waitingExpiryChangedAt)}
            onSave={async (value) => setView(await reservationApi.saveSettings({ waitingExpiryDays: value }))}
          />
        ) : (
          <SettingCard
            key="faculty-waiting"
            title="Faculty waiting-list limit"
            scopeBadge="Faculty queue expiry"
            scopeTone="indigo"
            unitLabel="Starts at 1 day · No max limit"
            action="Save faculty waiting-list limit"
            label="Faculty waiting-list limit (days)"
            min={1}
            allowBlank
            initial={view.facultyWaitingExpiryDays == null ? '' : String(view.facultyWaitingExpiryDays)}
            help="How many days a faculty reservation can wait in queue before it expires, starting from 1 day with no maximum day limit. Leave it blank so faculty waiting requests never expire."
            status={
              view.facultyWaitingExpiryDays == null
                ? 'Never expires (default)'
                : `${view.facultyWaitingExpiryDays} days`
            }
            onSave={async (value) => setView(await reservationApi.saveSettings({ facultyWaitingExpiryDays: value }))}
          />
        )}
      </div>
    </div>
  )
}
