import { Router } from 'express'
import jwt, { type JwtPayload } from 'jsonwebtoken'
import { rateLimit } from 'express-rate-limit'
import type { NextFunction, Request, Response } from 'express'
import { jwtAuthService } from './jwt-auth.service.ts'
import {
  authenticateJwt, clearAccessCookie, csrfTokenFor, ensureActiveJwtAccount, requestAccessToken, requireJwtCsrf, requireJwtRoles,
  setAccessCookie, verifyAccessToken,
} from './jwt-auth.middleware.ts'
import { passwordChangeService } from './password-change.service.ts'
import { passwordRecoveryService } from './password-recovery.service.ts'
import { deviceAccessLifetime, loginSecurityService, signSessionToken } from './login-security.service.ts'
import { DEVICE_DEADLINE_SQL, DEVICE_IDLE_SQL, LOGIN_IDLE_MS, isDeviceSessionId, isDeviceToken, loginDevicesEnabled } from './login-device-policy.ts'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
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
const deviceCookieName = env.isProduction ? '__Host-library-device' : 'library-device'
const deviceCookieOptions = { httpOnly: true, secure: env.isProduction, sameSite: 'strict' as const, path: '/' }

function browserToken(request: Request, sessionId: unknown) {
  if (!isDeviceSessionId(sessionId)) return undefined
  const name = `${deviceCookieName}-${sessionId}=`
  const value = request.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(name))?.slice(name.length)
  return isDeviceToken(value) ? value : undefined
}

function sameOrigin(request: Request) {
  const origin = request.get('origin')
  const site = request.get('sec-fetch-site')
  return (!site || site === 'same-origin')
    && (!origin || origin === env.webOrigin || origin === `${request.protocol}://${request.get('host')}`)
}

/** The JWT goes only into the httpOnly cookie; the body carries its public claims and the CSRF token. */
export function sessionBody(token: string) {
  const session = jwt.decode(token) as JwtPayload
  return { session, csrfToken: csrfTokenFor(String(session.sessionId)) }
}

export function sendLogin(request: Request, response: Response, result: object | undefined) {
  const { deviceCookie, token, tokenType: _tokenType, ...rest } = (result ?? {}) as {
    deviceCookie?: { token: string; sessionId: string; deadline?: number }; token?: string; tokenType?: string; expiresIn?: number
  }
  const data = typeof token === 'string' ? { ...rest, ...sessionBody(token) } : rest
  if (typeof token === 'string') setAccessCookie(response, token, Number(rest.expiresIn ?? env.jwt.expiresInSeconds))
  if (deviceCookie) {
    const { token, sessionId, deadline } = deviceCookie
    const previous = request.body?.device_session_id
    if (isDeviceSessionId(previous) && browserToken(request, previous)) response.clearCookie(`${deviceCookieName}-${previous}`, deviceCookieOptions)
    // A delayed logout can clear only the cookie for its own session.
    response.cookie(`${deviceCookieName}-${sessionId}`, token, { ...deviceCookieOptions, ...(deadline ? { expires: new Date(deadline) } : {}) })
  }
  response.json({ success: true, data })
}

