import { HttpError } from '../../core/http-error.ts'

function inputObject(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

export function positiveCirculationId(value: unknown, field: string) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new HttpError(422, 'CIRCULATION_VALIDATION_FAILED', `${field} must be a positive integer.`, {
      errors: { [field]: `${field} must be a positive integer.` },
    })
  }
  return parsed
}

function optionalPositiveId(value: unknown, field: string) {
  return value === undefined || value === null || value === '' ? null : positiveCirculationId(value, field)
}

function barcode(value: unknown) {
  const parsed = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!parsed || parsed.length > 100 || /[\u0000-\u001f\u007f]/.test(parsed)) {
    throw new HttpError(422, 'CIRCULATION_VALIDATION_FAILED', 'barcode must be a valid scanner value.', {
      errors: { barcode: 'Barcode is required, must not exceed 100 characters, and cannot contain control characters.' },
    })
  }
  return parsed
}

export function validateCheckout(body: unknown) {
  const input = inputObject(body)
  const schoolId = typeof (input.schoolId ?? input.school_id) === 'string'
    ? String(input.schoolId ?? input.school_id).trim().toUpperCase().slice(0, 50)
    : ''
  const userId = optionalPositiveId(input.userId ?? input.user_id, 'userId')
  if (!userId && !schoolId) {
    throw new HttpError(422, 'CIRCULATION_VALIDATION_FAILED', 'Provide the borrower school ID or user ID.', {
      errors: { schoolId: 'School ID or user ID is required.' },
    })
  }
  return {
    barcode: barcode(input.barcode),
    schoolId: schoolId || null,
    userId,
    reservationId: optionalPositiveId(input.reservationId ?? input.reservation_id, 'reservationId'),
  }
}

export function validateHistoryQuery(query: Record<string, unknown>) {
  const page = query.page ? positiveCirculationId(query.page, 'page') : 1
  const requestedLimit = query.limit ? positiveCirculationId(query.limit, 'limit') : 25
  return { page, limit: Math.min(requestedLimit, 100) }
}

export function validateCancellation(body: unknown) {
  const input = inputObject(body)
  const rawReason = input.reason
  if (rawReason !== undefined && typeof rawReason !== 'string') {
    throw new HttpError(422, 'CIRCULATION_VALIDATION_FAILED', 'Cancellation reason must be text.', {
      errors: { reason: 'Cancellation reason must be text.' },
    })
  }
  const reason = typeof rawReason === 'string' ? rawReason.trim().replace(/\s+/g, ' ') : ''
  if (reason.length > 255 || /[\u0000-\u001f\u007f]/.test(reason)) {
    throw new HttpError(422, 'CIRCULATION_VALIDATION_FAILED', 'Cancellation reason is invalid.', {
      errors: { reason: 'Cancellation reason cannot exceed 255 characters or contain control characters.' },
    })
  }
  return { reason: reason || 'Pending counter-claim request cancelled.' }
}

export type BorrowCartInput = { titleIds: number[] }

export function validateBorrowCart(body: unknown): BorrowCartInput {
  const input = inputObject(body)
  const rawItems = input.titleIds ?? input.title_ids ?? input.items
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new HttpError(422, 'BORROW_CART_VALIDATION_FAILED', 'Add at least one book before submitting the borrow request.', {
      errors: { titleIds: 'titleIds must be a non-empty array.' },
    })
  }
  if (rawItems.length > 50) {
    throw new HttpError(422, 'BORROW_CART_VALIDATION_FAILED', 'The cart cannot contain more than 50 books.', {
      errors: { titleIds: 'A maximum of 50 books may be submitted at once.' },
    })
  }
  const titleIds = rawItems.map((item) => {
    const value = item && typeof item === 'object'
      ? (item as Record<string, unknown>).titleId ?? (item as Record<string, unknown>).title_id
      : item
    return positiveCirculationId(value, 'titleId')
  })
  if (new Set(titleIds).size !== titleIds.length) {
    throw new HttpError(422, 'BORROW_CART_DUPLICATE_TITLE', 'The same book title cannot appear twice in one cart.', {
      errors: { titleIds: 'Remove duplicate book titles before submitting.' },
    })
  }
  return { titleIds }
}
