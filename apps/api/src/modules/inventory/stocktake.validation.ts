import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../../core/http-error.ts'
import { normalizeBarcode } from './inventory.validation.ts'

export type StocktakeScopeKind = 'shelf' | 'category' | 'room' | 'collection'
export type StocktakeAssetKind = 'book' | 'research' | 'both'
export type StocktakeScanSource = 'scanner' | 'manual'
export type StocktakeResolveAction = 'dismiss' | 'confirm_found_at_home' | 'apply_condition' | 'apply_availability'

const SCOPE_KINDS = new Set<StocktakeScopeKind>(['shelf', 'category', 'room', 'collection'])
const ASSET_KINDS = new Set<StocktakeAssetKind>(['book', 'research', 'both'])
const SCAN_SOURCES = new Set<StocktakeScanSource>(['scanner', 'manual'])
const RESOLVE_ACTIONS = new Set<StocktakeResolveAction>([
  'dismiss', 'confirm_found_at_home', 'apply_condition', 'apply_availability',
])
const SESSION_STATUSES = new Set(['in_progress', 'closed', 'reviewed', 'cancelled'])

function first(value: unknown) {
  if (Array.isArray(value)) return String(value[0] ?? '')
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return ''
}

function positiveInteger(value: unknown, field: string, required = true) {
  const raw = first(value).trim()
  if (!raw) {
    if (!required) return null
    throw new HttpError(422, 'STOCKTAKE_VALIDATION_FAILED', `${field} is required.`, {
      errors: { [field]: `${field} is required.` },
    })
  }
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new HttpError(422, 'STOCKTAKE_VALIDATION_FAILED', `${field} must be a positive integer.`, {
      errors: { [field]: `${field} must be a positive integer.` },
    })
  }
  return parsed
}

function pageLimit(query: Request['query']) {
  const page = positiveInteger(query.page, 'page', false) ?? 1
  const limitRaw = positiveInteger(query.limit, 'limit', false) ?? 25
  const limit = Math.min(limitRaw, 100)
  return { page, limit }
}

function requiredText(value: unknown, field: string, max: number) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) {
    throw new HttpError(422, 'STOCKTAKE_VALIDATION_FAILED', `${field} is required.`, {
      errors: { [field]: `${field} is required.` },
    })
  }
  if (text.length > max) {
    throw new HttpError(422, 'STOCKTAKE_VALIDATION_FAILED', `${field} must be at most ${max} characters.`, {
      errors: { [field]: `${field} must be at most ${max} characters.` },
    })
  }
  return text
}

export function parseCreateStocktakeBody(body: unknown) {
  const input = (body ?? {}) as Record<string, unknown>
  const name = requiredText(input.name, 'name', 200)
  const scopeKind = String(input.scopeKind ?? '').trim() as StocktakeScopeKind
  if (!SCOPE_KINDS.has(scopeKind)) {
    throw new HttpError(422, 'STOCKTAKE_VALIDATION_FAILED', 'scopeKind must be shelf, category, room, or collection.', {
      errors: { scopeKind: 'Choose shelf, category, room, or collection.' },
    })
  }
  const assetKind = String(input.assetKind ?? '').trim() as StocktakeAssetKind
  if (!ASSET_KINDS.has(assetKind)) {
    throw new HttpError(422, 'STOCKTAKE_VALIDATION_FAILED', 'assetKind must be book, research, or both.', {
      errors: { assetKind: 'Choose book, research, or both.' },
    })
  }
  const scopeIdRaw = first(input.scopeId).trim()
  if (scopeKind !== 'collection' && !scopeIdRaw) {
    throw new HttpError(422, 'STOCKTAKE_VALIDATION_FAILED', 'scopeId is required for this scope.', {
      errors: { scopeId: 'Provide a shelf, category, or room identifier.' },
    })
  }
  return {
    name,
    scopeKind,
    scopeId: scopeKind === 'collection' ? null : scopeIdRaw,
    assetKind,
  }
}

