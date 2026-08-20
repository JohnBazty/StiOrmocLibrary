import { Router } from 'express'
import { categoryController, type createCategoryController } from './category.controller.ts'
import { requireCategoryManager } from './category.rbac.ts'

type CategoryController = ReturnType<typeof createCategoryController>

export function createCategoryRouter(controller: CategoryController = categoryController) {
  const router = Router()
  router.get('/', controller.list)
  router.post('/', requireCategoryManager, controller.create)
  router.post('/reassign', requireCategoryManager, controller.reassign)
  router.put('/:categoryId', requireCategoryManager, controller.update)
  router.delete('/:categoryId', requireCategoryManager, controller.remove)
  return router
}

export const categoryRouter = createCategoryRouter()

