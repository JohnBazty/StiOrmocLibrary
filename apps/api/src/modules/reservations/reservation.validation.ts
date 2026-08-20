import { HttpError } from '../../core/http-error.ts'

export const RESERVATION_STATUSES = ['pending', 'approved', 'ready_for_pickup', 'claimed', 'cancelled', 'expired'] as const
export type ReservationStatus = typeof RESERVATION_STATUSES[number]
export type QueueFilters = {
  status: ReservationStatus | null; dateFrom: string | null; dateTo: string | null
  user: string | null; role: 'Student' | 'Faculty' | null; page: number; limit: number
}

export function positiveId(value: unknown, field: string) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1) throw new HttpError(422, 'RESERVATION_VALIDATION_FAILED', `${field} must be a positive integer.`, { errors: { [field]: `${field} must be a positive integer.` } })
  return number
}

function stringValue(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export function validateReservationRequest(body: unknown) {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  return { materialId: positiveId(input.materialId ?? input.material_id, 'materialId') }
}

export function validateStatusAdjustment(body: unknown) {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const status = stringValue(input.status) as ReservationStatus
  if (!RESERVATION_STATUSES.includes(status) || status === 'pending' || status === 'expired') {
    throw new HttpError(422, 'RESERVATION_STATUS_INVALID', 'Administrative status must be approved, ready_for_pickup, claimed, or cancelled.')
  }
  let pickupDeadline: Date | null = null
  if (input.pickupDeadline) {
    pickupDeadline = new Date(String(input.pickupDeadline))
    if (Number.isNaN(pickupDeadline.getTime())) throw new HttpError(422, 'PICKUP_DEADLINE_INVALID', 'Pickup deadline must be a valid date and time.')
  }
  return { status, pickupDeadline }
}

export function parseQueueFilters(query: Record<string, unknown>): QueueFilters {
  const statusText = stringValue(query.status)
  if (statusText && !RESERVATION_STATUSES.includes(statusText as ReservationStatus)) throw new HttpError(422, 'RESERVATION_FILTER_INVALID', 'Unsupported reservation status filter.')
  const roleText = stringValue(query.role)
  if (roleText && !['Student', 'Faculty'].includes(roleText)) throw new HttpError(422, 'RESERVATION_FILTER_INVALID', 'Role must be Student or Faculty.')
  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  const dateFrom = stringValue(query.dateFrom) || null
  const dateTo = stringValue(query.dateTo) || null
  if ((dateFrom && !datePattern.test(dateFrom)) || (dateTo && !datePattern.test(dateTo))) throw new HttpError(422, 'RESERVATION_FILTER_INVALID', 'Date filters must use YYYY-MM-DD.')
  const page = query.page ? positiveId(query.page, 'page') : 1
  const requestedLimit = query.limit ? positiveId(query.limit, 'limit') : 25
  return {
    status: statusText as ReservationStatus || null, dateFrom, dateTo,
    user: stringValue(query.user ?? query.q).slice(0, 150) || null,
    role: roleText as 'Student' | 'Faculty' || null,
    page, limit: Math.min(requestedLimit, 100),
  }
}

