import { Router } from 'express'
import { notificationController } from './notification.controller.ts'
import { requireJwtRoles } from '../auth/jwt-auth.middleware.ts'
import { libraryActivityService } from './library-activity.service.ts'

export const userNotificationsV1Router = Router()
userNotificationsV1Router.get('/activity', requireJwtRoles('Librarian'), (request, response, next) => {
  void libraryActivityService.list(response.locals.authenticatedUser?.role, request.query.category)
    .then(data => response.set('Cache-Control','private, no-store').json({success:true,data})).catch(next)
})
userNotificationsV1Router.get('/', notificationController.list)
userNotificationsV1Router.get('/schedule', notificationController.schedule)
userNotificationsV1Router.patch('/read-all', notificationController.readAll)
userNotificationsV1Router.patch('/:id/read', notificationController.read)
userNotificationsV1Router.delete('/', notificationController.removeAll)
userNotificationsV1Router.delete('/:id', notificationController.remove)

export const adminAnnouncementsV1Router = Router()
adminAnnouncementsV1Router.get('/', notificationController.announcements)
adminAnnouncementsV1Router.post('/', requireJwtRoles('Librarian', 'Staff'), notificationController.createAnnouncement)

// New clients use the authenticated /api/v1 endpoints above.
export const notificationsRouter = Router()
