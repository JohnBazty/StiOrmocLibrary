function localDateKey(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseCutoff(cutoff: string | { hour: number; minute: number }) {
  if (typeof cutoff === 'string') {
    const match = cutoff.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
    if (!match) throw new Error(`Invalid due-time cutoff: ${cutoff}`)
    return { hour: Number(match[1]), minute: Number(match[2]) }
  }
  return cutoff
}

/** Advance by N operating days (skip Sundays and configured campus closures). */
export function calculateOperatingDueDate(
  borrowedAt: Date,
  borrowingDays: number,
  cutoff: string | { hour: number; minute: number } = { hour: 8, minute: 59 },
  closedDates: ReadonlySet<string> = new Set(),
) {
  const days = Math.max(1, Math.floor(borrowingDays))
  const { hour, minute } = parseCutoff(cutoff)
  const due = new Date(borrowedAt)
  due.setSeconds(0, 0)
  let remaining = days
  for (let inspected = 0; inspected < 366 && remaining > 0; inspected += 1) {
    due.setDate(due.getDate() + 1)
    if (due.getDay() === 0 || closedDates.has(localDateKey(due))) continue
    remaining -= 1
  }
  if (remaining > 0) throw new Error('No operating day could be resolved within one year.')
  due.setHours(hour, minute, 0, 0)
  return due
}

/** Legacy helper: one operating day at 08:59. Prefer calculateOperatingDueDate with policy values. */
export function nextOperatingDueDate(borrowedAt: Date, closedDates: ReadonlySet<string> = new Set()) {
  return calculateOperatingDueDate(borrowedAt, 1, { hour: 8, minute: 59 }, closedDates)
}

export function formatDueCutoffLabel(cutoff: string | { hour: number; minute: number }) {
  const { hour, minute } = parseCutoff(cutoff)
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`
}

export const circulationDuePolicy = { hour: 8, minute: 59 }
