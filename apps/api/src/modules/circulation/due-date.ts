const DUE_HOUR = 8
const DUE_MINUTE = 59

function localDateKey(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Sundays and configured campus closures are not operating days. */
export function nextOperatingDueDate(borrowedAt: Date, closedDates: ReadonlySet<string> = new Set()) {
  const due = new Date(borrowedAt)
  due.setDate(due.getDate() + 1)
  due.setHours(DUE_HOUR, DUE_MINUTE, 0, 0)
  for (let inspected = 0; inspected < 366; inspected += 1) {
    if (due.getDay() !== 0 && !closedDates.has(localDateKey(due))) return due
    due.setDate(due.getDate() + 1)
  }
  throw new Error('No operating day could be resolved within one year.')
}

export const circulationDuePolicy = { hour: DUE_HOUR, minute: DUE_MINUTE }
