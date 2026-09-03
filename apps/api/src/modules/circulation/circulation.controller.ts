import type { NextFunction, Request, Response } from 'express'
import { circulationService, createCirculationService } from './circulation.service.ts'

type Service = ReturnType<typeof createCirculationService>
function authenticatedAccount(response: Response) {
  const user = response.locals.authenticatedUser as { accountId?: number; id?: number } | undefined
  return user?.accountId ?? user?.id
}
function authenticatedActor(response: Response) {
  const user = response.locals.authenticatedUser as { accountId?: number; id?: number; role?: string } | undefined
  return { accountId: user?.accountId ?? user?.id, role: user?.role }
}
function asyncController(handler: (request: Request, response: Response) => Promise<void>) {
  return async (request: Request, response: Response, next: NextFunction) => { try { await handler(request, response) } catch (error) { next(error) } }
}
export function createCirculationController(service: Service = circulationService) {
  return {
    history: asyncController(async (request, response) => { response.json({ success: true, data: await service.history(authenticatedAccount(response), request.query as Record<string, unknown>) }) }),
    submitBorrowRequest: asyncController(async (_request, response) => {
      const data = await service.submitBorrowRequest(authenticatedAccount(response), response.locals.borrowCart)
      response.status(201).json({ success: true, message: 'Borrow request submitted successfully.', data })
    }),
    cancelRequest: asyncController(async (request, response) => {
      response.json({
        success: true,
        message: 'Pending borrow request cancelled and the physical copy was released.',
        data: await service.cancelRequest(authenticatedActor(response), request.params.id, request.body),
      })
    }),
    monitor: asyncController(async (request, response) => { response.json({ success: true, data: await service.monitor(request.query as Record<string, unknown>) }) }),
    confirmCheckout: asyncController(async (request, response) => { response.status(201).json({ success: true, message: 'Checkout confirmed successfully.', data: await service.confirmCheckout(authenticatedAccount(response), request.body) }) }),
    fulfillClaim: asyncController(async (request, response) => {
      response.status(201).json({
        success: true,
        message: 'Identity and barcode verified. The counter claim is now an active loan.',
        data: await service.fulfillClaim(authenticatedActor(response), request.body),
      })
    }),
    returnBook: asyncController(async (request, response) => { response.json({ success: true, message: 'Return completed successfully.', data: await service.returnBook(authenticatedAccount(response), request.params.transactionId) }) }),
    calculatePenalty: asyncController(async (request, response) => { response.json({ success: true, data: await service.calculatePenalty(request.params.transactionId) }) }),
    notifications: asyncController(async (request, response) => { response.json({ success: true, data: await service.adminNotifications(request.query.limit) }) }),
  }
}
export const circulationController = createCirculationController()
