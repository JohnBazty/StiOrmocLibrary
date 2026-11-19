import { Router } from 'express'
import {createWebPush,pushConfiguration} from './web-push.ts'
import { notificationController } from './notification.controller.ts'
import { requireJwtRoles } from '../auth/jwt-auth.middleware.ts'

export const userNotificationsV1Router = Router()
userNotificationsV1Router.get('/push', (_request,response)=>{const config=pushConfiguration();response.set('Cache-Control','private, no-store').json({success:true,data:{publicKey:config.privateKey?config.publicKey:''}})})
userNotificationsV1Router.post('/push/status', (request,response,next)=>{void createWebPush().status(Number(response.locals.authenticatedUser.accountId),request.body??{}).then(data=>response.json({success:true,data})).catch(next)})
userNotificationsV1Router.post('/push', (request,response,next)=>{void createWebPush().subscribe(Number(response.locals.authenticatedUser.accountId),request.body??{}).then(data=>response.json({success:true,data})).catch(next)})
userNotificationsV1Router.delete('/push', (request,response,next)=>{void createWebPush().unsubscribe(Number(response.locals.authenticatedUser.accountId),request.body??{}).then(data=>response.json({success:true,data})).catch(next)})
userNotificationsV1Router.get('/',  notificationController.list)
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
