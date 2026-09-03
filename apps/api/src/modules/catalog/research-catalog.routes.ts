import { Router } from 'express'
import { createResearchCatalogController, researchCatalogController } from './research-catalog.controller.ts'

type Controller = ReturnType<typeof createResearchCatalogController>
export function createResearchCatalogRouter(controller: Controller = researchCatalogController) {
  const router = Router()
  router.get('/research', controller.list)
  router.get('/research/:id', controller.overview)
  return router
}

export const researchCatalogRouter = createResearchCatalogRouter()
