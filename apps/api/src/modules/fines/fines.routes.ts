import { Router } from 'express'
import { finesController } from './fines.controller.ts'

export const userFinesV1Router=Router()
userFinesV1Router.get('/me',finesController.mine)
userFinesV1Router.get('/terms',finesController.terms)
userFinesV1Router.get('/receipts',finesController.receipts)
userFinesV1Router.get('/receipts/:receiptId.pdf',finesController.receiptPdf)
userFinesV1Router.get('/receipts/:receiptId',finesController.receipt)

export const adminFinesV1Router=Router()
adminFinesV1Router.get('/terms',finesController.terms)
adminFinesV1Router.get('/report.pdf',finesController.reportPdf)
adminFinesV1Router.get('/receipts/:receiptId.pdf',finesController.receiptPdf)
adminFinesV1Router.get('/receipts/:receiptId',finesController.receipt)
adminFinesV1Router.post('/receipts/:receiptId/reverse',finesController.reverseReceipt)
adminFinesV1Router.post('/infractions',finesController.issueInfraction)
adminFinesV1Router.post('/payments',finesController.payment)
adminFinesV1Router.post('/:fineId/adjustments',finesController.adjustment)
adminFinesV1Router.get('/',finesController.list)

// Legacy mock routes are intentionally retired; authenticated v1 routes are authoritative.
export const finesRouter=Router()
