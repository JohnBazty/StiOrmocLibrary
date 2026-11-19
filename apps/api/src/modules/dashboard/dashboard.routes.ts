import { Router } from 'express'
import { dashboardController } from './dashboard.controller.ts'
import { rateLimit } from 'express-rate-limit'

export const userDashboardV1Router = Router()
userDashboardV1Router.get('/', (request, response, next) => dashboardController.user(request, response, next))

export const adminDashboardV1Router = Router()
const dashboardActions = rateLimit({windowMs:60_000,limit:10,standardHeaders:'draft-8',legacyHeaders:false})
adminDashboardV1Router.get('/desk',dashboardController.deskOverview)
adminDashboardV1Router.get('/desk/tasks',dashboardController.deskTasks)
adminDashboardV1Router.get('/desk/search',rateLimit({windowMs:60_000,limit:120,standardHeaders:'draft-8',legacyHeaders:false}),dashboardController.deskSearch)
adminDashboardV1Router.get('/desk/reminders/preview',dashboardActions,dashboardController.reminderPreview)
adminDashboardV1Router.post('/desk/reminders',dashboardActions,dashboardController.queueReminders)
adminDashboardV1Router.get('/desk/export.csv',rateLimit({windowMs:60_000,limit:5,standardHeaders:'draft-8',legacyHeaders:false}),dashboardController.deskExport)
adminDashboardV1Router.get('/', (request, response, next) => dashboardController.admin(request, response, next))
adminDashboardV1Router.get('/summary.pdf', (request, response, next) => dashboardController.adminPdf(request, response, next))

export const dashboardRouter = Router()

dashboardRouter.get('/student', dashboardController.user)
dashboardRouter.get('/admin', dashboardController.admin)
