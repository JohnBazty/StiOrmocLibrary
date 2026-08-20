import { Router } from 'express'
import { adminDashboard, studentDashboard } from '../../data/mock-data.ts'
import { ok } from '../../core/http.ts'

export const dashboardRouter = Router()

dashboardRouter.get('/student', (_request, response) => ok(response, studentDashboard))
dashboardRouter.get('/admin', (_request, response) => ok(response, adminDashboard))