export function parseScopePreviewQuery(query: Request['query']) {
  return parseCreateStocktakeBody({
    name: 'preview',
    scopeKind: query.scopeKind,
    scopeId: query.scopeId,
    assetKind: query.assetKind,
  })
}

export function parseStocktakeListQuery(query: Request['query']) {
  const { page, limit } = pageLimit(query)
  const status = first(query.status).trim()
  if (status && !SESSION_STATUSES.has(status)) {
    throw new HttpError(422, 'STOCKTAKE_VALIDATION_FAILED', 'Invalid status filter.', {
      errors: { status: 'Use in_progress, closed, reviewed, or cancelled.' },
    })
  }
  return {
    page,
    limit,
    status: status || null,
    scopeKind: first(query.scopeKind).trim() || null,
    query: first(query.q).trim() || null,
  }
}

export function parsePagedQuery(query: Request['query']) {
  const { page, limit } = pageLimit(query)
  return {
    page,
    limit,
    query: first(query.q).trim() || null,
    status: first(query.status).trim() || null,
    findingCode: first(query.findingCode).trim() || null,
    assetKind: first(query.assetKind).trim() || null,
  }
}

export function parseScanBody(body: unknown) {
  const input = (body ?? {}) as Record<string, unknown>
  const requestKey = requiredText(input.requestKey, 'requestKey', 100)
  const barcode = normalizeBarcode(input.barcode)
  const observedShelfId = positiveInteger(input.observedShelfId, 'observedShelfId')!
  const source = String(input.source ?? 'scanner').trim() as StocktakeScanSource
  if (!SCAN_SOURCES.has(source)) {
    throw new HttpError(422, 'STOCKTAKE_VALIDATION_FAILED', 'source must be scanner or manual.', {
      errors: { source: 'Use scanner or manual.' },
    })
  }
  const observedColumn = positiveInteger(input.observedColumn, 'observedColumn', false)
  const observedRow = positiveInteger(input.observedRow, 'observedRow', false)
  return { requestKey, barcode, observedShelfId, observedColumn, observedRow, source }
}

export function parseCancelBody(body: unknown) {
  return { reason: requiredText((body as { reason?: unknown } | null)?.reason, 'reason', 500) }
}

export function parseResolveBody(body: unknown) {
  const input = (body ?? {}) as Record<string, unknown>
  const expectedRowVersion = positiveInteger(input.expectedRowVersion, 'expectedRowVersion')!
  const action = String(input.action ?? '').trim() as StocktakeResolveAction
  if (!RESOLVE_ACTIONS.has(action)) {
    throw new HttpError(422, 'STOCKTAKE_VALIDATION_FAILED', 'Unsupported resolution action.', {
      errors: { action: 'Use dismiss, confirm_found_at_home, apply_condition, or apply_availability.' },
    })
  }
  const reason = requiredText(input.reason, 'reason', 500)
  return {
    expectedRowVersion,
    action,
    reason,
    condition: typeof input.condition === 'string' ? input.condition.trim() : null,
    availability: typeof input.availability === 'string' ? input.availability.trim() : null,
  }
}

export function validateCreateStocktake(request: Request, response: Response, next: NextFunction) {
  try {
    response.locals.stocktakeCreate = parseCreateStocktakeBody(request.body)
    return next()
  } catch (error) { return next(error) }
}

export function validateScanStocktake(request: Request, response: Response, next: NextFunction) {
  try {
    response.locals.stocktakeScan = parseScanBody(request.body)
    return next()
  } catch (error) { return next(error) }
}

export function validateResolveStocktake(request: Request, response: Response, next: NextFunction) {
  try {
    response.locals.stocktakeResolve = parseResolveBody(request.body)
    return next()
  } catch (error) { return next(error) }
}

export function validateCancelStocktake(request: Request, response: Response, next: NextFunction) {
  try {
    response.locals.stocktakeCancel = parseCancelBody(request.body)
    return next()
  } catch (error) { return next(error) }
}

export function sessionIdParam(value: unknown) {
  return positiveInteger(value, 'id')!
}

export function discrepancyIdParam(value: unknown) {
  return positiveInteger(value, 'discrepancyId')!
}
