import { createHmac, timingSafeEqual } from 'node:crypto'
import jwt, { type JwtPayload } from 'jsonwebtoken'
import type { NextFunction, Request, Response } from 'express'
import { env } from '../../config/env.js'
import { db } from '../../config/db.js'
import type { JwtRole } from './jwt-auth.service.ts'
import { hasLibraryPermission, type LibraryPermission } from '../../core/library-permissions.ts'
import { semesterAccessEnded } from '../enrollment/enrollment-policy.ts'
import { DEVICE_DEADLINE_SQL, DEVICE_IDLE_SQL, loginDevicesEnabled } from './login-device-policy.ts'

export type AuthenticatedJwtUser = { id: number; accountId: number; schoolId: string; role: JwtRole; authVersion: number; sessionId?: string; deviceSession?: boolean; rememberedUntil?: number }

export function bearerToken(request: Request) {
  const authorization = request.get('authorization') ?? ''
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i)
  return match?.[1] ?? null
}

// S4: the browser keeps the JWT in an httpOnly cookie. Path `/` because old /api routes still read it.
export const ACCESS_COOKIE = env.isProduction ? '__Host-library-token' : 'library-token'
const accessCookieOptions = { httpOnly: true, secure: env.isProduction, sameSite: 'lax' as const, path: '/' }
export const setAccessCookie = (response: Response, token: string, expiresInSeconds: number) =>
  response.cookie(ACCESS_COOKIE, token, { ...accessCookieOptions, maxAge: expiresInSeconds * 1000 })
export const clearAccessCookie = (response: Response) => response.clearCookie(ACCESS_COOKIE, accessCookieOptions)

function cookieToken(request: Request) {
  const name = `${ACCESS_COOKIE}=`
  const value = request.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(name))?.slice(name.length)
  return value || null
}

/** Bearer first (kept for one release), then the cookie. */
export function requestAccessToken(request: Request): { token: string; source: 'bearer' | 'cookie' } | null {
  const bearer = bearerToken(request)
  if (bearer) return { token: bearer, source: 'bearer' }
  const cookie = cookieToken(request)
  return cookie ? { token: cookie, source: 'cookie' } : null
}

/** Lives exactly as long as the sign-in session; needs no server row. */
export const csrfTokenFor = (sessionId: string) => createHmac('sha256', env.jwt.secret).update(`csrf:${sessionId}`).digest('hex')

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
/** A cookie is sent by the browser on its own, so writes it authenticates must carry X-CSRF-Token. */
export function requireJwtCsrf(request: Request, response: Response, next: NextFunction) {
  if (SAFE_METHODS.has(request.method) || response.locals.authenticationSource !== 'cookie') return next()
  const sessionId = (response.locals.authenticatedUser as AuthenticatedJwtUser | undefined)?.sessionId
  const received = Buffer.from(request.get('x-csrf-token') ?? '')
  const expected = Buffer.from(sessionId ? csrfTokenFor(sessionId) : '')
  if (expected.length && received.length === expected.length && timingSafeEqual(received, expected)) return next()
  return response.status(403).json({ success: false, code: 'INVALID_CSRF_TOKEN', message: 'Your sign-in changed. Reload the page and try again.' })
}

// While a temporary password is set, only these routes work (S5).
const PASSWORD_CHANGE_ROUTES = new Set([
  'GET /api/v1/auth/me', 'POST /api/v1/auth/activity', 'POST /api/v1/auth/change-password', 'POST /api/auth/logout', 'POST /auth/logout',
])
const passwordChangeRoute = (request: Request) => PASSWORD_CHANGE_ROUTES.has(`${request.method} ${request.originalUrl.split('?')[0].replace(/\/$/, '')}`)

export function verifyAccessToken(token: string, { ignoreExpiration = false } = {}): AuthenticatedJwtUser {
  const decoded = jwt.verify(token, env.jwt.secret, {
    algorithms: ['HS256'], issuer: env.jwt.issuer, audience: env.jwt.audience, ignoreExpiration,
  }) as JwtPayload
  const id = Number(decoded.accountId ?? decoded.userId ?? decoded.sub)
  const schoolId = typeof decoded.schoolId === 'string' ? decoded.schoolId : ''
  const role = decoded.role
  const authVersion = Number(decoded.authVersion ?? 1)
  if (!Number.isSafeInteger(id) || id < 1 || !schoolId || !Number.isSafeInteger(authVersion) || authVersion < 1 || !['Admin', 'Librarian', 'Student', 'Faculty', 'Staff'].includes(role)) {
    throw new Error('Token claims are invalid.')
  }
  const sessionId = typeof decoded.sessionId === 'string' ? decoded.sessionId : undefined
  return {
    id, accountId: id, schoolId, role: role as JwtRole, authVersion, ...(sessionId ? { sessionId } : {}),
    ...(decoded.deviceSession === true ? { deviceSession: true } : {}),
    ...(Number.isSafeInteger(decoded.rememberedUntil) ? { rememberedUntil: decoded.rememberedUntil as number } : {}),
  }
}

