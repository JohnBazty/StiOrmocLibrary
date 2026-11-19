import { HttpError } from '../../core/http-error.ts'

export type ScheduleDay = { dayOfWeek: number; isOpen: boolean; opensAt: string | null; closesAt: string | null }
export type ScheduleClosure = { date: string; reason: string }
export type ScheduleInput = { revision: string; weekly: ScheduleDay[]; upcomingClosures: ScheduleClosure[] }
const invalid = (message: string): never => { throw new HttpError(422, 'LIBRARY_SCHEDULE_INVALID', message) }
export const scheduleToday = (now = new Date()) => new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10)
export function validateLibrarySchedule(body: unknown, today = scheduleToday()): ScheduleInput {
  const input = body as Partial<ScheduleInput> | null
  if (!input || typeof input.revision !== 'string' || !/^[a-f0-9]{64}$/.test(input.revision)) return invalid('Refresh the schedule before saving.')
  if (!Array.isArray(input.weekly) || input.weekly.length !== 7) return invalid('Include each day of the week once.')
  const seen = new Set<number>()
  const weekly = input.weekly.map(day => {
    if (!day || !Number.isInteger(day.dayOfWeek) || day.dayOfWeek < 1 || day.dayOfWeek > 7 || seen.has(day.dayOfWeek) || typeof day.isOpen !== 'boolean') return invalid('Include each day of the week once and choose Open or Closed.')
    seen.add(day.dayOfWeek)
    if (!day.isOpen) return { dayOfWeek: day.dayOfWeek, isOpen: false, opensAt: null, closesAt: null }
    if (typeof day.opensAt !== 'string' || typeof day.closesAt !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(day.opensAt) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(day.closesAt) || day.closesAt <= day.opensAt) return invalid('Each open day needs a closing time after its opening time, within the same day.')
    return { dayOfWeek: day.dayOfWeek, isOpen: true, opensAt: day.opensAt, closesAt: day.closesAt }
  }).sort((a, b) => a.dayOfWeek - b.dayOfWeek)
  if (!weekly.some(day => day.isOpen)) return invalid('Keep at least one operating day. Use dated closures for temporary breaks.')
  if (!Array.isArray(input.upcomingClosures) || input.upcomingClosures.length > 366) return invalid('Include at most 366 dated closures.')
  const dates = new Set<string>()
  const upcomingClosures = input.upcomingClosures.map(closure => {
    if (!closure || typeof closure.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(closure.date) || closure.date < today || !Number.isFinite(Date.parse(`${closure.date}T00:00:00Z`)) || new Date(`${closure.date}T00:00:00Z`).toISOString().slice(0, 10) !== closure.date) return invalid('Closure dates must be valid dates today or later in Manila time.')
    if (dates.has(closure.date)) return invalid('A date can have only one closure. Edit the existing reason instead.')
    if (typeof closure.reason !== 'string' || !closure.reason.trim() || closure.reason.trim().length > 191) return invalid('Give each closure a reason of 1 to 191 characters.')
    dates.add(closure.date)
    return { date: closure.date, reason: closure.reason.trim() }
  }).sort((a, b) => a.date.localeCompare(b.date))
  return { revision: input.revision, weekly, upcomingClosures }
}
