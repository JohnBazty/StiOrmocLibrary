import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { circulationController, createCirculationController } from './circulation.controller.ts'
import { validateBorrowCartBody } from './borrow-cart.middleware.ts'

type Controller = ReturnType<typeof createCirculationController>

/** Each submit stores a decision row, so cap fresh-key retries per borrower account. */
export const RENEWAL_SUBMIT_LIMIT = 10

function renewalSubmitLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000, limit: RENEWAL_SUBMIT_LIMIT, standardHeaders: 'draft-8', legacyHeaders: false,
    // Keyed by account: students on campus Wi-Fi share one public IP.
    keyGenerator: (_request, response) => {
      const user = response.locals.authenticatedUser as { accountId?: number; id?: number } | undefined
      return `account:${user?.accountId ?? user?.id ?? 'unknown'}`
    },
    message: { success: false, code: 'RENEWAL_RATE_LIMITED', message: 'Too many renewal requests. Please wait 15 minutes.' },
  })
}

export function createUserCirculationRouter(controller: Controller = circulationController) {
  const router = Router()
  router.get('/my-books', controller.myBooks)
  router.get('/history', controller.history)
  router.get('/:transactionId/renewals/preflight', controller.preflightRenewal)
  router.post('/:transactionId/renewals', renewalSubmitLimiter(), controller.submitRenewal)
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
  router.get('/borrowing/:transactionId/renewals/preflight', controller.preflightRenewal)
  router.post('/borrowing/:transactionId/renewals', controller.staffRenewal)
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
