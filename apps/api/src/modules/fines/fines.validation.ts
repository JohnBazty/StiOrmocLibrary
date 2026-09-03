import { HttpError } from '../../core/http-error.ts'

export type FinePeriod = 'all' | 'daily' | 'weekly' | 'monthly' | 'semester' | 'custom'
export type FineFilters = {
  search: string
  status: string
  type: string
  period: FinePeriod
  date: string | null
  month: string | null
  week: number | null
  termId: number | null
  from: string | null
  to: string | null
  page: number
  limit: number
}

const STATUSES = new Set(['all', 'Accruing', 'Unpaid', 'Partially Paid', 'Paid', 'Waived', 'Voided'])
const TYPES = new Set(['all', 'Overdue', 'Infraction', 'Lost Book'])
const PERIODS = new Set<FinePeriod>(['all', 'daily', 'weekly', 'monthly', 'semester', 'custom'])
const DATE = /^\d{4}-\d{2}-\d{2}$/
const MONTH = /^\d{4}-\d{2}$/

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(422, 'FINE_INVALID_BODY', 'Provide a valid request body.')
  return input as Record<string, unknown>
}

function positiveNumber(value: unknown, label: string) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) throw new HttpError(422, 'FINE_INVALID_AMOUNT', `${label} must be greater than zero.`)
  return Math.round(number * 100) / 100
}

function positiveId(value: unknown, label: string) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1) throw new HttpError(422, 'FINE_INVALID_ID', `${label} is invalid.`)
  return number
}

function requiredText(value: unknown, label: string, minimum = 3, maximum = 500) {
  if (typeof value !== 'string') throw new HttpError(422, 'FINE_INVALID_FIELD', `${label} is required.`)
  const text = value.trim()
  if (text.length < minimum || text.length > maximum) throw new HttpError(422, 'FINE_INVALID_FIELD', `${label} must contain ${minimum}-${maximum} characters.`)
  return text
}

export function parseFineFilters(query: Record<string, unknown>): FineFilters {
  const period = String(query.period ?? 'all').toLowerCase() as FinePeriod
  if (!PERIODS.has(period)) throw new HttpError(422, 'FINE_INVALID_PERIOD', 'Select all records, daily, weekly, monthly, semester, or custom.')
  const status = String(query.status ?? 'all')
  const type = String(query.type ?? 'all')
  if (!STATUSES.has(status)) throw new HttpError(422, 'FINE_INVALID_STATUS', 'The selected fine status is invalid.')
  if (!TYPES.has(type)) throw new HttpError(422, 'FINE_INVALID_TYPE', 'The selected fine type is invalid.')
  const date = query.date ? String(query.date) : null
  const month = query.month ? String(query.month) : null
  const from = query.from ? String(query.from) : null
  const to = query.to ? String(query.to) : null
  if (date && !DATE.test(date)) throw new HttpError(422, 'FINE_INVALID_DATE', 'Use YYYY-MM-DD for the report date.')
  if (month && !MONTH.test(month)) throw new HttpError(422, 'FINE_INVALID_MONTH', 'Use YYYY-MM for the report month.')
  if (from && !DATE.test(from)) throw new HttpError(422, 'FINE_INVALID_DATE', 'Use YYYY-MM-DD for the starting date.')
  if (to && !DATE.test(to)) throw new HttpError(422, 'FINE_INVALID_DATE', 'Use YYYY-MM-DD for the ending date.')
  const week = query.week === undefined ? null : Number(query.week)
  if (week !== null && (!Number.isSafeInteger(week) || week < 1 || week > 4)) throw new HttpError(422, 'FINE_INVALID_WEEK', 'Select week 1, 2, 3, or 4.')
  const termId = query.termId === undefined ? null : positiveId(query.termId, 'Semester')
  const search = String(query.search ?? '').trim().slice(0, 100)
  return {
    search, status, type, period, date, month, week, termId, from, to,
    page: Math.max(1, Math.trunc(Number(query.page) || 1)),
    limit: Math.min(100, Math.max(1, Math.trunc(Number(query.limit) || 25))),
  }
}

export function validateInfraction(input: unknown) {
  const body = object(input)
  const incidentAt = new Date(String(body.incidentAt ?? body.incident_at ?? ''))
  if (Number.isNaN(incidentAt.getTime())) throw new HttpError(422, 'FINE_INVALID_INCIDENT_DATE', 'Enter a valid incident date and time.')
  return {
    schoolId: requiredText(body.schoolId ?? body.school_id, 'School ID', 3, 50),
    category: requiredText(body.category, 'Category', 2, 80),
    amount: positiveNumber(body.amount, 'Fine amount'),
    incidentAt,
    location: body.location ? requiredText(body.location, 'Location', 2, 150) : null,
    details: requiredText(body.details, 'Incident details', 10, 500),
  }
}

export function validateCashPayment(input: unknown) {
  const body = object(input)
  if (!Array.isArray(body.allocations) || body.allocations.length < 1 || body.allocations.length > 25) {
    throw new HttpError(422, 'FINE_PAYMENT_ALLOCATIONS_REQUIRED', 'Select at least one and no more than 25 obligations.')
  }
  const allocations = body.allocations.map((raw, index) => {
    const item = object(raw)
    const fineId = item.fineId ?? item.fine_id
    const lostId = item.lostBookReportId ?? item.lost_book_report_id
    if ((fineId ? 1 : 0) + (lostId ? 1 : 0) !== 1) throw new HttpError(422, 'FINE_PAYMENT_TARGET_INVALID', `Allocation ${index + 1} must target exactly one obligation.`)
    return {
      fineId: fineId ? positiveId(fineId, 'Fine') : null,
      lostBookReportId: lostId ? positiveId(lostId, 'Lost-book charge') : null,
      amount: positiveNumber(item.amount, `Allocation ${index + 1} amount`),
    }
  })
  const key = requiredText(body.requestKey ?? body.request_key, 'Payment request key', 8, 64)
  if (!/^[A-Za-z0-9:_-]+$/.test(key)) throw new HttpError(422, 'FINE_PAYMENT_KEY_INVALID', 'The payment request key contains unsupported characters.')
  return { allocations, requestKey: key, notes: body.notes ? requiredText(body.notes, 'Payment notes', 3, 500) : null }
}

export function validateAdjustment(input: unknown) {
  const body = object(input)
  const type = String(body.type ?? '')
  if (!['Waiver', 'Reduction', 'Void'].includes(type)) throw new HttpError(422, 'FINE_ADJUSTMENT_TYPE_INVALID', 'Select Waiver, Reduction, or Void.')
  return {
    type: type as 'Waiver' | 'Reduction' | 'Void',
    amount: body.amount === undefined || body.amount === null || body.amount === '' ? null : positiveNumber(body.amount, 'Adjustment amount'),
    reason: requiredText(body.reason, 'Adjustment reason', 10, 500),
  }
}

export function validateReversal(input: unknown) {
  const body = object(input)
  return { reason: requiredText(body.reason, 'Reversal reason', 10, 500) }
}

export const fineId = (value: unknown) => positiveId(value, 'Fine')
export const receiptId = (value: unknown) => positiveId(value, 'Receipt')
