import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../../core/http-error.ts'
import { normalizeBarcode } from './inventory.validation.ts'

export type ThesisCondition = 'good' | 'fair' | 'for_repair' | 'damaged' | 'lost'
export type ThesisAvailability = 'available' | 'unavailable'
export type ThesisInventoryFilters = {
  page: number
  limit: number
  query: string | null
  conditionState: ThesisCondition | null
  availabilityStatus: 'available' | 'unavailable' | 'borrowed' | 'reserved' | null
  publicationYear: number | null
}

const CONDITIONS = new Set<ThesisCondition>(['good', 'fair', 'for_repair', 'damaged', 'lost'])
const AVAILABILITY = new Set(['available', 'unavailable', 'borrowed', 'reserved'])

function first(value: unknown) {
  return Array.isArray(value) ? String(value[0] ?? '') : typeof value === 'string' ? value : ''
}

function positiveInteger(value: unknown, fallback: number, field: string) {
  const raw = first(value).trim()
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new HttpError(422, 'THESIS_INVENTORY_VALIDATION_FAILED', `${field} must be a positive integer.`, {
      errors: { [field]: `${field} must be a positive integer.` },
    })
  }
  return parsed
}

export function parseThesisInventoryFilters(query: Record<string, unknown>): ThesisInventoryFilters {
  const condition = first(query.condition_state).trim().toLowerCase()
  const availability = first(query.availability_status).trim().toLowerCase()
  if (condition && !CONDITIONS.has(condition as ThesisCondition)) {
    throw new HttpError(422, 'THESIS_INVENTORY_VALIDATION_FAILED', 'condition_state is not supported.')
  }
  if (availability && !AVAILABILITY.has(availability)) {
    throw new HttpError(422, 'THESIS_INVENTORY_VALIDATION_FAILED', 'availability_status is not supported.')
  }
  const yearRaw = first(query.publication_year ?? query.year).trim()
  const publicationYear = yearRaw ? Number(yearRaw) : null
  if (publicationYear !== null && (!Number.isSafeInteger(publicationYear) || publicationYear < 1901 || publicationYear > new Date().getFullYear())) {
    throw new HttpError(422, 'THESIS_INVENTORY_VALIDATION_FAILED', 'publication_year is outside the supported range.')
  }
  return {
    page: positiveInteger(query.page, 1, 'page'),
    limit: Math.min(positiveInteger(query.limit, 25, 'limit'), 100),
    query: first(query.q ?? query.query).trim().slice(0, 255) || null,
    conditionState: (condition || null) as ThesisCondition | null,
    availabilityStatus: (availability || null) as ThesisInventoryFilters['availabilityStatus'],
    publicationYear,
  }
}

export function parseThesisAuditBody(body: unknown) {
  const value = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const conditionState = typeof value.condition_state === 'string' ? value.condition_state.trim().toLowerCase() : ''
  if (!CONDITIONS.has(conditionState as ThesisCondition)) {
    throw new HttpError(422, 'THESIS_INVENTORY_VALIDATION_FAILED', 'condition_state is not supported.', {
      errors: { condition_state: 'Select good, fair, for_repair, damaged, or lost.' },
    })
  }
  return { barcode: normalizeBarcode(value.barcode), conditionState: conditionState as ThesisCondition }
}

export function parseThesisAvailabilityBody(body: unknown) {
  const value = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const availabilityStatus = typeof value.availability_status === 'string' ? value.availability_status.trim().toLowerCase() : ''
  if (availabilityStatus !== 'available' && availabilityStatus !== 'unavailable') {
    throw new HttpError(422, 'THESIS_INVENTORY_VALIDATION_FAILED', 'availability_status must be available or unavailable.', {
      errors: { availability_status: 'Select available or unavailable.' },
    })
  }
  return { barcode: normalizeBarcode(value.barcode), availabilityStatus: availabilityStatus as ThesisAvailability }
}

export function validateThesisAudit(request: Request, response: Response, next: NextFunction) {
  try { response.locals.thesisAuditMutation = parseThesisAuditBody(request.body); next() }
  catch (error) { next(error) }
}

export function validateThesisAvailability(request: Request, response: Response, next: NextFunction) {
  try { response.locals.thesisAvailabilityMutation = parseThesisAvailabilityBody(request.body); next() }
  catch (error) { next(error) }
}
