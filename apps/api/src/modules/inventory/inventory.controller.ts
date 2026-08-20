import type { NextFunction, Request, Response } from 'express'
import { parseCatalogSearchFilters } from '../catalog/catalog-search.repository.ts'
import { createCsvStream, createInventoryPdf, inventoryRows } from '../reports/catalog-export.service.ts'
import { inventoryCopies, inventorySummary, overrideInventoryCondition, verifyInventoryBarcode } from './inventory.service.ts'
import { parseConditionBody, parseInventoryListFilters, parseScanBody } from './inventory.validation.ts'

function actor(request: Request, response: Response) {
  const authenticated = response.locals.authenticatedUser as { userId?: number; id?: number; fullName?: string; email?: string } | undefined
  const sessionUser = request.session?.user as { id?: number; fullName?: string; email?: string } | undefined
  const rawId = authenticated?.userId ?? authenticated?.id ?? sessionUser?.id
  const userId = Number.isSafeInteger(Number(rawId)) && Number(rawId) > 0 ? Number(rawId) : null
  return {
    userId,
    label: authenticated?.fullName ?? authenticated?.email ?? sessionUser?.fullName ?? sessionUser?.email ?? 'admin_authenticated',
  }
}

export async function getSummary(_request: Request, response: Response, next: NextFunction) {
  try { response.json({ success: true, data: await inventorySummary() }) }
  catch (error) { next(error) }
}

export async function getCopies(request: Request, response: Response, next: NextFunction) {
  try {
    const result = await inventoryCopies(parseInventoryListFilters(request.query as Record<string, unknown>))
    response.json({ success: true, data: result.items, meta: { pagination: result.pagination } })
  } catch (error) { next(error) }
}

export async function scanBarcode(request: Request, response: Response, next: NextFunction) {
  try {
    const { barcode } = parseScanBody(request.body)
    response.json({ success: true, message: 'Physical copy verified successfully.', data: await verifyInventoryBarcode(barcode, actor(request, response)) })
  } catch (error) { next(error) }
}

export async function changeCondition(request: Request, response: Response, next: NextFunction) {
  try {
    const { barcode, conditionState } = parseConditionBody(request.body)
    response.json({
      success: true,
      message: 'Condition updated. This copy is unavailable and blocked from student reservations.',
      data: await overrideInventoryCondition(barcode, conditionState, actor(request, response)),
    })
  } catch (error) { next(error) }
}

function exportFilters(request: Request) {
  return { ...parseCatalogSearchFilters(request.query as Record<string, unknown>), scope: 'books' as const }
}

export function exportCsv(request: Request, response: Response, next: NextFunction) {
  try {
    response.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="smartlib-physical-inventory.csv"',
      'Cache-Control': 'private, no-store',
    })
    createCsvStream(inventoryRows(exportFilters(request))).on('error', next).pipe(response)
  } catch (error) { next(error) }
}

export function exportPdf(request: Request, response: Response, next: NextFunction) {
  try {
    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="smartlib-physical-inventory.pdf"',
      'Cache-Control': 'private, no-store',
    })
    createInventoryPdf(inventoryRows(exportFilters(request))).on('error', next).pipe(response)
  } catch (error) { next(error) }
}
