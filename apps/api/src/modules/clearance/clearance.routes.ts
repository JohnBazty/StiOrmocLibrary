import { Router } from 'express'
import { clearanceController } from './clearance.controller.ts'
import { requireJwtRoles } from '../auth/jwt-auth.middleware.ts'

export const userClearanceV1Router = Router()
userClearanceV1Router.get('/me', clearanceController.mine)
userClearanceV1Router.post('/lost-books/:transactionId/report', clearanceController.reportLost)

export const adminClearanceV1Router = Router()
adminClearanceV1Router.get('/export.csv', clearanceController.exportCsv)
adminClearanceV1Router.get('/', clearanceController.list)
adminClearanceV1Router.get('/:userId', clearanceController.detail)
adminClearanceV1Router.post('/:userId/overrides', clearanceController.applyOverride)
adminClearanceV1Router.post('/:userId/overrides/:overrideId/revoke', clearanceController.revokeOverride)
adminClearanceV1Router.patch('/lost-books/:reportId', requireJwtRoles('Librarian'), clearanceController.decideLost)
adminClearanceV1Router.patch('/lost-books/:reportId/resolution', requireJwtRoles('Librarian'), clearanceController.resolveLost)
adminClearanceV1Router.post('/lost-books/loans/:transactionId/report', requireJwtRoles('Librarian'), clearanceController.reportLost)
adminClearanceV1Router.patch('/lost-books/:reportId/payment', requireJwtRoles('Librarian'), clearanceController.settleLost)

export const clearanceRouter = Router()
