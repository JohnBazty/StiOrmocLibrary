import { formatClockTime } from '../../core/clock-time.ts'

const manilaClock = (now: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
const hhmm = (value: unknown) => /^(\d{2}):(\d{2})/.exec(String(value ?? ''))?.[0] ?? null

/**
 * The borrowing policy may limit when the desk lends or takes back books (Manila time, start
 * inclusive, end exclusive). Returns the message to show when the desk is outside that window.
 */
export function deskWindowMessage(action: 'Borrowing' | 'Returning', opensAt: unknown, closesAt: unknown, now: Date): string | null {
  const opens = hhmm(opensAt), closes = hhmm(closesAt)
  if (!opens || !closes) return null
  const clock = manilaClock(now)
  return clock >= opens && clock < closes ? null : `${action} is allowed from ${formatClockTime(opens)} to ${formatClockTime(closes)}.`
}
