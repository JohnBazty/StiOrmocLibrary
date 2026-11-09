import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { NextFunction, Request, Response } from 'express'
import { jwtAuthService } from './jwt-auth.service.ts'
import { authenticateJwt, ensureActiveJwtAccount, requireJwtRoles } from './jwt-auth.middleware.ts'
import { passwordRecoveryService } from './password-recovery.service.ts'
import { loginSecurityService, signSessionToken } from './login-security.service.ts'
import { db } from '../../config/db.js'
import { activeEnrollmentSemester, enrollmentEnabled, rosterRegistrationRequired } from '../enrollment/enrollment-policy.ts'
import { rosterRegistration } from '../enrollment/roster-registration.service.ts'

type Service = typeof jwtAuthService
export function createJwtLoginController(service: Service = jwtAuthService) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try { response.json({ success: true, message: 'Login successful.', data: await service.login(request.body) }) }
    catch (error) { next(error) }
  }
}

export const jwtAuthRouter = Router()
const rosterCodeLimiter=rateLimit({windowMs:15*60_000,limit:12,standardHeaders:'draft-8',legacyHeaders:false})
const rosterStepLimiter=rateLimit({windowMs:15*60_000,limit:35,standardHeaders:'draft-8',legacyHeaders:false})
jwtAuthRouter.get('/roster-registration',async (_request,response,next)=>{
  response.set('Cache-Control','no-store')
  try {
    const enabled = enrollmentEnabled()
    const required = await rosterRegistrationRequired(db)
    const open = enabled && Boolean(await activeEnrollmentSemester(db))
    response.json({ success: true, data: { enabled, required, open } })
  } catch (e) { next(e) }
})
for(const step of ['begin','verify','complete'] as const) jwtAuthRouter.post(`/roster-registration/${step}`,step==='begin'?rosterCodeLimiter:rosterStepLimiter,async(request,response,next)=>{
  response.set('Cache-Control','no-store')
  try{response.json({success:true,data:await rosterRegistration[step](request.body)})}catch(e){next(e)}
})
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
jwtAuthRouter.post(['/register', '/register/resend', '/register/verify'], (_request, response) => {
  response.set('Cache-Control', 'no-store').status(410).json({
    success: false, code: 'REGISTRATION_FLOW_REPLACED', message: 'Open the latest registration page to use Student roster signup. Staff accounts are set up by the library.',
  })
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

export const jwtProtectedRouter = Router()
jwtProtectedRouter.get('/admin/dashboard', authenticateJwt, requireJwtRoles('Admin'), (_request, response) => response.json({ success: true, data: { area: 'admin' } }))
jwtProtectedRouter.get('/librarian/dashboard', authenticateJwt, requireJwtRoles('Librarian'), (_request, response) => response.json({ success: true, data: { area: 'librarian' } }))
jwtProtectedRouter.get('/faculty/dashboard', authenticateJwt, requireJwtRoles('Faculty'), (_request, response) => response.json({ success: true, data: { area: 'faculty' } }))
jwtProtectedRouter.get('/staff/dashboard', authenticateJwt, requireJwtRoles('Staff'), (_request, response) => response.json({ success: true, data: { area: 'staff' } }))
jwtProtectedRouter.get('/student/dashboard', authenticateJwt, requireJwtRoles('Student'), (_request, response) => response.json({ success: true, data: { area: 'student' } }))
