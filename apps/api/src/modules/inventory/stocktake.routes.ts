import { Router, type NextFunction, type Request, type Response } from 'express'
import { requireCatalogManager } from '../catalog/catalog.rbac.ts'
import {
  createSession, downloadDiscrepanciesCsv, downloadDiscrepanciesPdf, getDiscrepancies,
  getExpected, getScopeOptions, getScopePreview, getScans, getSession, listSessions,
  postCancel, postClose, postResolve, postReview, postScan,
} from './stocktake.controller.ts'
import {
  validateCancelStocktake, validateCreateStocktake, validateResolveStocktake, validateScanStocktake,
} from './stocktake.validation.ts'

export const stocktakeRouter = Router()

const STAFF_STOCKTAKE_ROLES = new Set(['Librarian', 'Library Staff', 'Staff'])

// Spec Q1: Librarian and Staff run counts; resolve/dismiss/review stay Librarian-only.
function requireStocktakeStaff(request: Request, response: Response, next: NextFunction) {
  const role = (request.session as typeof request.session & { user?: { role?: string } })?.user?.role
    ?? (response.locals.authenticatedUser as { role?: string } | undefined)?.role
  if (!role || !STAFF_STOCKTAKE_ROLES.has(role)) {
    return response.status(403).json({
      success: false,
      code: 'CATALOG_ADMIN_FORBIDDEN',
      message: 'Only Librarian or Library Staff accounts may run stocktakes.',
    })
  }
  return next()
}
stocktakeRouter.use(requireStocktakeStaff)

stocktakeRouter.get('/scope-options', getScopeOptions)
stocktakeRouter.get('/scope-preview', getScopePreview)
stocktakeRouter.get('/', listSessions)
stocktakeRouter.post('/', validateCreateStocktake, createSession)
stocktakeRouter.get('/:id', getSession)
stocktakeRouter.get('/:id/expected', getExpected)
stocktakeRouter.get('/:id/scans', getScans)
stocktakeRouter.get('/:id/discrepancies', getDiscrepancies)
stocktakeRouter.get('/:id/discrepancies.csv', downloadDiscrepanciesCsv)
stocktakeRouter.get('/:id/discrepancies.pdf', downloadDiscrepanciesPdf)
stocktakeRouter.post('/:id/scans', validateScanStocktake, postScan)
stocktakeRouter.post('/:id/close', postClose)
stocktakeRouter.post('/:id/cancel', validateCancelStocktake, postCancel)
stocktakeRouter.post('/:id/review', requireCatalogManager, postReview)
stocktakeRouter.post('/:id/discrepancies/:discrepancyId/resolve', requireCatalogManager, validateResolveStocktake, postResolve)
