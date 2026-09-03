import { HttpError } from '../../core/http-error.ts'

export function positiveId(value: unknown, label = 'ID') {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new HttpError(422, 'CLEARANCE_ID_INVALID', `${label} is invalid.`)
  return parsed
}

export function validateOverride(body: unknown) {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const status = String(input.status ?? input.override_status ?? '')
  const reason = typeof input.reason === 'string' ? input.reason.trim().replace(/\s+/g, ' ').slice(0, 500) : ''
  const expiresAt = input.expires_at || input.expiresAt ? new Date(String(input.expires_at ?? input.expiresAt)) : null
  const errors: Record<string, string> = {}
  if (!['Cleared', 'Not Cleared'].includes(status)) errors.status = 'Choose Cleared or Not Cleared.'
  if (reason.length < 10) errors.reason = 'A documented reason of at least 10 characters is required.'
  if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date())) errors.expires_at = 'Expiration must be a future date and time.'
  if (Object.keys(errors).length) throw new HttpError(422, 'CLEARANCE_OVERRIDE_INVALID', 'Please correct the override fields.', { errors })
  return { status: status as 'Cleared' | 'Not Cleared', reason, expiresAt }
}

export function validateRevocation(body: unknown) {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const reason = typeof input.reason === 'string' ? input.reason.trim().replace(/\s+/g, ' ').slice(0, 500) : ''
  if (reason.length < 10) throw new HttpError(422, 'CLEARANCE_REVOCATION_INVALID', 'A revocation reason of at least 10 characters is required.')
  return { reason }
}

export function validateLostDecision(body: unknown) {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const status = String(input.status ?? '')
  const notes = typeof input.notes === 'string' ? input.notes.trim().replace(/\s+/g, ' ').slice(0, 500) : ''
  const replacementCharge = input.replacement_charge === undefined || input.replacement_charge === null || input.replacement_charge === ''
    ? null : Number(input.replacement_charge)
  if (!['Confirmed', 'Rejected'].includes(status)) throw new HttpError(422, 'LOST_BOOK_DECISION_INVALID', 'Choose Confirmed or Rejected.')
  if (status === 'Confirmed' && replacementCharge !== null && (!Number.isFinite(replacementCharge) || replacementCharge <= 0 || replacementCharge > 1_000_000)) {
    throw new HttpError(422, 'LOST_BOOK_CHARGE_INVALID', 'The replacement charge must be a positive amount.')
  }
  return { status: status as 'Confirmed' | 'Rejected', notes: notes || null, replacementCharge }
}
