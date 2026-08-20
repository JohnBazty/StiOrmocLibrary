import type { NextFunction, Request, Response } from 'express'
import { parseCatalogSearchFilters } from '../catalog/catalog-search.repository.ts'
import { createCsvStream, createInventoryPdf, inventoryRows } from '../reports/catalog-export.service.ts'
import { inventoryCopies, inventorySummary, overrideInventoryCondition, setInventoryAvailability, verifyInventoryBarcode } from './inventory.service.ts'
import { parseInventoryListFilters, parseScanBody, type InventoryCondition, type ManualAvailability } from './inventory.validation.ts'

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
    const { barcode, conditionState } = response.locals.inventoryConditionMutation as { barcode: string; conditionState: InventoryCondition }
    const lost = conditionState === 'Lost'
    response.json({
      success: true,
      message: lost
        ? 'Condition updated to Lost. Availability was forced to Unavailable and the copy was removed from reservation allocation.'
        : 'Condition updated. Availability was preserved and remains under librarian control.',
      data: await overrideInventoryCondition(barcode, conditionState, actor(request, response)),
    })
  } catch (error) { next(error) }
}

export async function changeAvailability(request: Request, response: Response, next: NextFunction) {
  try {
    const { barcode, availabilityStatus } = response.locals.inventoryAvailabilityMutation as {
      barcode: string
      availabilityStatus: ManualAvailability
    }
    response.json({
      success: true,
      message: `Availability updated to ${availabilityStatus}.`,
      data: await setInventoryAvailability(barcode, availabilityStatus, actor(request, response)),
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