/** Check current state on every request so older bearer tokens stop working immediately. */
export function createActiveJwtAccountGuard(database: Pick<typeof db, 'execute'> = db) {
  return (request: Request, response: Response, next: NextFunction) => {
  const identity = response.locals.authenticatedUser as AuthenticatedJwtUser | undefined
  if (!identity) return response.status(401).json({ success: false, code: 'JWT_REQUIRED', message: 'Sign in again.' })
  void database.execute(
    `SELECT a.account_status,a.auth_version,a.school_id,a.role,a.must_change_password,u.account_status AS user_status
       FROM accounts a LEFT JOIN users u ON u.user_id=a.user_id WHERE a.account_id=?`, [identity.accountId],
  ).then(async ([rows]) => {
    const account = (rows as Array<Record<string, unknown>>)[0]
    if (!account || account.account_status !== 'Active' || (account.user_status && account.user_status !== 'Active')
      || Number(account.auth_version) !== identity.authVersion || account.school_id !== identity.schoolId || account.role !== identity.role) {
      response.status(401).json({ success: false, code: 'ACCOUNT_ACCESS_REVOKED', message: 'Your account access changed. Please sign in again.' })
      return
    }
    if (!identity.sessionId) { response.status(401).json({ success: false, code: 'SESSION_UPGRADE_REQUIRED', message: 'Sign in again to start your updated secure session.' }); return }
    if (identity.role==='Student' && await semesterAccessEnded(database,identity.accountId)) {
      response.status(401).json({success:false,code:'ACCOUNT_ACCESS_REVOKED',message:'Your semester has ended.'})
      return
    }
    if (identity.sessionId) {
      const devices = loginDevicesEnabled()
      if (identity.deviceSession && !devices) {
        response.status(401).json({ success: false, code: 'SESSION_EXPIRED', message: 'Sign in again to continue.' })
        return
      }
      const deadline = devices ? ` AND ${DEVICE_DEADLINE_SQL}` : ''
      const [sessions] = await database.execute(`SELECT 1 FROM library_login_sessions WHERE session_id=? AND account_id=? AND auth_version=? AND revoked_at IS NULL AND ${DEVICE_IDLE_SQL}${deadline}`, [identity.sessionId, identity.accountId, identity.authVersion])
      if (!(sessions as unknown[]).length) { response.status(401).json({ success: false, code: 'SESSION_EXPIRED', message: 'Your session expired after 10 minutes of inactivity. Sign in again.' }); return }
    }
    response.locals.mustChangePassword = account.must_change_password === true
    if (account.must_change_password === true && !passwordChangeRoute(request)) {
      response.status(403).json({ success: false, code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your temporary password to continue.' })
      return
    }
    next()
  }).catch(next)
  }
}
export const ensureActiveJwtAccount = createActiveJwtAccountGuard()

export function authenticateJwt(request: Request, response: Response, next: NextFunction) {
  const access = requestAccessToken(request)
  if (!access) return response.status(401).json({ success: false, code: 'JWT_REQUIRED', message: 'Sign in to continue.' })
  try {
    const user = verifyAccessToken(access.token)
    response.locals.authenticatedUser = user
    response.locals.authenticationType = 'jwt'
    response.locals.authenticationSource = access.source
    return next()
  } catch {
    return response.status(401).json({ success: false, code: 'JWT_INVALID', message: 'The access token is invalid or expired.' })
  }
}

export function requireJwtRoles(...roles: JwtRole[]) {
  return (_request: Request, response: Response, next: NextFunction) => {
    const user = response.locals.authenticatedUser as AuthenticatedJwtUser | undefined
    if (!user || !roles.includes(user.role)) return response.status(403).json({ success: false, code: 'JWT_ROLE_FORBIDDEN', message: 'Your role cannot access this resource.' })
    return next()
  }
}

export function requireLibraryPermission(permission: LibraryPermission) {
  return (_request: Request, response: Response, next: NextFunction) => {
    const user = response.locals.authenticatedUser as AuthenticatedJwtUser | undefined
    if (!user || !hasLibraryPermission(user.role, permission)) {
      return response.status(403).json({ success: false, code: 'JWT_ROLE_FORBIDDEN', message: 'Your role cannot access this resource.' })
    }
    return next()
  }
}
