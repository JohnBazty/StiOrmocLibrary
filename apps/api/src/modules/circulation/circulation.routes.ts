import { Router } from 'express'
import { circulationController, createCirculationController } from './circulation.controller.ts'
import { validateBorrowCartBody } from './borrow-cart.middleware.ts'

type Controller = ReturnType<typeof createCirculationController>

export function createUserCirculationRouter(controller: Controller = circulationController) {
  const router = Router()
  router.get('/history', controller.history)
  return router
}

export function createBorrowCartRouter(controller: Controller = circulationController) {
  const router = Router()
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
  router.post('/borrowing/confirm-checkout', controller.confirmCheckout)
  router.put('/borrowing/:transactionId/return', controller.returnBook)
  router.post('/borrowing/:transactionId/calculate-penalty', controller.calculatePenalty)
  router.get('/notifications', controller.notifications)
  return router
}

export const userCirculationRouter = createUserCirculationRouter()
export const borrowCartRouter = createBorrowCartRouter()
export const circulationRequestRouter = createCirculationRequestRouter()
export const adminCirculationRouter = createAdminCirculationRouter()
// Backward-compatible session namespace. New clients use /api/v1/admin.
export const circulationRouter = adminCirculationRouter
