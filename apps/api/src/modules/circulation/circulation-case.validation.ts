import { HttpError } from '../../core/http-error.ts'
import {
  CASE_STATUSES,
  CASE_TYPES,
  DAMAGE_DISPOSITIONS,
  type CaseStatus,
  type CaseType,
  type DamageDisposition,
} from './circulation-case.types.ts'

function asObject(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(422, 'CASE_BODY_INVALID', 'A JSON object body is required.')
  }
  return body as Record<string, unknown>
}

function optionalString(value: unknown, field: string, max: number) {
  if (value === undefined || value === null || value === '') return null
  const text = String(value).trim()
  if (!text) return null
  if (text.length > max) throw new HttpError(422, 'CASE_FIELD_TOO_LONG', `${field} must be at most ${max} characters.`)
  return text
}

function requiredReason(value: unknown, field = 'reason') {
  const text = optionalString(value, field, 500)
  if (!text) throw new HttpError(422, 'CASE_REASON_REQUIRED', `A ${field} is required.`)
  return text
}

function positiveId(value: unknown, field: string) {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(422, 'CASE_ID_INVALID', `A valid ${field} is required.`)
  return id
}

export function validateCaseListQuery(query: Record<string, unknown>) {
  const page = Math.max(1, Math.trunc(Number(query.page) || 1))
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(query.limit) || 25)))
  const caseType = query.caseType ?? query.case_type
  const status = query.status
  const typeValue = caseType === undefined || caseType === null || caseType === '' || caseType === 'all'
    ? null
    : String(caseType)
  if (typeValue && !(CASE_TYPES as readonly string[]).includes(typeValue)) {
    throw new HttpError(422, 'CASE_TYPE_INVALID', 'caseType must be Long Overdue or Damage.')
  }
  const statusValue = status === undefined || status === null || status === '' || status === 'all'
    ? null
    : String(status)
  if (statusValue && !(CASE_STATUSES as readonly string[]).includes(statusValue)) {
    throw new HttpError(422, 'CASE_STATUS_INVALID', 'status is not a valid case status.')
  }
  return {
    page,
    limit,
    caseType: typeValue as CaseType | null,
    status: statusValue as CaseStatus | null,
    assigneeUserId: query.assigneeUserId || query.assigned_to_user_id
      ? positiveId(query.assigneeUserId ?? query.assigned_to_user_id, 'assigneeUserId')
      : null,
    borrowerQuery: optionalString(query.borrower ?? query.q, 'borrower', 120),
  }
}

export function validateOpenDamageCase(body: unknown) {
  const input = asObject(body)
  return {
    transactionId: positiveId(input.transactionId ?? input.transaction_id, 'transactionId'),
    observedCondition: optionalString(input.observedCondition ?? input.observed_condition, 'observedCondition', 40) ?? 'Damaged',
    description: requiredReason(input.description ?? input.summary ?? input.notes, 'description'),
  }
}

export function validateReportDamage(body: unknown) {
  const input = asObject(body)
  return {
    observedCondition: optionalString(input.observedCondition ?? input.observed_condition, 'observedCondition', 40) ?? 'Damaged',
    description: requiredReason(input.description ?? input.notes, 'description'),
  }
}

export function validateAssignCase(body: unknown) {
  const input = asObject(body)
  return {
    assignedToUserId: positiveId(input.assignedToUserId ?? input.assigned_to_user_id, 'assignedToUserId'),
    notes: optionalString(input.notes, 'notes', 1000),
  }
}

export function validateCaseNote(body: unknown) {
  const input = asObject(body)
  return { notes: requiredReason(input.notes ?? input.note, 'notes') }
}

export function validateContactAttempt(body: unknown) {
  const input = asObject(body)
  return {
    notes: requiredReason(input.notes ?? input.note, 'notes'),
    contactedAt: optionalString(input.contactedAt ?? input.contacted_at, 'contactedAt', 40),
  }
}

export function validateInspection(body: unknown) {
  const input = asObject(body)
  return {
    observedCondition: optionalString(input.observedCondition ?? input.observed_condition, 'observedCondition', 40),
    notes: requiredReason(input.notes ?? input.note, 'notes'),
  }
}

export function validateDisposition(body: unknown) {
  const input = asObject(body)
  const disposition = String(input.disposition ?? '')
  if (!(DAMAGE_DISPOSITIONS as readonly string[]).includes(disposition)) {
    throw new HttpError(422, 'CASE_DISPOSITION_INVALID', 'disposition must be repaired_available, damaged_held, or missing_lost.')
  }
  return {
    disposition: disposition as DamageDisposition,
    reason: requiredReason(input.reason ?? input.notes, 'reason'),
  }
}

export function validateCaseReason(body: unknown) {
  const input = asObject(body)
  return { reason: requiredReason(input.reason ?? input.notes, 'reason') }
}
