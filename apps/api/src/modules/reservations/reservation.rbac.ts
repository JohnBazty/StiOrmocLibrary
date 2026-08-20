import type { NextFunction, Request, Response } from 'express'

const MANAGER_ROLES = new Set(['Admin', 'System Administrator', 'Librarian'])
export function requireReservationManager(request: Request, response: Response, next: NextFunction) {
  const role = (request.session as typeof request.session & { user?: { role?: string } })?.user?.role
    ?? (response.locals.authenticatedUser as { role?: string } | undefined)?.role
  if (!role || !MANAGER_ROLES.has(role)) return response.status(403).json({
    success: false, code: 'RESERVATION_ADMIN_FORBIDDEN', message: 'Only Admin or Librarian accounts may manage the reservation queue.',
  })
  return next()
}
