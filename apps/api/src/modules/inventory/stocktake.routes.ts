import { Router } from 'express'
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
stocktakeRouter.use(requireCatalogManager)

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
stocktakeRouter.post('/:id/review', postReview)
stocktakeRouter.post('/:id/discrepancies/:discrepancyId/resolve', validateResolveStocktake, postResolve)
