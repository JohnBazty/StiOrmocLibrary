import { Router } from 'express'
import { HttpError } from '../../core/http-error.ts'
import { reservationController, createReservationController } from './reservation.controller.ts'
import { requireReservationManager } from './reservation.rbac.ts'

const PATRON_ROLES = new Set(['Student', 'Faculty'])

type Controller = ReturnType<typeof createReservationController>
export function createReservationsRouter(controller: Controller = reservationController) {
  const router = Router()
  router.post('/', (request, response, next) => {
    const user = (response.locals.authenticatedUser as { role?: string } | undefined)
      ?? (request.session as typeof request.session & { user?: { role?: string } })?.user
    if (!user?.role || !PATRON_ROLES.has(user.role)) {
      return next(new HttpError(403, 'FORBIDDEN', 'Only Student and Faculty accounts may submit book reservations.'))
    }
    return next()
  }, controller.create)
  router.get('/admin/queue', requireReservationManager, controller.queue)
  router.patch('/:reservationId/status', requireReservationManager, controller.adjustStatus)
  router.get('/:reservationId/swap-candidates', requireReservationManager, controller.swapCandidates)
  router.post('/:reservationId/swap-copy', requireReservationManager, controller.swapCopy)
  router.post('/:reservationId/move', requireReservationManager, controller.moveInQueue)
  return router
}
export const reservationsRouter = createReservationsRouter()

export function createUserReservationsV1Router(controller: Controller = reservationController) {
  const router = Router()
  router.get('/', controller.listForAccount)
  router.post('/request', controller.createForAccount)
  router.put('/:reservationId/cancel', controller.cancelForAccount)
  return router
}

export function createAdminReservationsV1Router(controller: Controller = reservationController) {
  const router = Router()
  router.get('/', controller.queue)
  router.patch('/:reservationId/status', controller.adjustStatus)
  router.get('/:reservationId/swap-candidates', controller.swapCandidates)
  router.post('/:reservationId/swap-copy', controller.swapCopy)
  router.post('/:reservationId/move', controller.moveInQueue)
  return router
}

export const userReservationsV1Router = createUserReservationsV1Router()
export const adminReservationsV1Router = createAdminReservationsV1Router()
