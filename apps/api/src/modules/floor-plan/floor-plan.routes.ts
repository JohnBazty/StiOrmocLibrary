import { Router, type NextFunction, type Request, type Response } from 'express'
import multer from 'multer'
import { requireJwtRoles } from '../auth/jwt-auth.middleware.ts'
import { HttpError } from '../../core/http-error.ts'
import { floorPlanImageService } from './floor-plan-image.service.ts'

const handler = (fn: (request: Request, response: Response) => Promise<unknown>) =>
  (request: Request, response: Response, next: NextFunction) => {
    void fn(request, response).then(data => response.json({ success: true, data })).catch(next)
  }

export const floorPlanRouter = Router()
floorPlanRouter.get('/image', handler(() => floorPlanImageService.current()))
floorPlanRouter.get('/location', handler(request => floorPlanImageService.location(request.query)))
floorPlanRouter.post('/image', requireJwtRoles('Admin'),
  multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: 1 } }).single('image'),
  handler((request, response) => {
    const actorId = Number(response.locals.authenticatedUser?.accountId ?? response.locals.authenticatedUser?.id)
    if (!Number.isSafeInteger(actorId) || actorId < 1) throw new HttpError(401, 'AUTH_REQUIRED', 'Sign in as an administrator.')
    return floorPlanImageService.upload(request.file, actorId)
  }),
)
