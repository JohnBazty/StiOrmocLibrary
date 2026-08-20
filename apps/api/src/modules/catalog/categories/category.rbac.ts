import type { NextFunction, Request, Response } from 'express'

const CATEGORY_MANAGER_ROLES = new Set(['Admin', 'System Administrator', 'Librarian'])

export function requireCategoryManager(request: Request, response: Response, next: NextFunction) {
  const role = (request.session as typeof request.session & { user?: { role?: string } })?.user?.role
    ?? (response.locals.authenticatedUser as { role?: string } | undefined)?.role
  if (!role || !CATEGORY_MANAGER_ROLES.has(role)) {
    return response.status(403).json({
      success: false,
      code: 'CATEGORY_ADMIN_FORBIDDEN',
      message: 'Only Admin or Librarian accounts may manage categories.',
    })
  }
  return next()
}
