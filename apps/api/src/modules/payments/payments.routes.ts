import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { requireCsrfForStateChanges } from '../auth/auth.middleware.js'
import { requireJwtRoles, requireLibraryPermission } from '../auth/jwt-auth.middleware.ts'
import { createPaymentsController } from './payments.controller.ts'
import { paymentsService, type createPaymentsService } from './payments.service.ts'

export function createPaymentsRouters(service: ReturnType<typeof createPaymentsService> = paymentsService) {
  const controller = createPaymentsController(service)
  const user = Router(), admin = Router()
  const writes = rateLimit({
    windowMs:60_000,limit:20,standardHeaders:'draft-7',legacyHeaders:false,
    keyGenerator:(_request,response)=>String(response.locals.authenticatedUser?.accountId ?? 'unknown'),
    message:{success:false,code:'PAYMENT_RATE_LIMIT',message:'Wait a moment before reviewing another payment.'},
  })
  user.use(requireJwtRoles('Student','Faculty'),requireCsrfForStateChanges)
  user.post('/quote',writes,controller.quote)
  user.post('/checkout',writes,controller.prepare)
  user.get('/:id',controller.read)
  admin.use(requireCsrfForStateChanges)
  admin.get('/',requireLibraryPermission('desk.operate'),controller.list)
  admin.put('/fee-rules',requireLibraryPermission('library.manage'),writes,controller.setFee)
  return {user,admin}
}

export const paymentRouters = createPaymentsRouters()
