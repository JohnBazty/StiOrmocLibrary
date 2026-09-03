import { Router } from 'express'
import { bookCatalogController, createBookCatalogController } from './book-catalog.controller.ts'
import { assetCodeController, createAssetCodeController } from './asset-code.controller.ts'

type Controller = ReturnType<typeof createBookCatalogController>
type AssetController = ReturnType<typeof createAssetCodeController>

export function createBookCatalogRouter(controller: Controller = bookCatalogController, assets: AssetController = assetCodeController) {
  const router = Router()
  router.get('/categories', controller.categories)
  router.get('/books', controller.list)
  router.get('/copies/:barcode', assets.catalogAsset)
  router.post('/books/:titleId/reservations', controller.reserve)
  router.get('/books/:titleId', controller.overview)
  return router
}

export const bookCatalogRouter = createBookCatalogRouter()
