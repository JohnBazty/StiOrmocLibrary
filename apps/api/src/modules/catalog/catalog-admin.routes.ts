import { Router, type NextFunction, type Request, type Response } from 'express'
import { requireJwtRoles } from '../auth/jwt-auth.middleware.ts'
import { catalogController } from './catalog.controller.ts'
import { bookArchive } from './book-archive.ts'
import { bookQuotationController, quotationUpload } from './book-quotation.ts'
import { parseRegisterQuery, readRegister, registerCsv } from './book-register.ts'
import type { Pool } from '../../config/db.js'
import { db } from '../../config/db.js'

type Controller = Pick<typeof catalogController, 'changeTitleCategory'>

export function createCatalogAdminRouter(controller: Controller = catalogController, database: Pool = db) {
  const router = Router()
  const get = (fn: (request: Request) => Promise<unknown>) => (request: Request, response: Response, next: NextFunction) => {
    void fn(request).then(data => response.json({ success: true, data })).catch(next)
  }
  router.get('/archive', requireJwtRoles('Librarian'), get(request => bookArchive.list(request.query.q)))
  router.get('/archive/deleted-snapshots', requireJwtRoles('Librarian'), get(request => bookArchive.deletedSnapshots(request.query.q)))
  router.get('/archive/:titleId', requireJwtRoles('Librarian'), get(request => bookArchive.detail(request.params.titleId)))
  router.get('/register', requireJwtRoles('Librarian'), get(request => readRegister(database, parseRegisterQuery(request.query))))
  router.get('/register.csv', requireJwtRoles('Librarian'), (request: Request, response: Response, next: NextFunction) => {
    void registerCsv(database, parseRegisterQuery(request.query)).then((csv) => {
      response.setHeader('Content-Type', 'text/csv; charset=utf-8')
      response.setHeader('Content-Disposition', 'attachment; filename="book-register.csv"')
      response.setHeader('Cache-Control', 'no-store')
      response.send(csv)
    }).catch(next)
  })
  router.patch('/titles/:titleId/category', requireJwtRoles('Librarian'), controller.changeTitleCategory)
  router.get('/titles/:titleId/quotations', requireJwtRoles('Librarian'), bookQuotationController.list)
  router.post('/titles/:titleId/quotations', requireJwtRoles('Librarian'), quotationUpload, bookQuotationController.upload)
  router.get('/titles/:titleId/quotations/:quotationId/file', requireJwtRoles('Librarian'), bookQuotationController.download)
  return router
}

export const catalogAdminRouter = createCatalogAdminRouter()
