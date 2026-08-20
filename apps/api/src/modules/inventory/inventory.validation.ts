import { HttpError } from '../../core/http-error.ts'

export type InventoryListFilters = {
  page: number
  limit: number
  query: string | null
  conditionState: string | null
  availabilityStatus: string | null
}

const CONDITIONS = new Set(['New', 'Good', 'Fair', 'Damaged', 'For Repair', 'Lost'])
const AVAILABILITY = new Set(['Available', 'Borrowed', 'Reserved', 'Unavailable', 'Archived'])

function first(value: unknown) {
  return Array.isArray(value) ? String(value[0] ?? '') : typeof value === 'string' ? value : ''
}

function positiveInteger(value: unknown, fallback: number, field: string) {
  const raw = first(value).trim()
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new HttpError(422, 'INVENTORY_VALIDATION_FAILED', `${field} must be a positive integer.`, {
      errors: { [field]: `${field} must be a positive integer.` },
    })
  }
  return parsed
}

export function normalizeBarcode(value: unknown) {
  const barcode = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!barcode || barcode.length > 100 || /[\x00-\x1F\x7F]/.test(barcode)) {
    throw new HttpError(422, 'INVENTORY_VALIDATION_FAILED', 'Provide a valid barcode of at most 100 characters.', {
      errors: { barcode: 'Barcode is required, must not contain control characters, and must not exceed 100 characters.' },
    })
  }
  return barcode
}

export function parseInventoryListFilters(query: Record<string, unknown>): InventoryListFilters {
  const conditionState = first(query.condition_state ?? query.conditionState).trim() || null
  const availabilityStatus = first(query.availability_status ?? query.availabilityStatus).trim() || null
  if (conditionState && !CONDITIONS.has(conditionState)) {
    throw new HttpError(422, 'INVENTORY_VALIDATION_FAILED', 'condition_state is not supported.', {
      errors: { condition_state: 'Select a supported physical-copy condition.' },
    })
  }
  if (availabilityStatus && !AVAILABILITY.has(availabilityStatus)) {
    throw new HttpError(422, 'INVENTORY_VALIDATION_FAILED', 'availability_status is not supported.', {
      errors: { availability_status: 'Select a supported availability state.' },
    })
  }
  return {
    page: positiveInteger(query.page, 1, 'page'),
    limit: Math.min(positiveInteger(query.limit, 25, 'limit'), 100),
    query: first(query.q ?? query.query).trim().slice(0, 255) || null,
    conditionState,
    availabilityStatus,
  }
}

export function parseScanBody(body: unknown) {
  const value = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  return { barcode: normalizeBarcode(value.barcode) }
}

export function parseConditionBody(body: unknown) {
  const value = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const raw = typeof value.condition_state === 'string' ? value.condition_state.trim().toLowerCase() : ''
  if (raw !== 'damaged' && raw !== 'lost') {
    throw new HttpError(422, 'INVENTORY_VALIDATION_FAILED', 'condition_state must be damaged or lost.', {
      errors: { condition_state: 'Select damaged or lost.' },
    })
  }
  return { barcode: normalizeBarcode(value.barcode), conditionState: raw === 'damaged' ? 'Damaged' as const : 'Lost' as const }
}
