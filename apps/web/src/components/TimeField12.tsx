import { useId } from 'react'

/** "17:30" -> "5:30 PM". Library times are never shown in 24-hour form. */
export function formatTime12(value: string | null | undefined) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? '')
  if (!match) return ''
  const hour = Number(match[1])
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`
}

const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1))
const MINUTES = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'))
const field = 'min-h-11 rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-2 text-sm text-[var(--sl-text)]'

/**
 * A 12-hour time picker (hour, minute, AM/PM). The value is a plain "HH:MM" string for the API,
 * or "" when an optional time is left empty.
 */
export function TimeField12({ label, value, onChange, optional = false, disabled = false }: {
  label: string
  value: string
  onChange: (value: string) => void
  optional?: boolean
  disabled?: boolean
}) {
  const id = useId()
  const match = /^(\d{1,2}):(\d{2})/.exec(value)
  const hour24 = match ? Number(match[1]) : null
  const hour = hour24 === null ? '' : String(hour24 % 12 || 12)
  const minute = match ? match[2] : ''
  const period = hour24 === null ? '' : hour24 < 12 ? 'AM' : 'PM'
  const minutes = minute && !MINUTES.includes(minute) ? [...MINUTES, minute].sort() : MINUTES
  function update(next: { hour?: string; minute?: string; period?: string }) {
    const h = Number(next.hour ?? (hour || '12'))
    const m = next.minute ?? (minute || '00')
    const p = next.period ?? (period || 'AM')
    const h24 = (h % 12) + (p === 'PM' ? 12 : 0)
    onChange(`${String(h24).padStart(2, '0')}:${m}`)
  }
  return (
    <fieldset className="text-sm" disabled={disabled}>
      <legend id={`${id}-label`} className="mb-1 font-semibold">{label}</legend>
      <div className="flex flex-wrap items-center gap-1.5">
        <select aria-label={`${label} hour`} className={field} value={hour} onChange={event => update({ hour: event.target.value })}>
          {!hour ? <option value="">Hour</option> : null}
          {HOURS.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <span aria-hidden="true">:</span>
        <select aria-label={`${label} minute`} className={field} value={minute} onChange={event => update({ minute: event.target.value })}>
          {!minute ? <option value="">Min</option> : null}
          {minutes.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <select aria-label={`${label} AM or PM`} className={field} value={period} onChange={event => update({ period: event.target.value })}>
          {!period ? <option value="">AM/PM</option> : null}
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
        {optional && value ? <button type="button" aria-label={`Clear ${label}`} className="min-h-11 px-2 text-xs font-semibold underline" onClick={() => onChange('')}>Clear</button> : null}
      </div>
    </fieldset>
  )
}
