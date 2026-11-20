import { randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '../../config/env.js'
import { dashboardForRole } from './auth.constants.js'
import { authenticateJwt, clearAccessCookie, ensureActiveJwtAccount, requestAccessToken, requireJwtCsrf, verifyAccessToken } from './jwt-auth.middleware.ts'
import { db } from '../../config/db.js'

export function createCsrfToken() {
  return randomBytes(32).toString('hex')
}

export function ensureCsrfToken(request, _response, next) {
  if (!request.session.csrfToken) request.session.csrfToken = createCsrfToken()
  next()
}

export function verifyCsrfToken(request, response, next) {
  const headerToken = request.get('x-csrf-token')
  const bodyToken = typeof request.body?._csrf === 'string' ? request.body._csrf : ''
  const received = headerToken || bodyToken
  const expected = typeof request.session?.csrfToken === 'string' ? request.session.csrfToken : ''
  const receivedBuffer = Buffer.from(received)
  const expectedBuffer = Buffer.from(expected)

  if (!received || !expected || receivedBuffer.length !== expectedBuffer.length) {
    return response.status(403).json({ success: false, code: 'INVALID_CSRF_TOKEN', message: 'Security token is invalid or expired. Refresh the page and try again.' })
  }

  if (!timingSafeEqual(receivedBuffer, expectedBuffer)) {
    return response.status(403).json({ success: false, code: 'INVALID_CSRF_TOKEN', message: 'Security token is invalid or expired. Refresh the page and try again.' })
  }

  next()
}

export function requireCsrfForStateChanges(request, response, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next()
  // Bearer tokens are not ambient credentials; a JWT read from the cookie needs its session CSRF token.
  if (response.locals.authenticationType === 'jwt') return requireJwtCsrf(request, response, next)
  return verifyCsrfToken(request, response, next)
}

function clearSessionCookie(response) {
  response.clearCookie(env.session.name, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
  })
}

function isApiRequest(request) {
  return request.originalUrl.startsWith('/api/') || request.get('accept')?.includes('application/json')
}

export function requireAuth(request, response, next) {
  const user = request.session?.user
  if (!user) {
    const access = requestAccessToken(request)
    if (access) {
      try {
        response.locals.authenticatedUser = verifyAccessToken(access.token)
        response.locals.authenticationType = 'jwt'
        response.locals.authenticationSource = access.source
        return ensureActiveJwtAccount(request, response, next)
      } catch {
        return response.status(401).json({ success: false, code: 'INVALID_ACCESS_TOKEN', message: 'Your access token is invalid or expired. Please sign in again.' })
      }
    }
    if (isApiRequest(request)) {
      return response.status(401).json({ success: false, code: 'AUTHENTICATION_REQUIRED', message: 'Please sign in to continue.' })
    }
    return response.redirect(303, '/login?auth=required')
  }

  if (['Student','Faculty'].includes(user.role)) { return response.status(401).json({ success: false, code: 'SESSION_UPGRADE_REQUIRED', message: 'Use the updated web login with school-email verification.' }) }
  const lastActivity = Number(request.session.lastActivity ?? 0)
  if (lastActivity && Date.now() - lastActivity > env.session.idleTimeoutMs) {
    return request.session.destroy(() => {
      clearSessionCookie(response)
      if (isApiRequest(request)) {
        return response.status(401).json({ success: false, code: 'SESSION_EXPIRED', message: 'Your session expired after 10 minutes of inactivity.' })
      }
      return response.redirect(303, '/login?timeout=1')
    })
  }

  void db.execute(
    `SELECT u.account_status,u.auth_version,a.account_id AS linked_account_id,a.account_status AS linked_status
       FROM users u LEFT JOIN accounts a ON a.user_id=u.user_id WHERE u.user_id=?`, [user.id],
  ).then(([rows]) => {
    const current = rows[0]
    if (!current || current.account_status !== 'Active' || (current.linked_status && current.linked_status !== 'Active')
      || Number(current.auth_version) !== Number(request.session.authVersion ?? 1)) {
      return request.session.destroy(() => {
        clearSessionCookie(response)
        if (isApiRequest(request)) return response.status(401).json({ success: false, code: 'ACCOUNT_ACCESS_REVOKED', message: 'Your account access changed. Please sign in again.' })
        return response.redirect(303, '/login?auth=required')
      })
    }
    // Background reads must not extend an unattended cookie session.
    if (request.method !== 'GET') request.session.lastActivity = Date.now()
    request.session.touch()
    response.locals.authenticatedUser = current.linked_account_id
      ? { ...user, accountId: Number(current.linked_account_id) }
      : user
    response.locals.authenticationType = 'session'
    next()
  }).catch(next)
}

export function requireRoles(...allowedRoles) {
  return (request, response, next) => {
    const role = request.session?.user?.role || response.locals.authenticatedUser?.role
    const normalizedRole = role === 'Admin' ? 'System Administrator' : role === 'Staff' ? 'Library Staff' : role
    if (!normalizedRole || !allowedRoles.includes(normalizedRole)) {
      if (isApiRequest(request)) {
        return response.status(403).json({ success: false, code: 'FORBIDDEN', message: 'You do not have permission to access this resource.' })
      }
      return response.redirect(303, dashboardForRole(role))
    }
    next()
  }
}

// Logout must revoke the JWT (Bearer or cookie), even if an unrelated express session is also present.
export function requireLogoutAuth(request, response, next) {
  const access = requestAccessToken(request)
  if (access) {
    if (access.source === 'cookie') {
      let verified
      try {
        verified = verifyAccessToken(access.token)
      } catch {
        clearAccessCookie(response)
        if (request.session?.user) return requireAuth(request, response, next)
        return response.status(401).json({ success: false, code: 'JWT_INVALID', message: 'The access token is invalid or expired.' })
      }
      response.locals.authenticatedUser = verified
      response.locals.authenticationType = 'jwt'
      response.locals.authenticationSource = 'cookie'
      // Probe active JWT state; an idle-expired or revoked JWT cookie must still be clearable and must not block a coexisting express-session sign-out.
      const probe = {
        locals: response.locals,
        status() { return probe },
        json() {
          clearAccessCookie(response)
          if (request.session?.user) {
            delete response.locals.authenticatedUser
            delete response.locals.authenticationType
            delete response.locals.authenticationSource
            return requireAuth(request, response, next)
          }
          return next()
        },
      }
      return ensureActiveJwtAccount(request, probe, next)
    }
    return authenticateJwt(request, response, () => ensureActiveJwtAccount(request, response, next))
  }
  return requireAuth(request, response, next)
}

export const sessionCookie = Object.freeze({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'lax',
  maxAge: env.session.idleTimeoutMs,
  path: '/',
})
