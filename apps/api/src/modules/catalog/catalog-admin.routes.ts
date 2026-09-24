import { Router } from 'express'
import { requireJwtRoles } from '../auth/jwt-auth.middleware.ts'
import { catalogController } from './catalog.controller.ts'

type Controller = Pick<typeof catalogController, 'changeTitleCategory'>

export function createCatalogAdminRouter(controller: Controller = catalogController) {
  const router = Router()
  router.patch('/titles/:titleId/category', requireJwtRoles('Admin'), controller.changeTitleCategory)
  return router
}

export const catalogAdminRouter = createCatalogAdminRouter()
