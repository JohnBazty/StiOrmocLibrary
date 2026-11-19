import { Router } from 'express'
import { libraryScheduleService } from './library-schedule.service.ts'
import { requireJwtRoles } from '../auth/jwt-auth.middleware.ts'

export const libraryScheduleRouter = Router()
libraryScheduleRouter.get('/', (_request, response, next) => {
  response.set('Cache-Control', 'private, no-store')
  void libraryScheduleService.current().then(data => response.json({ success: true, data })).catch(next)
})
libraryScheduleRouter.put('/', requireJwtRoles('Librarian'), (request, response, next) => {
  void libraryScheduleService.save(Number(response.locals.authenticatedUser.accountId), request.body).then(data => response.json({ success: true, data })).catch(next)
})
