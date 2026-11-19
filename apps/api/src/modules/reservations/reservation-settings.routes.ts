import { Router, type NextFunction, type Request, type Response } from 'express'
import { reservationSettingsService } from './reservation-settings.service.ts'

type Service = Pick<typeof reservationSettingsService, 'read' | 'save'>

/** Librarian-only; mount behind requireLibraryPermission('library.manage'). */
export function createReservationSettingsRouter(service: Service = reservationSettingsService) {
  const router = Router()
  const run = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
    res.set('Cache-Control', 'private, no-store')
    void fn(req, res).then(data => res.json({ success: true, data })).catch(next)
  }
  router.get('/', run(() => service.read()))
  router.put('/', run((req, res) => service.save(Number(res.locals.authenticatedUser.accountId), req.body)))
  return router
}

export const reservationSettingsRouter = createReservationSettingsRouter()
