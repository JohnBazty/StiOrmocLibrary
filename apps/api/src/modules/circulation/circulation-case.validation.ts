import { HttpError } from '../../core/http-error.ts'
import { CASE_STATUSES, DAMAGE_DISPOSITIONS, type CaseStatus, type DamageDisposition } from './circulation-case.types.ts'

const MAX_CHARGE = 1_000_000
/** Keeps the interpolated OFFSET a plain finite integer. */
const MAX_PAGE = 10_000

function asObject(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(422, 'CASE_BODY_INVALID', 'A JSON object body is required.')
  }
  return body as Record<string, unknown>
}

function optionalText(value: unknown, field: string, max: number) {
  if (value === undefined || value === null) return null
  const text = String(value).trim().replace(/\s+/g, ' ')
  if (!text) return null
  if (text.length > max) throw new HttpError(422, 'CASE_FIELD_TOO_LONG', `${field} must be at most ${max} characters.`)
  return text
}

function requiredText(value: unknown, field: string, max = 500) {
  const text = optionalText(value, field, max)
  if (!text) throw new HttpError(422, 'CASE_REASON_REQUIRED', `A ${field} is required.`)
  return text
}

export function positiveCaseId(value: unknown, field = 'case ID') {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(422, 'CASE_ID_INVALID', `A valid ${field} is required.`)
  return id
}

export function validateCaseListQuery(query: Record<string, unknown>) {
  const page = Math.min(MAX_PAGE, Math.max(1, Math.trunc(Number(query.page) || 1)))
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(query.limit) || 25)))
  const rawStatus = query.status
  const status = rawStatus === undefined || rawStatus === '' || rawStatus === 'all' ? null : String(rawStatus)
  if (status && !(CASE_STATUSES as readonly string[]).includes(status)) {
    throw new HttpError(422, 'CASE_STATUS_INVALID', 'status is not a valid case status.')
  }
  return { page, limit, status: status as CaseStatus | null, search: optionalText(query.q, 'search', 120) }
}

export function validateCaseNote(body: unknown) {
  return { notes: requiredText(asObject(body).notes, 'notes', 1000) }
}

export function validateCaseReason(body: unknown) {
  return { reason: requiredText(asObject(body).reason, 'reason') }
}

export function validateDisposition(body: unknown) {
  const input = asObject(body)
  const disposition = String(input.disposition ?? '')
  if (!(DAMAGE_DISPOSITIONS as readonly string[]).includes(disposition)) {
    throw new HttpError(422, 'CASE_DISPOSITION_INVALID', 'disposition must be repaired_available, damaged_held, or lost.')
  }
  const rawCharge = input.replacementCharge
  const replacementCharge = rawCharge === undefined || rawCharge === null || rawCharge === '' ? null : Number(rawCharge)
  if (replacementCharge !== null && (!Number.isFinite(replacementCharge) || replacementCharge <= 0 || replacementCharge > MAX_CHARGE)) {
    throw new HttpError(422, 'CASE_LOST_CHARGE_INVALID', 'The replacement charge must be a positive amount.')
  }
  return {
    disposition: disposition as DamageDisposition,
    reason: requiredText(input.reason, 'reason'),
    replacementCharge: replacementCharge === null ? null : Math.round(replacementCharge * 100) / 100,
  }
}
