import { Router, type Request, type Response } from 'express'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
import { bulkBookController, createBulkBookController } from './bulk-book.controller.ts'
import { assetCodeController, createAssetCodeController } from './asset-code.controller.ts'
import { createIsbnLookupController, isbnLookupController } from './isbn-lookup.controller.ts'

type Controller = ReturnType<typeof createBulkBookController>
type AssetController = ReturnType<typeof createAssetCodeController>
type IsbnController = ReturnType<typeof createIsbnLookupController>

/** Outside book lookups share one per-account budget so a stuck scanner cannot use up the providers' quota. */
export const LOOKUPS_PER_MINUTE = 30
const lookupLimiter = () => rateLimit({
  windowMs: 60_000, limit: LOOKUPS_PER_MINUTE, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (request: Request, response: Response) => {
    const accountId = (response.locals.authenticatedUser as { accountId?: number } | undefined)?.accountId
    return accountId ? `account:${accountId}` : ipKeyGenerator(request.ip ?? '')
  },
  message: { success: false, code: 'LOOKUP_RATE_LIMITED', message: 'Too many book lookups. Wait a minute and try again.' },
})

export function createBulkBookRouter(controller: Controller = bulkBookController, assets: AssetController = assetCodeController, isbn: IsbnController = isbnLookupController) {
  const router = Router()
  const lookups = lookupLimiter()
  router.get('/isbn/:isbn', lookups, isbn.lookup)
  router.get('/title-lookup', lookups, isbn.searchTitles)
  router.post('/add-bulk', controller.addBulk)
  router.get('/assets/:id', assets.adminAsset)
  router.get('/assets/:id/barcode.png', assets.barcodePng)
  router.get('/assets/:id/qr.png', assets.qrPng)
  return router
}

export const bulkBookRouter = createBulkBookRouter()

export function createBulkCatalogEntryRouter(controller: Controller = bulkBookController) {
  const router = Router()
  router.post('/bulk-entry', controller.addBulk)
  return router
}

export const bulkCatalogEntryRouter = createBulkCatalogEntryRouter()
