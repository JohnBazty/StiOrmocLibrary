import { HttpError } from '../../core/http-error.ts'

export type ScheduleDay = { dayOfWeek: number; isOpen: boolean; opensAt: string | null; closesAt: string | null }
export type ScheduleClosure = { date: string; reason: string; startsAt?: string | null; endsAt?: string | null }
export type ScheduleInput = { revision: string; weekly: ScheduleDay[]; upcomingClosures: ScheduleClosure[] }

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const ENCODED_WINDOW = /^\[([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)\]\s*(.*)$/

const invalid = (message: string): never => {
  throw new HttpError(422, 'LIBRARY_SCHEDULE_INVALID', message)
}

export const scheduleToday = (now = new Date()) =>
  new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10)

export function manilaNowParts(now = new Date()) {
  const shifted = new Date(now.getTime() + 8 * 3600_000)
  const date = shifted.toISOString().slice(0, 10)
  const time = shifted.toISOString().slice(11, 16)
  const jsDay = shifted.getUTCDay()
  const dayOfWeek = jsDay === 0 ? 7 : jsDay
  return { date, time, dayOfWeek }
}

export function formatManila12Hour(hhmm: string | null | undefined): string {
  if (!hhmm) return ''
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim())
  if (!match) return hhmm
  const h = Number(match[1])
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${match[2]} ${period}`
}

export function encodeClosureReason(reason: string, startsAt?: string | null, endsAt?: string | null): string {
  const clean = reason.trim()
  if (startsAt && endsAt) {
    return `[${startsAt}-${endsAt}] ${clean}`
  }
  return clean
}

export function decodeClosureReason(rawReason: string): {
  reason: string
  startsAt: string | null
  endsAt: string | null
} {
  const text = String(rawReason ?? '').trim()
  const match = ENCODED_WINDOW.exec(text)
  if (!match) return { reason: text, startsAt: null, endsAt: null }
  return {
    startsAt: `${match[1]}:${match[2]}`,
    endsAt: `${match[3]}:${match[4]}`,
    reason: match[5].trim() || 'Scheduled closure',
  }
}

export function isLibraryClosedNow(
  schedule: { weekly: ScheduleDay[]; upcomingClosures: ScheduleClosure[] },
  now = new Date(),
): {
  closed: boolean
  reason: string
  closureWindow: string | null
  reopensLabel: string | null
} {
  const { date, time, dayOfWeek } = manilaNowParts(now)
  const closure = schedule.upcomingClosures.find((item) => item.date === date)
  if (closure) {
    if (closure.startsAt && closure.endsAt) {
      if (time >= closure.startsAt && time < closure.endsAt) {
        const windowLabel = `${formatManila12Hour(closure.startsAt)} – ${formatManila12Hour(closure.endsAt)}`
        return {
          closed: true,
          reason: `${closure.reason} (${windowLabel} Manila time)`,
          closureWindow: windowLabel,
          reopensLabel: formatManila12Hour(closure.endsAt),
        }
      }
    } else {
      return {
        closed: true,
        reason: `${closure.reason} (Closed all day)`,
        closureWindow: 'All day',
        reopensLabel: null,
      }
    }
  }

  const todayRule = schedule.weekly.find((day) => day.dayOfWeek === dayOfWeek)
  if (!todayRule || !todayRule.isOpen || !todayRule.opensAt || !todayRule.closesAt) {
    return {
      closed: true,
      reason: 'Scheduled weekly closed day',
      closureWindow: 'All day',
      reopensLabel: null,
    }
  }
  if (time < todayRule.opensAt || time >= todayRule.closesAt) {
    return {
      closed: true,
      reason: `Outside library operating hours (${formatManila12Hour(todayRule.opensAt)} – ${formatManila12Hour(todayRule.closesAt)} Manila time)`,
      closureWindow: `${formatManila12Hour(todayRule.opensAt)} – ${formatManila12Hour(todayRule.closesAt)}`,
      reopensLabel: time < todayRule.opensAt ? formatManila12Hour(todayRule.opensAt) : null,
    }
  }
  return {
    closed: false,
    reason: '',
    closureWindow: null,
    reopensLabel: null,
  }
}

export function validateLibrarySchedule(body: unknown, today = scheduleToday()): ScheduleInput {
  const input = body as Partial<ScheduleInput> | null
  if (!input || typeof input.revision !== 'string' || !/^[a-f0-9]{64}$/.test(input.revision))
    return invalid('Refresh the schedule before saving.')
  if (!Array.isArray(input.weekly) || input.weekly.length !== 7)
    return invalid('Include each day of the week once.')
  const seen = new Set<number>()
  const weekly = input.weekly
    .map((day) => {
      if (
        !day ||
        !Number.isInteger(day.dayOfWeek) ||
        day.dayOfWeek < 1 ||
        day.dayOfWeek > 7 ||
        seen.has(day.dayOfWeek) ||
        typeof day.isOpen !== 'boolean'
      )
        return invalid('Include each day of the week once and choose Open or Closed.')
      seen.add(day.dayOfWeek)
      if (!day.isOpen) return { dayOfWeek: day.dayOfWeek, isOpen: false, opensAt: null, closesAt: null }
      if (
        typeof day.opensAt !== 'string' ||
        typeof day.closesAt !== 'string' ||
        !TIME_PATTERN.test(day.opensAt) ||
        !TIME_PATTERN.test(day.closesAt) ||
        day.closesAt <= day.opensAt
      )
        return invalid('Each open day needs a closing time after its opening time, within the same day.')
      return { dayOfWeek: day.dayOfWeek, isOpen: true, opensAt: day.opensAt, closesAt: day.closesAt }
    })
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
  if (!weekly.some((day) => day.isOpen))
    return invalid('Keep at least one operating day. Use dated closures for temporary breaks.')
  if (!Array.isArray(input.upcomingClosures) || input.upcomingClosures.length > 366)
    return invalid('Include at most 366 dated closures.')
  const dates = new Set<string>()
  const upcomingClosures = input.upcomingClosures
    .map((closure) => {
      if (
        !closure ||
        typeof closure.date !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(closure.date) ||
        closure.date < today ||
        !Number.isFinite(Date.parse(`${closure.date}T00:00:00Z`)) ||
        new Date(`${closure.date}T00:00:00Z`).toISOString().slice(0, 10) !== closure.date
      )
        return invalid('Closure dates must be valid dates today or later in Manila time.')
      if (dates.has(closure.date))
        return invalid('A date can have only one closure. Edit the existing reason instead.')
      const cleanReason = typeof closure.reason === 'string' ? closure.reason.trim() : ''
      if (!cleanReason || cleanReason.length > 191)
        return invalid('Give each closure a reason of 1 to 191 characters.')

      const hasStart = typeof closure.startsAt === 'string' && closure.startsAt.trim().length > 0
      const hasEnd = typeof closure.endsAt === 'string' && closure.endsAt.trim().length > 0
      if (hasStart !== hasEnd) {
        return invalid('Enter both a closure start time and end time, or leave both blank for an all-day closure.')
      }
      if (hasStart && hasEnd) {
        const startsAt = closure.startsAt!.trim()
        const endsAt = closure.endsAt!.trim()
        if (!TIME_PATTERN.test(startsAt) || !TIME_PATTERN.test(endsAt) || endsAt <= startsAt) {
          return invalid('Closure end time must be after the closure start time within the same day.')
        }
        if (encodeClosureReason(cleanReason, startsAt, endsAt).length > 191) {
          return invalid('Shorten the closure reason so it fits with the closure time window.')
        }
        dates.add(closure.date)
        return { date: closure.date, reason: cleanReason, startsAt, endsAt }
      }
      dates.add(closure.date)
      return { date: closure.date, reason: cleanReason }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
  return { revision: input.revision, weekly, upcomingClosures }
}
