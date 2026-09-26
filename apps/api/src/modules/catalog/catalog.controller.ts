import type { NextFunction, Request, Response } from 'express'
import { db } from '../../config/db.js'
import { catalogManagementService } from './catalog-management.service.ts'
import { parseCatalogSearchFilters, searchCatalog } from './catalog-search.repository.ts'
import { catalogService } from './catalog.service.ts'
import { visibleThesisInventoryRows } from '../inventory/thesis-inventory.service.ts'
import { parseThesisInventoryFilters } from '../inventory/thesis-inventory.validation.ts'

function asyncController(handler: (request: Request, response: Response) => Promise<unknown>) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      await handler(request, response)
    } catch (error) {
      next(error)
    }
  }
}

function actorAccountId(response: Response) {
  const value = Number((response.locals.authenticatedUser as { accountId?: number; id?: number } | undefined)?.accountId
    ?? (response.locals.authenticatedUser as { id?: number } | undefined)?.id)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

export const catalogController = {
  search: asyncController(async (request, response) => {
    const filters = parseCatalogSearchFilters(request.query as Record<string, unknown>)
    response.json({ success: true, data: await searchCatalog(db, filters), filters })
  }),
  visibleResearchInventory: asyncController(async (request, response) => {
    const filters = parseThesisInventoryFilters(request.query as Record<string, unknown>)
    response.json({ success: true, data: await visibleThesisInventoryRows(filters) })
  }),
  categories: asyncController(async (_request, response) => {
    response.json({ success: true, data: await catalogManagementService.categories() })
  }),
  copies: asyncController(async (request, response) => {
    const limit = Number(request.query.limit ?? 100)
    response.json({ success: true, data: await catalogManagementService.physicalCopies(Number.isFinite(limit) ? limit : 100) })
  }),
  parseRegistry: asyncController(async (request, response) => {
    response.json({ success: true, data: await catalogManagementService.parseRegistry(request.body) })
  }),
  changeTitleCategory: asyncController(async (request, response) => {
    response.json({
      success: true,
      message: 'Title, active inventory, and shelf assignment updated successfully.',
      data: await catalogManagementService.changeTitleCategory(request.params.titleId, request.body, actorAccountId(response)),
    })
  }),
  createBook: asyncController(async (request, response) => {
    const result = await catalogService.createBookEntry(request.body)
    response.status(201).json({
      success: true,
      message: result.addedCopyToExistingTitle ? 'Physical copy added to the existing book title.' : 'Book title and physical copy created successfully.',
      data: result,
    })
  }),
  updateBook: asyncController(async (request, response) => {
    response.json({ success: true, message: 'Book details updated successfully.', data: await catalogManagementService.updateBook(request.params.titleId, request.body) })
  }),
  archiveBook: asyncController(async (request, response) => {
    response.json({ success: true, message: 'Book archived successfully.', data: await catalogManagementService.archiveTitle(request.params.titleId, 'Book', request.body?.reason, actorAccountId(response)) })
  }),
  deleteBook: asyncController(async (request, response) => {
    response.json({ success: true, message: 'Book deleted successfully.', data: await catalogManagementService.deleteTitle(request.params.titleId, 'Book') })
  }),
  createThesis: asyncController(async (request, response) => {
    response.status(201).json({ success: true, message: 'Research/thesis entry created successfully.', data: await catalogService.createThesisEntry(request.body) })
  }),
  updateThesis: asyncController(async (request, response) => {
    response.json({ success: true, message: 'Research/thesis metadata updated successfully.', data: await catalogManagementService.updateThesis(request.params.titleId, request.body) })
  }),
  archiveThesis: asyncController(async (request, response) => {
    response.json({ success: true, message: 'Research/thesis record archived successfully.', data: await catalogManagementService.archiveTitle(request.params.titleId, 'Research/Thesis', request.body?.reason, actorAccountId(response)) })
  }),
  deleteThesis: asyncController(async (request, response) => {
    response.json({ success: true, message: 'Research/thesis record deleted successfully.', data: await catalogManagementService.deleteTitle(request.params.titleId, 'Research/Thesis') })
  }),
}
