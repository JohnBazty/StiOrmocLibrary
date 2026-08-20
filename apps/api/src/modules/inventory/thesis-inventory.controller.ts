import type { NextFunction, Request, Response } from 'express'
import { createThesisCsvStream, createThesisInventoryPdf, thesisReportRows } from '../reports/thesis-inventory-export.service.ts'
import { auditThesisCondition, setThesisAvailability, thesisInventoryRows, thesisInventorySummary } from './thesis-inventory.service.ts'
import { parseThesisInventoryFilters, type ThesisAvailability, type ThesisCondition } from './thesis-inventory.validation.ts'

function actor(request: Request, response: Response) {
  const authenticated = response.locals.authenticatedUser as { id?: number; userId?: number; fullName?: string; schoolId?: string } | undefined
  const sessionUser = request.session?.user as { id?: number; fullName?: string; email?: string } | undefined
  const rawId = authenticated?.id ?? authenticated?.userId ?? sessionUser?.id
  return {
    userId: Number.isSafeInteger(Number(rawId)) && Number(rawId) > 0 ? Number(rawId) : null,
    label: authenticated?.fullName ?? authenticated?.schoolId ?? sessionUser?.fullName ?? sessionUser?.email ?? 'admin_authenticated',
  }
}

export async function getThesisSummary(_request: Request, response: Response, next: NextFunction) {
  try { response.json({ success: true, data: await thesisInventorySummary() }) }
  catch (error) { next(error) }
}

export async function getThesisRows(request: Request, response: Response, next: NextFunction) {
  try {
    const result = await thesisInventoryRows(parseThesisInventoryFilters(request.query as Record<string, unknown>))
    response.json({ success: true, data: result.items, meta: { pagination: result.pagination } })
  } catch (error) { next(error) }
}

export async function auditThesis(request: Request, response: Response, next: NextFunction) {
  try {
    const { barcode, conditionState } = response.locals.thesisAuditMutation as { barcode: string; conditionState: ThesisCondition }
    response.json({
      success: true,
      message: conditionState === 'lost'
        ? 'Thesis marked lost and forced unavailable.'
        : 'Thesis condition updated without changing availability.',
      data: await auditThesisCondition(barcode, conditionState, actor(request, response)),
    })
  } catch (error) { next(error) }
}

export async function changeThesisAvailability(request: Request, response: Response, next: NextFunction) {
  try {
    const { barcode, availabilityStatus } = response.locals.thesisAvailabilityMutation as { barcode: string; availabilityStatus: ThesisAvailability }
    response.json({
      success: true,
      message: `Thesis availability updated to ${availabilityStatus}.`,
      data: await setThesisAvailability(barcode, availabilityStatus, actor(request, response)),
    })
  } catch (error) { next(error) }
}

export function exportThesisCsv(_request: Request, response: Response, next: NextFunction) {
  try {
    response.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="smartlib-thesis-inventory.csv"',
      'Cache-Control': 'private, no-store',
    })
    createThesisCsvStream(thesisReportRows()).on('error', next).pipe(response)
  } catch (error) { next(error) }
}

export function exportThesisPdf(_request: Request, response: Response, next: NextFunction) {
  try {
    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="smartlib-thesis-inventory.pdf"',
      'Cache-Control': 'private, no-store',
    })
    createThesisInventoryPdf(thesisReportRows()).on('error', next).pipe(response)
  } catch (error) { next(error) }
}
