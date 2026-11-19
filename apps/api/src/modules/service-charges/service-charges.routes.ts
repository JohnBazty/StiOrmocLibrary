import { Router, type NextFunction, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { requireCsrfForStateChanges } from '../auth/auth.middleware.js'
import { requireJwtRoles, requireLibraryPermission } from '../auth/jwt-auth.middleware.ts'
import { createServiceChargesService, serviceChargesService } from './service-charges.service.ts'
import { createServiceChargeReceiptPdf } from './service-charges.receipt.ts'

const handle = (fn: (request: Request, response: Response) => Promise<unknown>) => (request: Request, response: Response, next: NextFunction) => { void fn(request, response).catch(next) }
const actor = (response: Response) => ({ accountId: response.locals.authenticatedUser?.accountId ?? response.locals.authenticatedUser?.id,role:response.locals.authenticatedUser?.role })

/** Mount behind the API's existing active-account authentication guard. */
export function createServiceChargesRouters(service: ReturnType<typeof createServiceChargesService> = serviceChargesService) {
  const user = Router(), admin = Router()
  const writes = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
    keyGenerator: (_request, response) => String(response.locals.authenticatedUser?.accountId ?? 'unknown'),
    message: { success: false, code: 'SERVICE_CHARGE_RATE_LIMIT', message: 'Wait a moment before recording another service charge.' } })
  user.use(requireJwtRoles('Student', 'Faculty'), requireCsrfForStateChanges)
  admin.use(requireLibraryPermission('desk.operate'), requireCsrfForStateChanges)
  user.get('/', handle(async (request, response) => {
    const result = await service.own(actor(response), request.query as Record<string, unknown>)
    response.set('Cache-Control', 'private, no-store').json({ success: true, data: result.rows, meta: { pagination: result.pagination } })
  }))
  admin.get('/', handle(async (request, response) => {
    const result = await service.admin(actor(response), request.query as Record<string, unknown>)
    response.set('Cache-Control', 'private, no-store').json({ success: true, data: result.rows, meta: { pagination: result.pagination } })
  }))
  admin.post('/', requireLibraryPermission('library.manage'), writes, handle(async (request, response) => {
    response.status(201).json({ success: true, data: await service.create(actor(response), request.body) })
  }))
  admin.post('/:id/cash-payments', writes, handle(async (request, response) => {
    response.json({ success: true, data: await service.recordCash(actor(response), request.params.id, request.body) })
  }))
  admin.post('/:id/cancel', requireLibraryPermission('library.manage'), writes, handle(async (request, response) => {
    response.json({ success: true, data: await service.cancel(actor(response), request.params.id, request.body) })
  }))
  for (const [router, staff] of [[user, false], [admin, true]] as const) {
    router.get('/receipts/:id', handle(async (request, response) => {
      response.set('Cache-Control', 'private, no-store').json({ success: true, data: await service.receipt(actor(response), request.params.id, staff) })
    }))
    router.get('/receipts/:id/pdf', handle(async (request, response) => {
      const receipt = await service.receipt(actor(response), request.params.id, staff)
      response.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${receipt.receiptNumber}.pdf"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' })
      createServiceChargeReceiptPdf(receipt).pipe(response)
    }))
  }
  return { user, admin }
}

export const serviceChargesRouters = createServiceChargesRouters()
