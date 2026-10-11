import { Router } from 'express'
import { categoryController, type createCategoryController } from './category.controller.ts'
import { requireCategoryManager } from './category.rbac.ts'
import { floorPlanRepository } from '../../floor-plan/floor-plan.repository.ts'
import { shelfLabel } from '../../floor-plan/floor-plan.validation.ts'
import { isPostgres } from '../../../config/sql-dialect.js'
import { catalogOptions, saveFoundation } from '../catalog-enhancements.service.ts'

type CategoryController = ReturnType<typeof createCategoryController>

export function createCategoryRouter(controller: CategoryController = categoryController) {
  const router = Router()
  router.get('/', controller.list)
  router.get('/shelves', requireCategoryManager, async (_request, response, next) => {
    try { const data=isPostgres?(await catalogOptions(true)).locations as Array<{id:number;name:string;columnCount:number;rowCount:number}>:null;response.json({ success: true, data: data?data.map(l=>({id:Number(l.id),label:l.name,columnCount:Number(l.columnCount),rowCount:Number(l.rowCount)})):await floorPlanRepository.shelfDirectory() }) } catch (error) { next(error) }
  })
  router.post('/shelves', requireCategoryManager, async (request, response, next) => {
    try {
      const actor = Number(response.locals.authenticatedUser?.accountId ?? response.locals.authenticatedUser?.id)
      if(isPostgres){await saveFoundation('locations',null,{name:shelfLabel(request.body?.label)},actor);response.status(201).json({success:true,data:{created:true}});return}
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

