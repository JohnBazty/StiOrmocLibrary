import { HttpError } from '../../core/http-error.ts'

export interface RenewalRequestInput {
  requestKey: string
  staffNote: string | null
}

export function renewalTransactionId(value: unknown): number {
  const transactionId = Number(value)
  if (!Number.isSafeInteger(transactionId) || transactionId < 1) {
    throw new HttpError(422, 'RENEWAL_VALIDATION_FAILED', 'transactionId must be a positive integer.')
  }
  return transactionId
}

export function validateRenewalRequest(body: unknown, requiresStaffNote = false): RenewalRequestInput {
  const source = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const requestKey = typeof source.requestKey === 'string' ? source.requestKey.trim() : ''
  const staffNote = typeof source.staffNote === 'string' ? source.staffNote.trim() : ''

  if (!requestKey || requestKey.length > 64 || !/^[A-Za-z0-9_-]+$/.test(requestKey)) {
    throw new HttpError(
      422,
      'RENEWAL_VALIDATION_FAILED',
      'requestKey must contain 1 to 64 letters, numbers, underscores, or hyphens.',
    )
  }
  if (requiresStaffNote && (!staffNote || staffNote.length > 500)) {
    throw new HttpError(422, 'RENEWAL_STAFF_NOTE_REQUIRED', 'A staff note of 1 to 500 characters is required.')
  }
  if (!requiresStaffNote && staffNote) {
    throw new HttpError(422, 'RENEWAL_VALIDATION_FAILED', 'staffNote is allowed only for staff renewals.')
  }

  return { requestKey, staffNote: staffNote || null }
}
