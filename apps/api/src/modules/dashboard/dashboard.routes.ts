import { Router } from 'express'
import { dashboardController } from './dashboard.controller.ts'

export const userDashboardV1Router = Router()
userDashboardV1Router.get('/', (request, response, next) => dashboardController.user(request, response, next))

export const adminDashboardV1Router = Router()
adminDashboardV1Router.get('/', (request, response, next) => dashboardController.admin(request, response, next))
adminDashboardV1Router.get('/summary.pdf', (request, response, next) => dashboardController.adminPdf(request, response, next))

export const dashboardRouter = Router()

dashboardRouter.get('/student', dashboardController.user)
dashboardRouter.get('/admin', dashboardController.admin)
