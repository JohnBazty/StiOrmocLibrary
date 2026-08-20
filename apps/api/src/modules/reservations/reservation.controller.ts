import type { NextFunction, Request, Response } from 'express'
import { reservationService } from './reservation.service.ts'

type Service = typeof reservationService
function asyncController(handler: (request: Request, response: Response) => Promise<unknown>) {
  return async (request: Request, response: Response, next: NextFunction) => { try { await handler(request, response) } catch (error) { next(error) } }
}
function sessionUser(request: Request) {
  return (request.session as typeof request.session & { user?: { id?: number; role?: string } }).user
}
function authenticatedUser(request: Request, response: Response) {
  return sessionUser(request) ?? (response.locals.authenticatedUser as { id?: number; role?: string } | undefined)
}

export function createReservationController(service: Service = reservationService) {
  return {
    create: asyncController(async (request, response) => {
      const result = await service.create(authenticatedUser(request, response)?.id, request.body)
      response.status(201).json({ success: true, message: 'Reservation request submitted successfully.', data: result })
    }),
    queue: asyncController(async (request, response) => {
      response.json({ success: true, data: await service.queue(request.query as Record<string, unknown>) })
    }),
    adjustStatus: asyncController(async (request, response) => {
      response.json({ success: true, message: 'Reservation status updated successfully.', data: await service.adjustStatus(authenticatedUser(request, response)?.id, request.params.reservationId, request.body) })
    }),
  }
}
export const reservationController = createReservationController()
