import type { NextFunction, Request, Response } from 'express'
import { ok } from '../../core/http.ts'
import { inventoryActor } from './inventory-actor.ts'
import {
  cancelStocktakeSession, closeStocktakeSession, createStocktakeSession,
  listStocktakeScopeOptions, previewStocktakeScope, recordStocktakeScan,
  resolveStocktakeDiscrepancy, reviewStocktakeSession, stocktakeDiscrepancies,
  stocktakeExpected, stocktakeScans, stocktakeSessionDetail, stocktakeSessions,
} from './stocktake.service.ts'
import {
  discrepancyIdParam, parsePagedQuery, parseScopePreviewQuery, parseStocktakeListQuery,
  sessionIdParam,
} from './stocktake.validation.ts'
import { exportStocktakeDiscrepanciesCsv, exportStocktakeDiscrepanciesPdf } from './stocktake-export.service.ts'

export async function getScopeOptions(_request: Request, response: Response, next: NextFunction) {
  try { return ok(response, await listStocktakeScopeOptions()) } catch (error) { return next(error) }
}

export async function getScopePreview(request: Request, response: Response, next: NextFunction) {
  try {
    return ok(response, await previewStocktakeScope(parseScopePreviewQuery(request.query)))
  } catch (error) { return next(error) }
}

export async function listSessions(request: Request, response: Response, next: NextFunction) {
  try { return ok(response, await stocktakeSessions(parseStocktakeListQuery(request.query))) }
  catch (error) { return next(error) }
}

export async function createSession(request: Request, response: Response, next: NextFunction) {
  try {
    const input = response.locals.stocktakeCreate as {
      name: string; scopeKind: 'shelf' | 'category' | 'room' | 'collection'; scopeId: string | null; assetKind: 'book' | 'research' | 'both'
    }
    const data = await createStocktakeSession(input, inventoryActor(request, response))
    return response.status(201).json({ success: true, message: 'Stocktake session started.', data })
  } catch (error) { return next(error) }
}

export async function getSession(request: Request, response: Response, next: NextFunction) {
  try { return ok(response, await stocktakeSessionDetail(sessionIdParam(request.params.id))) }
  catch (error) { return next(error) }
}

export async function getExpected(request: Request, response: Response, next: NextFunction) {
  try {
    return ok(response, await stocktakeExpected(sessionIdParam(request.params.id), parsePagedQuery(request.query)))
  } catch (error) { return next(error) }
}

export async function getScans(request: Request, response: Response, next: NextFunction) {
  try {
    return ok(response, await stocktakeScans(sessionIdParam(request.params.id), parsePagedQuery(request.query)))
  } catch (error) { return next(error) }
}

export async function getDiscrepancies(request: Request, response: Response, next: NextFunction) {
  try {
    return ok(response, await stocktakeDiscrepancies(sessionIdParam(request.params.id), parsePagedQuery(request.query)))
  } catch (error) { return next(error) }
}

export async function postScan(request: Request, response: Response, next: NextFunction) {
  try {
    const input = response.locals.stocktakeScan as {
      requestKey: string; barcode: string; observedShelfId: number
      observedColumn: number | null; observedRow: number | null; source: string
    }
    const data = await recordStocktakeScan(sessionIdParam(request.params.id), input, inventoryActor(request, response))
    return response.status(201).json({ success: true, message: 'Scan recorded.', data })
  } catch (error) { return next(error) }
}

export async function postClose(request: Request, response: Response, next: NextFunction) {
  try {
    return ok(response, await closeStocktakeSession(sessionIdParam(request.params.id), inventoryActor(request, response)))
  } catch (error) { return next(error) }
}

export async function postCancel(request: Request, response: Response, next: NextFunction) {
  try {
    const { reason } = response.locals.stocktakeCancel as { reason: string }
    return ok(response, await cancelStocktakeSession(sessionIdParam(request.params.id), reason, inventoryActor(request, response)))
  } catch (error) { return next(error) }
}

export async function postReview(request: Request, response: Response, next: NextFunction) {
  try {
    return ok(response, await reviewStocktakeSession(sessionIdParam(request.params.id), inventoryActor(request, response)))
  } catch (error) { return next(error) }
}

export async function postResolve(request: Request, response: Response, next: NextFunction) {
  try {
    const input = response.locals.stocktakeResolve as {
      expectedRowVersion: number; action: 'dismiss' | 'confirm_found_at_home' | 'apply_condition' | 'apply_availability'
      reason: string; condition: string | null; availability: string | null
    }
    return ok(response, await resolveStocktakeDiscrepancy(
      sessionIdParam(request.params.id),
      discrepancyIdParam(request.params.discrepancyId),
      input,
      inventoryActor(request, response),
    ))
  } catch (error) { return next(error) }
}

export async function downloadDiscrepanciesCsv(request: Request, response: Response, next: NextFunction) {
  try {
    await exportStocktakeDiscrepanciesCsv(sessionIdParam(request.params.id), parsePagedQuery(request.query), response)
  } catch (error) { return next(error) }
}

export async function downloadDiscrepanciesPdf(request: Request, response: Response, next: NextFunction) {
  try {
    await exportStocktakeDiscrepanciesPdf(sessionIdParam(request.params.id), parsePagedQuery(request.query), response)
  } catch (error) { return next(error) }
}
