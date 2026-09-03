import type { NextFunction, Request, Response } from 'express'
import { createThesisCsvStream, createThesisInventoryPdf, thesisReportRows } from '../reports/thesis-inventory-export.service.ts'
import {
  archiveThesisInventory, auditThesisCondition, deleteThesisInventory, setThesisAvailability,
  thesisInventoryRows, thesisInventorySummary,
} from './thesis-inventory.service.ts'
import { parseThesisInventoryFilters, type ThesisAvailability, type ThesisCondition } from './thesis-inventory.validation.ts'
import { inventoryActor } from './inventory-actor.ts'

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
      data: await auditThesisCondition(barcode, conditionState, inventoryActor(request, response)),
    })
  } catch (error) { next(error) }
}

export async function changeThesisAvailability(request: Request, response: Response, next: NextFunction) {
  try {
    const { barcode, availabilityStatus } = response.locals.thesisAvailabilityMutation as { barcode: string; availabilityStatus: ThesisAvailability }
    response.json({
      success: true,
      message: `Thesis availability updated to ${availabilityStatus}.`,
      data: await setThesisAvailability(barcode, availabilityStatus, inventoryActor(request, response)),
    })
  } catch (error) { next(error) }
}

export async function archiveThesis(request: Request, response: Response, next: NextFunction) {
  try {
    response.json({
      success: true,
      message: 'Research/thesis inventory copy archived successfully.',
      data: await archiveThesisInventory(
        request.params.researchInventoryId,
        request.body?.reason,
        inventoryActor(request, response),
      ),
    })
  } catch (error) { next(error) }
}

export async function deleteThesis(request: Request, response: Response, next: NextFunction) {
  try {
    response.json({
      success: true,
      message: 'Research/thesis inventory copy deleted successfully.',
      data: await deleteThesisInventory(request.params.researchInventoryId, inventoryActor(request, response)),
    })
  } catch (error) { next(error) }
}

export function exportThesisCsv(_request: Request, response: Response, next: NextFunction) {
  try {
    response.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="smartlib-thesis-inventory.csv"',
      'Cache-Control': 'private, no-store',
      'X-SmartLib-CSV-Integrity': 'HMAC-SHA256; version=v1',
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
