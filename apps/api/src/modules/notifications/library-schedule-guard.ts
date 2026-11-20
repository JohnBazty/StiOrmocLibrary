import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../../core/http-error.ts'
import { libraryScheduleService } from './library-schedule.service.ts'
import { isLibraryClosedNow } from './library-schedule.validation.ts'

const PATRON_ROLES = new Set(['Student', 'Faculty'])
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Enforces view-only mode for Student and Faculty accounts whenever the library
 * is closed according to Library Schedule Maintenance (dated/timed closures or
 * weekly operating hours). Read requests and staff/librarian/admin operations
 * remain allowed.
 */
export function requireLibraryOpenForUserTransactions(
  scheduleLoader: () => Promise<Awaited<ReturnType<typeof libraryScheduleService.current>>> = () =>
    libraryScheduleService.current(),
  clock: () => Date = () => new Date(),
) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      if (READ_METHODS.has(request.method.toUpperCase())) return next()
      const role =
        (response.locals?.authenticatedUser as { role?: string } | undefined)?.role ??
        (request as Request & { auth?: { role?: string }; session?: { user?: { role?: string } } }).auth?.role ??
        (request as Request & { session?: { user?: { role?: string } } }).session?.user?.role ??
        ''
      if (!PATRON_ROLES.has(role)) return next()

      const schedule = await scheduleLoader()
      const status = isLibraryClosedNow(schedule, clock())
      if (status.closed) {
        return next(
          new HttpError(
            403,
            'LIBRARY_CLOSED_VIEW_ONLY',
            `The library is currently closed (${status.reason}). Student and faculty accounts are in view-only mode and cannot submit borrowing, check-in, reservation, or printing transactions until the library reopens.`,
          ),
        )
      }
      return next()
    } catch (error) {
      return next(error)
    }
  }
}
