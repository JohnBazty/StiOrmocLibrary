import { Router } from 'express'
import { notificationController } from './notification.controller.ts'

export const userNotificationsV1Router = Router()
userNotificationsV1Router.get('/', notificationController.list)
userNotificationsV1Router.get('/schedule', notificationController.schedule)
userNotificationsV1Router.patch('/read-all', notificationController.readAll)
userNotificationsV1Router.patch('/:id/read', notificationController.read)

export const adminAnnouncementsV1Router = Router()
adminAnnouncementsV1Router.get('/', notificationController.announcements)
adminAnnouncementsV1Router.post('/', notificationController.createAnnouncement)

// New clients use the authenticated /api/v1 endpoints above.
export const notificationsRouter = Router()
