import { manilaDate, manilaInstant, nextDate } from '../attendance/attendance-intervals.ts'

/**
 * Elapsed calendar loan days, then advance a closed due date to the next open date.
 * With dueTime (HH:mm[:ss], the policy's due time) the loan is due at that Manila time;
 * without it the borrowing clock time is kept.
 */
export function exactLoanDeadline(borrowedAt: Date, days: number, openDays: ReadonlySet<number>, closedDates: ReadonlySet<string>, dueTime?: string) {
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('The approved borrowing period must be 1–365 days.')
  if (dueTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(dueTime)) throw new Error(`Invalid due time: ${dueTime}`)
  const local = new Date(borrowedAt.getTime() + 8 * 60 * 60_000)
  const clock = dueTime ?? local.toISOString().slice(11, 19)
  const extraMs = dueTime ? 0 : borrowedAt.getUTCMilliseconds()
  let date = nextDate(manilaDate(borrowedAt), days)
  for (let inspected = 0; inspected < 366; inspected++) {
    const weekday = ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1
    if (openDays.has(weekday) && !closedDates.has(date)) return new Date(manilaInstant(date, clock.length === 5 ? `${clock}:00` : clock).getTime() + extraMs)
    date = nextDate(date)
  }
  throw new Error('No open due date is configured within one year.')
}
