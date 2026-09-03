import { type NextFunction, type Request, type Response, Router } from 'express'
import { supplies } from '../../data/mock-data.ts'
import { ok } from '../../core/http.ts'
import {
  commitPhysicalCopyMutation,
  getPhysicalCopyMutationTransaction,
  physicalCopyMutationGuard,
  rollbackPhysicalCopyMutation,
} from './physical-copy-mutation.middleware.ts'
import { archivePhysicalCopy, deletePhysicalCopy, updatePhysicalCopy } from './physical-copy.service.ts'
import { requireCatalogManager } from '../catalog/catalog.rbac.ts'
import { changeAvailability, changeCondition, exportCsv, exportPdf, getCopies, getSummary, scanBarcode } from './inventory.controller.ts'
import { validateAvailabilityMutation, validateConditionMutation } from './inventory.validation.ts'
import { thesisInventoryRouter } from './thesis-inventory.routes.ts'
import { inventoryActor } from './inventory-actor.ts'

export const inventoryRouter = Router()
inventoryRouter.get('/', requireCatalogManager, getCopies)
inventoryRouter.get('/summary', requireCatalogManager, getSummary)
inventoryRouter.get('/copies', requireCatalogManager, getCopies)
inventoryRouter.post('/scans', requireCatalogManager, scanBarcode)
inventoryRouter.patch('/copies/condition', requireCatalogManager, validateConditionMutation, changeCondition)
inventoryRouter.patch('/copies/availability', requireCatalogManager, validateAvailabilityMutation, changeAvailability)
inventoryRouter.get('/export.csv', requireCatalogManager, exportCsv)
inventoryRouter.get('/export.pdf', requireCatalogManager, exportPdf)
inventoryRouter.get('/supplies', (_request, response) => ok(response, supplies))
inventoryRouter.use('/thesis', thesisInventoryRouter)

inventoryRouter.patch('/copies/:copyId', requireCatalogManager, async (request, response, next) => {
  try {
    const result = await updatePhysicalCopy(undefined, request.params.copyId, request.body)
    return response.json({ success: true, message: 'Physical copy details updated successfully.', data: result })
  } catch (error) { return next(error) }
})

inventoryRouter.post(
  '/copies/:copyId/archive',
  requireCatalogManager,
  physicalCopyMutationGuard('archive'),
  async (request: Request, response: Response, next: NextFunction) => {
    const transaction = getPhysicalCopyMutationTransaction(response)
    try {
      const result = await archivePhysicalCopy(transaction, request.body?.reason, inventoryActor(request, response))
      await commitPhysicalCopyMutation(transaction)
      return response.json({ success: true, message: 'Physical copy archived successfully.', data: result })
    } catch (error) {
      await rollbackPhysicalCopyMutation(transaction)
      return next(error)
    }
  },
)

inventoryRouter.delete(
  '/copies/:copyId',
  requireCatalogManager,
  physicalCopyMutationGuard('delete'),
  async (_request: Request, response: Response, next: NextFunction) => {
    const transaction = getPhysicalCopyMutationTransaction(response)
    try {
      const result = await deletePhysicalCopy(transaction, inventoryActor(_request, response))
      await commitPhysicalCopyMutation(transaction)
      return response.json({ success: true, message: 'Physical copy deleted successfully.', data: result })
    } catch (error) {
      await rollbackPhysicalCopyMutation(transaction)
      return next(error)
    }
  },
)
