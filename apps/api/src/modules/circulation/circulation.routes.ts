import { Router } from 'express'
import { circulationController, createCirculationController } from './circulation.controller.ts'
import { validateBorrowCartBody } from './borrow-cart.middleware.ts'

type Controller = ReturnType<typeof createCirculationController>

export function createUserCirculationRouter(controller: Controller = circulationController) {
  const router = Router()
  router.get('/my-books', controller.myBooks)
  router.get('/history', controller.history)
  return router
}

export function createBorrowCartRouter(controller: Controller = circulationController) {
  const router = Router()
  router.get('/cart-state',controller.cartState)
  router.post('/submit-request', validateBorrowCartBody, controller.submitBorrowRequest)
  return router
}

export function createCirculationRequestRouter(controller: Controller = circulationController) {
  const router = Router()
  router.post('/fulfill-claim', controller.fulfillClaim)
  router.put('/requests/:id/cancel', controller.cancelRequest)
  return router
}

export function createAdminCirculationRouter(controller: Controller = circulationController) {
  const router = Router()
  router.get('/borrowing/monitor', controller.monitor)
  router.post('/borrowing/preflight', controller.preflightCheckout)
  router.post('/borrowing/confirm-checkout', controller.confirmCheckout)
  router.put('/borrowing/:transactionId/return', controller.returnBook)
  router.post('/borrowing/:transactionId/calculate-penalty', controller.calculatePenalty)
  router.get('/notifications', controller.notifications)
  // Damage cases open from a desk return marked Damaged. Desk staff read and note; the service limits dispositions and closing to library.manage.
  router.get('/circulation/cases', controller.listCases)
  router.get('/circulation/cases/:caseId', controller.getCase)
  router.post('/circulation/cases/:caseId/notes', controller.addCaseNote)
  router.post('/circulation/cases/:caseId/dispositions', controller.recordCaseDisposition)
  router.post('/circulation/cases/:caseId/resolve', controller.resolveCase)
  router.post('/circulation/cases/:caseId/dismiss', controller.dismissCase)
  router.post('/circulation/cases/:caseId/reopen', controller.reopenCase)
  return router
}

export const userCirculationRouter = createUserCirculationRouter()
export const borrowCartRouter = createBorrowCartRouter()
export const circulationRequestRouter = createCirculationRequestRouter()
export const adminCirculationRouter = createAdminCirculationRouter()
// Backward-compatible session namespace. New clients use /api/v1/admin.
export const circulationRouter = adminCirculationRouter
