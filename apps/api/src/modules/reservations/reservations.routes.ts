import { Router } from 'express'
import { reservationController, createReservationController } from './reservation.controller.ts'
import { requireReservationManager } from './reservation.rbac.ts'

type Controller = ReturnType<typeof createReservationController>
export function createReservationsRouter(controller: Controller = reservationController) {
  const router = Router()
  router.post('/', controller.create)
  router.get('/admin/queue', requireReservationManager, controller.queue)
  router.patch('/:reservationId/status', requireReservationManager, controller.adjustStatus)
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
  return router
}

export const userReservationsV1Router = createUserReservationsV1Router()
export const adminReservationsV1Router = createAdminReservationsV1Router()
