import { HttpError } from '../../core/http-error.ts'
import { CLOCK_TIME_HINT, formatClockTime, parseClockTime } from '../../core/clock-time.ts'

/** Standing decision: the fine cap is at most PHP 500. A higher cap needs Ethan's approval and a code change. */
export const FINE_CAP_CEILING = 500

export type FinePolicyInput = { hourlyRate: number; dailyRate: number; maximumPenalty: number; effectiveOn: string; changeReason: string; hourlyStartsAt: string | null; hourlyEndsAt: string | null }

function fail(field: string, message: string): never {
  throw new HttpError(422, 'FINE_POLICY_VALIDATION_FAILED', message, { errors: { [field]: message } })
}

function amount(value: unknown, field: string, label: string) {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) fail(field, `${label} must be a peso amount from 0 to ${FINE_CAP_CEILING} with at most 2 decimals.`)
  const parsed = Number(text)
  if (parsed > FINE_CAP_CEILING) fail(field, `${label} cannot be more than PHP ${FINE_CAP_CEILING}.`)
  return parsed
}

function campusDate(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : ''
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  const date = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null
  if (!date || date.toISOString().slice(0, 10) !== text) fail('effectiveOn', 'Choose a valid start date.')
  return text
}

function clock(value: unknown, field: string, label: string) {
  const time = parseClockTime(value)
  if (time === undefined) fail(field, `${label} must be ${CLOCK_TIME_HINT}, with AM or PM.`)
  return time
}

function reason(value: unknown) {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (text.length < 10 || text.length > 500 || /[\u0000-\u001f\u007f]/.test(text)) fail('changeReason', 'Give a reason of 10 to 500 characters.')
  return text
}

export function validateFinePolicy(body: unknown): FinePolicyInput {
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const hourlyRate = amount(input.hourlyRate, 'hourlyRate', 'Hourly rate')
  const dailyRate = amount(input.dailyRate, 'dailyRate', 'Daily rate')
  const maximumPenalty = amount(input.maximumPenalty, 'maximumPenalty', 'Maximum fine')
  if (maximumPenalty <= 0) fail('maximumPenalty', 'Maximum fine must be more than 0.')
  if (hourlyRate > dailyRate) fail('hourlyRate', 'Hourly rate cannot be more than the daily rate.')
  if (dailyRate > maximumPenalty) fail('dailyRate', 'Daily rate cannot be more than the maximum fine.')
  // Optional fine hours: hourly fines count only between these times each day.
  const hourlyStartsAt = clock(input.hourlyStartsAt, 'hourlyStartsAt', 'Fine hours start')
  const hourlyEndsAt = clock(input.hourlyEndsAt, 'hourlyEndsAt', 'Fine hours end')
  if ((hourlyStartsAt === null) !== (hourlyEndsAt === null)) fail('hourlyStartsAt', 'Enter both fine hours, or leave both blank to use the library closing time.')
  if (hourlyStartsAt && hourlyEndsAt && hourlyStartsAt >= hourlyEndsAt) fail('hourlyEndsAt', `The start (${formatClockTime(hourlyStartsAt)}) must be before the end (${formatClockTime(hourlyEndsAt)}).`)
  return { hourlyRate, dailyRate, maximumPenalty, effectiveOn: campusDate(input.effectiveOn), changeReason: reason(input.changeReason), hourlyStartsAt, hourlyEndsAt }
}
