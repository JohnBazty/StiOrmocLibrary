import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const atNoon = (date: string) => new Date(`${date}T12:00:00+08:00`)
export const calendarDayLabel = (date: string) =>
  atNoon(date).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
const monthLabel = (month: string) =>
  atNoon(`${month}-15`).toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'long', year: 'numeric' })
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * A calendar button for picking one date from a fixed set (YYYY-MM-DD, Manila calendar days).
 * Days outside `allowed` cannot be chosen, and months outside the allowed range cannot be opened.
 */
export function CalendarDateButton({ id, label, value, allowed, onChange, disabled = false }: {
  id: string
  label: string
  value: string
  allowed: string[]
  onChange: (date: string) => void
  disabled?: boolean
}) {
  const sorted = [...allowed].sort()
  const first = sorted[0]?.slice(0, 7) ?? ''
  const last = sorted.at(-1)?.slice(0, 7) ?? ''
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => (value || sorted[0] || '').slice(0, 7))
  const shown = month || first
  const none = sorted.length === 0
  const allowedSet = new Set(sorted)
  const cells: Array<string | null> = []
  if (shown) {
    const [y, m] = shown.split('-').map(Number)
    const leading = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
    for (let i = 0; i < leading; i++) cells.push(null)
    for (let d = 1; d <= days; d++) cells.push(`${shown}-${String(d).padStart(2, '0')}`)
  }
  const weeks: Array<Array<string | null>> = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return (
    <div className="space-y-2">
      <button
        id={id}
        type="button"
        disabled={disabled || none}
        aria-expanded={open}
        aria-controls={`${id}-calendar`}
        aria-label={`${label}: ${value ? calendarDayLabel(value) : none ? 'No dates available' : 'Choose a date'}`}
        onClick={() => { setMonth((value || sorted[0] || '').slice(0, 7)); setOpen(current => !current) }}
        className="sl-input inline-flex w-full items-center justify-between gap-2 text-left disabled:opacity-60"
      >
        <span>{value ? calendarDayLabel(value) : none ? 'No dates available' : 'Choose a date'}</span>
        <CalendarDays size={18} aria-hidden="true" />
      </button>
      {open && shown ? (
        <div id={`${id}-calendar`} className="max-w-sm rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-3 shadow-[var(--sl-shadow-s)]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <button type="button" aria-label="Previous month" disabled={shown <= first} onClick={() => setMonth(shiftMonth(shown, -1))} className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] hover:bg-[var(--sl-bg-hover)] disabled:opacity-40"><ChevronLeft size={16} aria-hidden="true" /></button>
            <p className="text-sm font-semibold text-[var(--sl-text-header)]" aria-hidden="true">{monthLabel(shown)}</p>
            <button type="button" aria-label="Next month" disabled={shown >= last} onClick={() => setMonth(shiftMonth(shown, 1))} className="inline-flex h-9 w-9 items-center justify-center rounded-[6px] hover:bg-[var(--sl-bg-hover)] disabled:opacity-40"><ChevronRight size={16} aria-hidden="true" /></button>
          </div>
          <table role="grid" aria-label={monthLabel(shown)} className="w-full table-fixed text-center text-sm">
            <thead><tr>{WEEKDAYS.map(day => <th key={day} scope="col" className="pb-1 text-xs font-medium text-[var(--sl-text-secondary)]">{day}</th>)}</tr></thead>
            <tbody>
              {weeks.map((week, index) => (
                <tr key={index}>
                  {Array.from({ length: 7 }, (_, column) => week[column] ?? null).map((date, column) => (
                    <td key={column} className="p-0.5">
                      {date ? (
                        <button
                          type="button"
                          aria-label={calendarDayLabel(date)}
                          aria-pressed={date === value}
                          disabled={!allowedSet.has(date)}
                          onClick={() => { onChange(date); setOpen(false) }}
                          className={`h-9 w-full rounded-[6px] text-sm ${date === value ? 'bg-[#0b5ea2] font-semibold text-white' : allowedSet.has(date) ? 'font-semibold text-[#0b5ea2] hover:bg-[var(--sl-brand-soft)] dark:text-sky-300' : 'text-[var(--sl-text-muted)] opacity-40'}`}
                        >
                          {Number(date.slice(8))}
                        </button>
                      ) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
