import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../../core/http-error.ts'

export type InventoryListFilters = {
  page: number
  limit: number
  query: string | null
  conditionState: string | null
  availabilityStatus: string | null
}

export type InventoryCondition = 'Good' | 'Fair' | 'For Repair' | 'Damaged' | 'Lost'
export type ManualAvailability = 'Available' | 'Unavailable'

const CONDITIONS = new Set<InventoryCondition>(['Good', 'Fair', 'For Repair', 'Damaged', 'Lost'])
const AVAILABILITY = new Set(['Available', 'Borrowed', 'Reserved', 'Unavailable', 'Archived'])
const CONDITION_INPUTS: Record<string, InventoryCondition> = {
  good: 'Good',
  fair: 'Fair',
  for_repair: 'For Repair',
  damaged: 'Damaged',
  lost: 'Lost',
}

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
  if (conditionState && !CONDITIONS.has(conditionState as InventoryCondition)) {
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
  const conditionState = CONDITION_INPUTS[raw]
  if (!conditionState) {
    throw new HttpError(422, 'INVENTORY_VALIDATION_FAILED', 'condition_state is not supported.', {
      errors: { condition_state: 'Select good, fair, for_repair, damaged, or lost.' },
    })
  }
  return { barcode: normalizeBarcode(value.barcode), conditionState }
}

export function parseAvailabilityBody(body: unknown) {
  const value = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const raw = typeof value.availability_status === 'string' ? value.availability_status.trim().toLowerCase() : ''
  if (raw !== 'available' && raw !== 'unavailable') {
    throw new HttpError(422, 'INVENTORY_VALIDATION_FAILED', 'availability_status must be available or unavailable.', {
      errors: { availability_status: 'Select available or unavailable.' },
    })
  }
  return {
    barcode: normalizeBarcode(value.barcode),
    availabilityStatus: (raw === 'available' ? 'Available' : 'Unavailable') as ManualAvailability,
  }
}

export function validateConditionMutation(request: Request, response: Response, next: NextFunction) {
  try {
    response.locals.inventoryConditionMutation = parseConditionBody(request.body)
    next()
  } catch (error) { next(error) }
}

export function validateAvailabilityMutation(request: Request, response: Response, next: NextFunction) {
  try {
    response.locals.inventoryAvailabilityMutation = parseAvailabilityBody(request.body)
    next()
  } catch (error) { next(error) }
}
