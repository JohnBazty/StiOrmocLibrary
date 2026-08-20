import jwt, { type JwtPayload } from 'jsonwebtoken'
import type { NextFunction, Request, Response } from 'express'
import { env } from '../../config/env.js'
import type { JwtRole } from './jwt-auth.service.ts'

export type AuthenticatedJwtUser = { id: number; accountId: number; schoolId: string; role: JwtRole }

export function bearerToken(request: Request) {
  const authorization = request.get('authorization') ?? ''
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i)
  return match?.[1] ?? null
}

export function verifyAccessToken(token: string): AuthenticatedJwtUser {
  const decoded = jwt.verify(token, env.jwt.secret, {
    algorithms: ['HS256'], issuer: env.jwt.issuer, audience: env.jwt.audience,
  }) as JwtPayload
  const id = Number(decoded.accountId ?? decoded.userId ?? decoded.sub)
  const schoolId = typeof decoded.schoolId === 'string' ? decoded.schoolId : ''
  const role = decoded.role
  if (!Number.isSafeInteger(id) || id < 1 || !schoolId || !['Admin', 'Librarian', 'Student', 'Faculty'].includes(role)) {
    throw new Error('Token claims are invalid.')
  }
  return { id, accountId: id, schoolId, role: role as JwtRole }
}

export function authenticateJwt(request: Request, response: Response, next: NextFunction) {
  const token = bearerToken(request)
  if (!token) return response.status(401).json({ success: false, code: 'JWT_REQUIRED', message: 'A valid Bearer token is required.' })
  try {
    const user = verifyAccessToken(token)
    response.locals.authenticatedUser = user
    response.locals.authenticationType = 'jwt'
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
