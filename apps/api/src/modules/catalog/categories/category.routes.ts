import { Router } from 'express'
import { categoryController, type createCategoryController } from './category.controller.ts'
import { requireCategoryManager } from './category.rbac.ts'
import { floorPlanRepository } from '../../floor-plan/floor-plan.repository.ts'
import { shelfLabel } from '../../floor-plan/floor-plan.validation.ts'

type CategoryController = ReturnType<typeof createCategoryController>

export function createCategoryRouter(controller: CategoryController = categoryController) {
  const router = Router()
  router.get('/', controller.list)
  router.get('/shelves', requireCategoryManager, async (_request, response, next) => {
    try { response.json({ success: true, data: await floorPlanRepository.shelfDirectory() }) } catch (error) { next(error) }
  })
  router.post('/shelves', requireCategoryManager, async (request, response, next) => {
    try {
      const actor = Number(response.locals.authenticatedUser?.accountId ?? response.locals.authenticatedUser?.id)
      response.status(201).json({ success: true, data: await floorPlanRepository.addShelf(Number.isSafeInteger(actor) && actor > 0 ? actor : 0, shelfLabel(request.body?.label)) })
    } catch (error) { next(error) }
  })
  router.post('/', requireCategoryManager, controller.create)
  router.post('/reassign', requireCategoryManager, controller.reassign)
  router.put('/:categoryId', requireCategoryManager, controller.update)
  router.delete('/:categoryId', requireCategoryManager, controller.remove)
  return router
}

export const categoryRouter = createCategoryRouter()

