import { Router } from 'express'
import { dashboardController } from './dashboard.controller.ts'

export const userDashboardV1Router = Router()
userDashboardV1Router.get('/', dashboardController.user)

export const adminDashboardV1Router = Router()
adminDashboardV1Router.get('/', dashboardController.admin)
adminDashboardV1Router.get('/summary.pdf', dashboardController.adminPdf)

export const dashboardRouter = Router()

dashboardRouter.get('/student', dashboardController.user)
dashboardRouter.get('/admin', dashboardController.admin)
