import type { PoolConnection, RowDataPacket } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'

/** Opening hours by ISO weekday (1 = Monday). Manila is UTC+8 all year, so plain offset arithmetic is exact. */
export type OpeningSchedule = Map<number, { opensAt: string; closesAt: string }>
const OFFSET = 8 * 3_600_000
const DAY = 86_400_000
const HORIZON_DAYS = 31
export const noScheduleError = () => new HttpError(422, 'LIBRARY_CLOSED_NO_SCHEDULE', 'The library has no open day in the next 31 days, so a pickup deadline cannot be set.')

const dayIndex = (t: Date) => Math.floor((t.getTime() + OFFSET) / DAY)
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const dateKey = (index: number) => new Date(index * DAY).toISOString().slice(0, 10)

/** Opening and closing instants for a Manila day, or null when closed. */
function hours(index: number, schedule: OpeningSchedule, closedDates: Set<string>) {
  const day = schedule.get(((index + 3) % 7) + 1) // 1970-01-01 was a Thursday (ISO 4)
  if (!day || closedDates.has(dateKey(index))) return null
  const base = index * DAY - OFFSET
  return { opens: base + minutes(day.opensAt) * 60_000, closes: base + minutes(day.closesAt) * 60_000 }
}

export function isOpenAt(t: Date, schedule: OpeningSchedule, closedDates: Set<string>) {
  const h = hours(dayIndex(t), schedule, closedDates)
  return Boolean(h && t.getTime() >= h.opens && t.getTime() <= h.closes)
}

function firstClose(t: Date, schedule: OpeningSchedule, closedDates: Set<string>, strict: boolean) {
  const first = dayIndex(t)
  for (let index = first; index <= first + HORIZON_DAYS; index++) {
    const h = hours(index, schedule, closedDates)
    if (h && (strict ? h.closes > t.getTime() : h.closes >= t.getTime())) return new Date(h.closes)
  }
  throw noScheduleError()
}
/** First closing time at or after t on an open day. */
export const nextClose = (t: Date, schedule: OpeningSchedule, closedDates: Set<string>) => firstClose(t, schedule, closedDates, false)
/** First closing time strictly after t on an open day. */
export const nextCloseAfter = (t: Date, schedule: OpeningSchedule, closedDates: Set<string>) => firstClose(t, schedule, closedDates, true)

/** N days (N x 24 h) after ready; if that is outside open hours, the next closing time. Never earlier than N days. */
export function pickupDeadline(readyAt: Date, schedule: OpeningSchedule, closedDates: Set<string>, windowDays = 1) {
  const t = new Date(readyAt.getTime() + windowDays * DAY)
  return isOpenAt(t, schedule, closedDates) ? t : nextClose(t, schedule, closedDates)
}

const localDate = (value: unknown) => {
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  return String(value).slice(0, 10)
}

export async function loadOpeningHours(q: PoolConnection, from: Date, windowDays = 1) {
  const [days] = await q.execute<RowDataPacket[]>('SELECT day_of_week,is_open,opens_at,closes_at FROM library_operating_schedule')
  const schedule: OpeningSchedule = new Map()
  for (const d of days) if (Number(d.is_open) && d.opens_at && d.closes_at) schedule.set(Number(d.day_of_week), { opensAt: String(d.opens_at), closesAt: String(d.closes_at) })
  const start = dateKey(dayIndex(from) - 1), end = dateKey(dayIndex(from) + windowDays + HORIZON_DAYS + 1)
  const [closed] = await q.execute<RowDataPacket[]>('SELECT closed_date FROM library_closed_days WHERE closed_date >= DATE(?) AND closed_date <= DATE(?)', [start, end])
  return { schedule, closedDates: new Set(closed.map((r) => localDate(r.closed_date))) }
}
