import type { NextFunction, Request, Response } from 'express'
import { toCanonicalRole } from '../auth/role-normalization.ts'

/**
 * Catalog administration is session- or JWT-backed. Legacy staff aliases
 * normalize to Admin at the authentication boundary.
 */
export function requireCatalogManager(request: Request, response: Response, next: NextFunction) {
  const role = (request.session as typeof request.session & { user?: { role?: string } })?.user?.role
    ?? (response.locals.authenticatedUser as { role?: string } | undefined)?.role
  if (toCanonicalRole(role) !== 'Admin') {
    return response.status(403).json({
      success: false,
      code: 'CATALOG_ADMIN_FORBIDDEN',
      message: 'Only Admin accounts may manage catalog records.',
    })
  }
  return next()
}
