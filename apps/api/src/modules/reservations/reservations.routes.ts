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
