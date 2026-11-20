import { Router } from 'express'
import { categoryController, type createCategoryController } from './category.controller.ts'
import { requireCategoryManager } from './category.rbac.ts'
import { listManagedShelves, saveManagedShelf } from '../shelf-capacity.service.ts'
import { shelfSuggestionsService } from '../shelf-suggestions.service.ts'

type CategoryController = ReturnType<typeof createCategoryController>

export function createCategoryRouter(controller: CategoryController = categoryController, suggestions: Pick<typeof shelfSuggestionsService, 'suggestions' | 'saveDdcRange'> = shelfSuggestionsService) {
  const router = Router()
  router.get('/', controller.list)
  router.get('/shelves', requireCategoryManager, async (request, response, next) => {
    try { response.json({ success: true, data: await listManagedShelves(undefined, request.query.includeArchived === 'true') }) } catch (error) { next(error) }
  })
  router.post('/shelves', requireCategoryManager, async (request, response, next) => {
    try {
      const actor = Number(response.locals.authenticatedUser?.accountId ?? response.locals.authenticatedUser?.id)
      response.status(201).json({ success: true, data: await saveManagedShelf(null, request.body, actor) })
    } catch (error) { next(error) }
  })
  router.put('/shelves/:shelfId', requireCategoryManager, async (request, response, next) => {
    try {
      const actor = Number(response.locals.authenticatedUser?.accountId ?? response.locals.authenticatedUser?.id)
      response.json({ success: true, data: await saveManagedShelf(request.params.shelfId, request.body, actor) })
    } catch (error) { next(error) }
  })
  // Copies that belong on this shelf (by category or DDC range), and the shelf in call-number order.
  router.get('/shelves/:shelfId/suggestions', requireCategoryManager, async (request, response, next) => {
    try { response.set('Cache-Control', 'no-store').json({ success: true, data: await suggestions.suggestions(request.params.shelfId) }) } catch (error) { next(error) }
  })
  router.put('/shelves/:shelfId/ddc-range', requireCategoryManager, async (request, response, next) => {
    try { response.json({ success: true, message: 'Shelf DDC range saved.', data: await suggestions.saveDdcRange(request.params.shelfId, request.body) }) } catch (error) { next(error) }
  })
  router.post('/', requireCategoryManager, controller.create)
  router.post('/reassign', requireCategoryManager, controller.reassign)
  router.put('/:categoryId', requireCategoryManager, controller.update)
  router.delete('/:categoryId', requireCategoryManager, controller.remove)
  return router
}

export const categoryRouter = createCategoryRouter()

