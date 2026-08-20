import { Router } from 'express'
import { catalogController } from './catalog.controller.ts'
import { requireCatalogManager } from './catalog.rbac.ts'

export const catalogRouter = Router()

catalogRouter.get('/search', catalogController.search)
catalogRouter.get('/admin/categories', requireCatalogManager, catalogController.categories)
catalogRouter.get('/admin/copies', requireCatalogManager, catalogController.copies)
catalogRouter.post('/registry/parse', requireCatalogManager, catalogController.parseRegistry)

catalogRouter.post('/books', requireCatalogManager, catalogController.createBook)
catalogRouter.put('/books/:titleId', requireCatalogManager, catalogController.updateBook)
catalogRouter.post('/books/:titleId/archive', requireCatalogManager, catalogController.archiveBook)
catalogRouter.delete('/books/:titleId', requireCatalogManager, catalogController.deleteBook)

catalogRouter.post('/research', requireCatalogManager, catalogController.createThesis)
catalogRouter.put('/research/:titleId', requireCatalogManager, catalogController.updateThesis)
catalogRouter.post('/research/:titleId/archive', requireCatalogManager, catalogController.archiveThesis)
catalogRouter.delete('/research/:titleId', requireCatalogManager, catalogController.deleteThesis)
