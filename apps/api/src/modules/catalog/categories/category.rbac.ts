import type { NextFunction, Request, Response } from 'express'
import { toCanonicalRole } from '../../auth/role-normalization.ts'

export function requireCategoryManager(request: Request, response: Response, next: NextFunction) {
  const role = (request.session as typeof request.session & { user?: { role?: string } })?.user?.role
    ?? (response.locals.authenticatedUser as { role?: string } | undefined)?.role
  if (toCanonicalRole(role) !== 'Admin') {
    return response.status(403).json({
      success: false,
      code: 'CATEGORY_ADMIN_FORBIDDEN',
      message: 'Only Admin accounts may manage categories.',
    })
  }
  return next()
}
