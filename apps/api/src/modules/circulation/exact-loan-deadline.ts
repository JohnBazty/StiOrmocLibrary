import { manilaDate, manilaInstant, nextDate } from '../attendance/attendance-intervals.ts'

/** Elapsed calendar loan days, then advance a closed due date without changing the clock time. */
export function exactLoanDeadline(borrowedAt: Date, days: number, openDays: ReadonlySet<number>, closedDates: ReadonlySet<string>) {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('The approved borrowing period must be 1–365 days.')
  const local = new Date(borrowedAt.getTime() + 8 * 60 * 60_000)
  const clock = local.toISOString().slice(11, 19)
  let date = nextDate(manilaDate(borrowedAt), days)
  for (let inspected = 0; inspected < 366; inspected++) {
    const weekday = ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1
    if (openDays.has(weekday) && !closedDates.has(date)) return new Date(manilaInstant(date, clock).getTime() + borrowedAt.getUTCMilliseconds())
    date = nextDate(date)
  }
  throw new Error('No open due date is configured within one year.')
}
