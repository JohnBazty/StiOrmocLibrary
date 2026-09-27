import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { NextFunction, Request, Response } from 'express'
import { jwtAuthService } from './jwt-auth.service.ts'
import { authenticateJwt, ensureActiveJwtAccount, requireJwtRoles } from './jwt-auth.middleware.ts'
import { registrationService } from './registration.service.ts'

type Service = typeof jwtAuthService
export function createJwtLoginController(service: Service = jwtAuthService) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try { response.json({ success: true, message: 'Login successful.', data: await service.login(request.body) }) }
    catch (error) { next(error) }
  }
}

export function createJwtRegisterController() {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const data = await registrationService.register(request.body)
      response.status(201).json({ success: true, message: 'Check your school email for a verification code.', data })
    } catch (error) { next(error) }
  }
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { success: false, code: 'TOO_MANY_LOGIN_ATTEMPTS', message: 'Too many login attempts. Please wait 15 minutes.' },
})

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { success: false, code: 'TOO_MANY_REGISTRATIONS', message: 'Too many registration attempts. Please try again later.' },
})

export const jwtAuthRouter = Router()
jwtAuthRouter.post('/register', registrationLimiter, createJwtRegisterController())
jwtAuthRouter.post('/register/resend', registrationLimiter, async (request, response, next) => {
  try { response.json({ success: true, data: await registrationService.resend(request.body) }) }
  catch (error) { next(error) }
})
jwtAuthRouter.post('/register/verify', registrationLimiter, async (request, response, next) => {
  try { response.json({ success: true, data: await registrationService.verify(request.body) }) }
  catch (error) { next(error) }
})
jwtAuthRouter.post('/login', limiter, createJwtLoginController())
jwtAuthRouter.get('/me', authenticateJwt, ensureActiveJwtAccount, (_request, response) => response.json({ success: true, data: response.locals.authenticatedUser }))
jwtAuthRouter.get('/registration-requests', authenticateJwt, ensureActiveJwtAccount, requireJwtRoles('Admin'), async (_request, response, next) => {
  try { response.json({ success: true, data: await registrationService.pendingApprovals() }) }
  catch (error) { next(error) }
})
jwtAuthRouter.post('/registration-requests/:requestId/review', authenticateJwt, ensureActiveJwtAccount, requireJwtRoles('Admin'), async (request, response, next) => {
  try {
    const data = await registrationService.review(Number(request.params.requestId), response.locals.authenticatedUser.accountId,
      String(request.body?.decision ?? ''), String(request.body?.reason ?? ''))
    response.json({ success: true, data })
  } catch (error) { next(error) }
})

export const jwtProtectedRouter = Router()
jwtProtectedRouter.get('/admin/dashboard', authenticateJwt, requireJwtRoles('Admin'), (_request, response) => response.json({ success: true, data: { area: 'admin' } }))
jwtProtectedRouter.get('/librarian/dashboard', authenticateJwt, requireJwtRoles('Librarian'), (_request, response) => response.json({ success: true, data: { area: 'librarian' } }))
jwtProtectedRouter.get('/faculty/dashboard', authenticateJwt, requireJwtRoles('Faculty'), (_request, response) => response.json({ success: true, data: { area: 'faculty' } }))
jwtProtectedRouter.get('/staff/dashboard', authenticateJwt, requireJwtRoles('Staff'), (_request, response) => response.json({ success: true, data: { area: 'staff' } }))
jwtProtectedRouter.get('/student/dashboard', authenticateJwt, requireJwtRoles('Student'), (_request, response) => response.json({ success: true, data: { area: 'student' } }))
