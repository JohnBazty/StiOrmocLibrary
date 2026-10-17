import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { NextFunction, Request, Response } from 'express'
import { jwtAuthService } from './jwt-auth.service.ts'
import { authenticateJwt, ensureActiveJwtAccount, requireJwtRoles, requireLibraryPermission } from './jwt-auth.middleware.ts'
import { registrationService } from './registration.service.ts'
import { passwordRecoveryService } from './password-recovery.service.ts'
import { loginSecurityService, signSessionToken } from './login-security.service.ts'
import { db } from '../../config/db.js'

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

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { success: false, code: 'TOO_MANY_REGISTRATIONS', message: 'Too many registration attempts. Please try again later.' },
})

export const jwtAuthRouter = Router()
const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { success: false, code: 'RECOVERY_RATE_LIMITED', message: 'Too many recovery attempts. Please wait 15 minutes.' },
})
const recoveryRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { success: false, code: 'RECOVERY_RATE_LIMITED', message: 'Too many code requests. Please wait 15 minutes.' },
})
for (const action of ['request', 'verify', 'reset'] as const) {
  jwtAuthRouter.post(`/password-recovery/${action}`, action === 'request' ? recoveryRequestLimiter : recoveryLimiter, async (request, response, next) => {
    response.set('Cache-Control', 'no-store')
    try { response.json({ success: true, data: await passwordRecoveryService[action](request.body) }) }
    catch (error) { next(error) }
  })
}
jwtAuthRouter.post('/register', registrationLimiter, createJwtRegisterController())
jwtAuthRouter.post('/register/resend', registrationLimiter, async (request, response, next) => {
  try { response.json({ success: true, data: await registrationService.resend(request.body) }) }
  catch (error) { next(error) }
})
jwtAuthRouter.post('/register/verify', registrationLimiter, async (request, response, next) => {
  try { response.json({ success: true, data: await registrationService.verify(request.body) }) }
  catch (error) { next(error) }
})
jwtAuthRouter.post('/login', rateLimit({ windowMs: 10 * 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false }), async (request, response, next) => {
  response.set('Cache-Control', 'no-store')
  try { response.json({ success: true, data: await loginSecurityService.login(request.body) }) } catch (error) { next(error) }
})
const otpLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false })
for (const action of ['verify', 'resend'] as const) jwtAuthRouter.post(`/login/${action}`, otpLimiter, async (request, response, next) => {
  response.set('Cache-Control', 'no-store')
  try { response.json({ success: true, data: await loginSecurityService[action](request.body) }) } catch (error) { next(error) }
})
jwtAuthRouter.post('/activity', authenticateJwt, ensureActiveJwtAccount, async (_request, response, next) => {
  response.set('Cache-Control', 'no-store')
  try {
    const identity = response.locals.authenticatedUser
    if (!identity.sessionId) { response.status(401).json({ success: false, message: 'Sign in again to start a renewed session.' }); return }
    const [result] = await db.execute('UPDATE library_login_sessions SET last_activity_at=NOW() WHERE session_id=? AND account_id=? AND auth_version=? AND revoked_at IS NULL AND last_activity_at>NOW()-INTERVAL \'10 minutes\'', [identity.sessionId, identity.accountId, identity.authVersion])
    if (!(result as { affectedRows: number }).affectedRows) { response.status(401).json({ success: false, message: 'Your session expired. Sign in again.' }); return }
    response.json({ success: true, data: { token: signSessionToken(identity), idleSeconds: 600 } })
  } catch (error) { next(error) }
})
jwtAuthRouter.get('/me', authenticateJwt, ensureActiveJwtAccount, (_request, response) => response.json({ success: true, data: response.locals.authenticatedUser }))
jwtAuthRouter.get('/registration-requests', authenticateJwt, ensureActiveJwtAccount, requireLibraryPermission('accounts.manage'), async (_request, response, next) => {
  try { response.json({ success: true, data: await registrationService.pendingApprovals() }) }
  catch (error) { next(error) }
})
jwtAuthRouter.post('/registration-requests/:requestId/review', authenticateJwt, ensureActiveJwtAccount, requireLibraryPermission('accounts.manage'), async (request, response, next) => {
  try {
    const data = await registrationService.review(Number(request.params.requestId), response.locals.authenticatedUser.accountId,
      String(request.body?.decision ?? ''))
    response.json({ success: true, data })
  } catch (error) { next(error) }
})

export const jwtProtectedRouter = Router()
jwtProtectedRouter.get('/admin/dashboard', authenticateJwt, requireJwtRoles('Admin'), (_request, response) => response.json({ success: true, data: { area: 'admin' } }))
jwtProtectedRouter.get('/librarian/dashboard', authenticateJwt, requireJwtRoles('Librarian'), (_request, response) => response.json({ success: true, data: { area: 'librarian' } }))
jwtProtectedRouter.get('/faculty/dashboard', authenticateJwt, requireJwtRoles('Faculty'), (_request, response) => response.json({ success: true, data: { area: 'faculty' } }))
jwtProtectedRouter.get('/staff/dashboard', authenticateJwt, requireJwtRoles('Staff'), (_request, response) => response.json({ success: true, data: { area: 'staff' } }))
jwtProtectedRouter.get('/student/dashboard', authenticateJwt, requireJwtRoles('Student'), (_request, response) => response.json({ success: true, data: { area: 'student' } }))
