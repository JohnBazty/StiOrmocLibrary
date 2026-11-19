type Instant = string | number | Date | null | undefined

/** Legacy naive loan timestamps are Manila wall time, never the viewer's device time. */
function instant(value: Instant): Date | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null
  if (typeof value === 'number') { const date = new Date(value); return Number.isFinite(date.getTime()) ? date : null }
  let text = value.trim().replace(' ', 'T')
  if (/^\d{4}-\d\d-\d\d$/.test(text)) text += 'T00:00:00+08:00'
  else if (/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(text)) text += '+08:00'
  const date = new Date(text)
  return Number.isFinite(date.getTime()) ? date : null
}

export function formatLoanDate(value: string | null | undefined, fallback = '—') {
  if (!value) return fallback
  const date = instant(value)
  return date ? date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : value
}

const manilaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' })
function dayNumber(date: Date) {
  const parts = manilaDay.formatToParts(date), get = (type: string) => Number(parts.find(part => part.type === type)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day')) / 86_400_000
}

/** Calendar days follow Manila midnight; hours describe lateness within the same day. */
export function loanOverdueLabel(dueValue: Instant, nowValue: Instant = new Date()): string | null {
  const due = instant(dueValue), now = instant(nowValue)
  if (!due || !now || now.getTime() <= due.getTime()) return null
  const days = dayNumber(now) - dayNumber(due)
  if (days > 0) return `${days} calendar ${days === 1 ? 'day' : 'days'} past due`
  const minutes = Math.floor((now.getTime() - due.getTime()) / 60_000), hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'} past due`
  if (minutes > 0) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} past due`
  return 'Less than a minute past due'
}
