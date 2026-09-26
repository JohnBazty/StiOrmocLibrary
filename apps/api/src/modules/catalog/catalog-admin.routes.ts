import { Router, type NextFunction, type Request, type Response } from 'express'
import { requireJwtRoles } from '../auth/jwt-auth.middleware.ts'
import { catalogController } from './catalog.controller.ts'
import { bookArchive } from './book-archive.ts'

type Controller = Pick<typeof catalogController, 'changeTitleCategory'>

export function createCatalogAdminRouter(controller: Controller = catalogController) {
  const router = Router()
  const get = (fn: (request: Request) => Promise<unknown>) => (request: Request, response: Response, next: NextFunction) => {
    void fn(request).then(data => response.json({ success: true, data })).catch(next)
  }
  router.get('/archive', requireJwtRoles('Admin'), get(request => bookArchive.list(request.query.q)))
  router.get('/archive/deleted-snapshots', requireJwtRoles('Admin'), get(request => bookArchive.deletedSnapshots(request.query.q)))
  router.get('/archive/:titleId', requireJwtRoles('Admin'), get(request => bookArchive.detail(request.params.titleId)))
  router.patch('/titles/:titleId/category', requireJwtRoles('Admin'), controller.changeTitleCategory)
  return router
}

export const catalogAdminRouter = createCatalogAdminRouter()
