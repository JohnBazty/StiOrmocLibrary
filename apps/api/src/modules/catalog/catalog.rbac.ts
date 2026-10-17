import type { NextFunction, Request, Response } from 'express'

const ADMIN_ROLES = new Set(['Librarian'])

/**
 * Catalog administration is limited to the Librarian on both session and JWT routes.
 */
export function requireCatalogManager(request: Request, response: Response, next: NextFunction) {
  const role = (request.session as typeof request.session & { user?: { role?: string } })?.user?.role
    ?? (response.locals.authenticatedUser as { role?: string } | undefined)?.role
  if (!role || !ADMIN_ROLES.has(role)) {
    return response.status(403).json({
      success: false,
      code: 'CATALOG_ADMIN_FORBIDDEN',
      message: 'Only Librarian accounts may manage catalog records.',
    })
  }
  return next()
}
