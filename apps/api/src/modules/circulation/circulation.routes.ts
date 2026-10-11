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
  router.post('/borrowing/preflight', controller.preflightCheckout)
  router.post('/borrowing/confirm-checkout', controller.confirmCheckout)
  router.put('/borrowing/:transactionId/return', controller.returnBook)
  router.post('/borrowing/:transactionId/report-damage', controller.reportDamage)
  router.post('/borrowing/:transactionId/calculate-penalty', controller.calculatePenalty)
  router.get('/notifications', controller.notifications)
  router.get('/circulation/cases', controller.listCases)
  router.get('/circulation/cases/:caseId', controller.getCaseDetail)
  router.post('/circulation/cases', controller.openDamageCase)
  router.post('/circulation/cases/:caseId/assign', controller.assignCase)
  router.post('/circulation/cases/:caseId/contact-attempts', controller.contactAttempt)
  router.post('/circulation/cases/:caseId/notes', controller.addCaseNote)
  router.post('/circulation/cases/:caseId/inspections', controller.recordInspection)
  router.post('/circulation/cases/:caseId/dispositions', controller.recordDisposition)
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
