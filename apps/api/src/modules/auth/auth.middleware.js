import { randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '../../config/env.js'
import { dashboardForRole } from './auth.constants.js'
import { bearerToken, verifyAccessToken } from './jwt-auth.middleware.ts'

export function createCsrfToken() {
  return randomBytes(32).toString('hex')
}

export function ensureCsrfToken(request, _response, next) {
  if (!request.session.csrfToken) request.session.csrfToken = createCsrfToken()
  next()
}

export function verifyCsrfToken(request, response, next) {
  const received = request.get('x-csrf-token') || request.body?._csrf || ''
  const expected = request.session?.csrfToken || ''
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
  // Bearer tokens are explicitly supplied by the client and are not ambient
  // browser credentials, so cookie-oriented CSRF verification is unnecessary.
  if (response.locals.authenticationType === 'jwt') return next()
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
    const token = bearerToken(request)
    if (token) {
      try {
        response.locals.authenticatedUser = verifyAccessToken(token)
        response.locals.authenticationType = 'jwt'
        return next()
      } catch {
        return response.status(401).json({ success: false, code: 'INVALID_ACCESS_TOKEN', message: 'Your access token is invalid or expired. Please sign in again.' })
      }
    }
    if (isApiRequest(request)) {
      return response.status(401).json({ success: false, code: 'AUTHENTICATION_REQUIRED', message: 'Please sign in to continue.' })
    }
    return response.redirect(303, '/login?auth=required')
  }

  const lastActivity = Number(request.session.lastActivity ?? 0)
  if (lastActivity && Date.now() - lastActivity > env.session.idleTimeoutMs) {
    return request.session.destroy(() => {
      clearSessionCookie(response)
      if (isApiRequest(request)) {
        return response.status(401).json({ success: false, code: 'SESSION_EXPIRED', message: 'Your session expired after 30 minutes of inactivity.' })
      }
      return response.redirect(303, '/login?timeout=1')
    })
  }

  request.session.lastActivity = Date.now()
  request.session.touch()
  response.locals.authenticatedUser = user
  response.locals.authenticationType = 'session'
  next()
}

export function requireRoles(...allowedRoles) {
  return (request, response, next) => {
    const role = request.session?.user?.role || response.locals.authenticatedUser?.role
    const normalizedRole = role === 'Admin' ? 'System Administrator' : role
    if (!normalizedRole || !allowedRoles.includes(normalizedRole)) {
      if (isApiRequest(request)) {
        return response.status(403).json({ success: false, code: 'FORBIDDEN', message: 'You do not have permission to access this resource.' })
      }
      return response.redirect(303, dashboardForRole(role))
    }
    next()
  }
}

export const sessionCookie = Object.freeze({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'lax',
  maxAge: env.session.idleTimeoutMs,
  path: '/',
})