jwtAuthRouter.use('/device', (_request, response, next) => {
  response.set('Cache-Control', 'no-store')
  next()
})
jwtAuthRouter.get('/device', (_request, response) => {
  response.json({ success: true, data: { enabled: loginDevicesEnabled() } })
})
const deviceLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false })
for (const action of ['resume', 'switch', 'logout'] as const) jwtAuthRouter.post(`/device/${action}`, deviceLimiter, async (request, response, next) => {
  try {
    if (!loginDevicesEnabled()) throw new HttpError(404, 'DEVICE_DISABLED', 'Device sign-in is unavailable.')
    // A cross-origin form cannot send this header. Cross-origin fetch is rejected even after preflight.
    if (request.get('x-library-device') !== '1' || !sameOrigin(request)) throw new HttpError(403, 'DEVICE_ORIGIN', 'Open the library website and try again.')
    if (action === 'switch') { sendLogin(request, response, await loginSecurityService.switchDevice(request.body?.switch_token)); return }
    if (action === 'resume') {
      const sessionId = request.body?.session_id
      sendLogin(request, response, await loginSecurityService.resumeDevice(browserToken(request, sessionId), sessionId))
      return
    }
    const token = requestAccessToken(request)?.token
    let identity: ReturnType<typeof verifyAccessToken> | undefined
    if (token) {
      try { identity = verifyAccessToken(token, { ignoreExpiration: true }) }
      catch { throw new HttpError(401, 'JWT_INVALID', 'Open your library account and try again.') }
    }
    const sessionId = identity?.sessionId ?? request.body?.session_id
    const cookie = browserToken(request, sessionId)
    if (token && !cookie) {
      // An expired bearer can identify its own cookie, but cannot revoke a grant by itself.
      try { identity = verifyAccessToken(token) } catch { identity = undefined }
    }
    await loginSecurityService.revokeDevice(cookie, identity)
    if (isDeviceSessionId(sessionId)) response.clearCookie(`${deviceCookieName}-${sessionId}`, deviceCookieOptions)
    clearAccessCookie(response)
    response.json({ success: true, data: { signedOut: true } })
  } catch (error) { next(error) }
})
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
  try {
    // The reply sets the sign-in cookie, so a cross-site form must not reach it (login CSRF).
    if (!sameOrigin(request)) throw new HttpError(403, 'DEVICE_ORIGIN', 'Open the library website and try again.')
    sendLogin(request, response, await loginSecurityService.login(request.body, browserToken(request, request.body?.device_session_id)))
  } catch (error) { next(error) }
})
const otpLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false })
for (const action of ['verify', 'resend'] as const) jwtAuthRouter.post(`/login/${action}`, otpLimiter, async (request, response, next) => {
  response.set('Cache-Control', 'no-store')
  try {
    if (!sameOrigin(request)) throw new HttpError(403, 'DEVICE_ORIGIN', 'Open the library website and try again.')
    sendLogin(request, response, action === 'verify' ? await loginSecurityService.verify(request.body, browserToken(request, request.body?.device_session_id)) : await loginSecurityService.resend(request.body))
  } catch (error) { next(error) }
})
jwtAuthRouter.post('/activity', authenticateJwt, ensureActiveJwtAccount, requireJwtCsrf, async (_request, response, next) => {
  response.set('Cache-Control', 'no-store')
  try {
    const identity = response.locals.authenticatedUser
    if (!identity.sessionId) { response.status(401).json({ success: false, message: 'Sign in again to start a renewed session.' }); return }
    const timestamp = Date.now()
    const deadline = loginDevicesEnabled() ? ` AND ${DEVICE_DEADLINE_SQL}` : ''
    const expiresIn = identity.deviceSession ? deviceAccessLifetime(timestamp, identity.rememberedUntil, timestamp) : undefined
    if (expiresIn !== undefined && expiresIn < 1) { response.status(401).json({ success: false, code: 'SESSION_EXPIRED', message: 'Sign in again to continue.' }); return }
    const [result] = await db.execute(`UPDATE library_login_sessions SET last_activity_at=NOW() WHERE session_id=? AND account_id=? AND auth_version=? AND revoked_at IS NULL AND ${DEVICE_IDLE_SQL}${deadline}`, [identity.sessionId, identity.accountId, identity.authVersion])
    if (!(result as { affectedRows: number }).affectedRows) { response.status(401).json({ success: false, message: 'Your session expired. Sign in again.' }); return }
    const renewed = identity.deviceSession ? { ...identity, idleUntil: timestamp + LOGIN_IDLE_MS } : identity
    const token = signSessionToken(renewed, expiresIn)
    setAccessCookie(response, token, expiresIn ?? env.jwt.expiresInSeconds)
    response.json({ success: true, data: { ...sessionBody(token), idleSeconds: 600 } })
  } catch (error) { next(error) }
})
const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
  keyGenerator: (_request, response) => `account:${response.locals.authenticatedUser.accountId}`,
  message: { success: false, code: 'PASSWORD_CHANGE_RATE_LIMITED', message: 'Too many password change attempts. Please wait 15 minutes.' },
})
jwtAuthRouter.post('/change-password', authenticateJwt, ensureActiveJwtAccount, requireJwtCsrf, passwordChangeLimiter, async (request, response, next) => {
  response.set('Cache-Control', 'no-store')
  try {
    const data = await passwordChangeService.change(response.locals.authenticatedUser.accountId, request.body)
    clearAccessCookie(response)
    response.json({ success: true, data })
  } catch (error) { next(error) }
})
// Also re-seeds a new tab, which has the cookie but not the CSRF token.
jwtAuthRouter.get('/me', authenticateJwt, ensureActiveJwtAccount, (request, response) => {
  response.set('Cache-Control', 'no-store').json({ success: true, data: {
    ...response.locals.authenticatedUser, ...sessionBody(requestAccessToken(request)!.token), mustChangePassword: response.locals.mustChangePassword === true,
  } })
})

export const jwtProtectedRouter = Router()
jwtProtectedRouter.get('/admin/dashboard', authenticateJwt, requireJwtRoles('Admin'), (_request, response) => response.json({ success: true, data: { area: 'admin' } }))
jwtProtectedRouter.get('/librarian/dashboard', authenticateJwt, requireJwtRoles('Librarian'), (_request, response) => response.json({ success: true, data: { area: 'librarian' } }))
jwtProtectedRouter.get('/faculty/dashboard', authenticateJwt, requireJwtRoles('Faculty'), (_request, response) => response.json({ success: true, data: { area: 'faculty' } }))
jwtProtectedRouter.get('/staff/dashboard', authenticateJwt, requireJwtRoles('Staff'), (_request, response) => response.json({ success: true, data: { area: 'staff' } }))
jwtProtectedRouter.get('/student/dashboard', authenticateJwt, requireJwtRoles('Student'), (_request, response) => response.json({ success: true, data: { area: 'student' } }))
