import { Router } from 'express'
import { bulkBookController, createBulkBookController } from './bulk-book.controller.ts'
import { assetCodeController, createAssetCodeController } from './asset-code.controller.ts'
import { createIsbnLookupController, isbnLookupController } from './isbn-lookup.controller.ts'

type Controller = ReturnType<typeof createBulkBookController>
type AssetController = ReturnType<typeof createAssetCodeController>
type IsbnController = ReturnType<typeof createIsbnLookupController>

export function createBulkBookRouter(controller: Controller = bulkBookController, assets: AssetController = assetCodeController, isbn: IsbnController = isbnLookupController) {
  const router = Router()
  router.get('/isbn/:isbn', isbn.lookup)
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
