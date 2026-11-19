import { gcashAvailability } from './gcash-availability.ts'
import express, { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { requireCsrfForStateChanges } from '../auth/auth.middleware.js'
import { requireJwtRoles, requireLibraryPermission } from '../auth/jwt-auth.middleware.ts'
import { createPaymentsController } from './payments.controller.ts'
import { paymentsService, type createPaymentsService } from './payments.service.ts'
import { paymentGatewayService, type createPaymentGatewayService } from './payments.gateway.ts'
import {paymentOperations,type createPaymentOperations} from './payments.operations.ts'
import { localPaymentPreview } from './payments.preview.ts'

export function createPaymentsRouters(service: ReturnType<typeof createPaymentsService> = paymentsService,
  gateway: ReturnType<typeof createPaymentGatewayService> | undefined = service===paymentsService ? paymentGatewayService : undefined,
  operations:ReturnType<typeof createPaymentOperations>=paymentOperations) {
  const controller = createPaymentsController(service,gateway,operations)
  const user = Router(), admin = Router()
  const writes = rateLimit({
    windowMs:60_000,limit:20,standardHeaders:'draft-7',legacyHeaders:false,
    keyGenerator:(_request,response)=>String(response.locals.authenticatedUser?.accountId ?? 'unknown'),
    message:{success:false,code:'PAYMENT_RATE_LIMIT',message:'Wait a moment before reviewing another payment.'},
  })
  user.use(requireJwtRoles('Student','Faculty'),requireCsrfForStateChanges)
  user.get('/',controller.userList)
  user.get('/transactions',controller.transactions)
  user.get('/options',controller.options)
  user.post('/sync',writes,controller.sync)
  user.post('/quote',writes,controller.quote)
  user.post('/checkout',writes,controller.prepare)
  user.post('/demo-checkout',writes,controller.demoCheckout)
  user.get('/:id/refund-options',controller.ownerRefundOptions)
  user.post('/:id/refund-requests',writes,controller.requestRefund)
  user.post('/refund-requests/:id/withdraw',writes,controller.withdrawRefundRequest)
  user.post('/:id/check',writes,controller.check)
  user.post('/:id/resume',writes,controller.resume)
  user.post('/:id/cancel',writes,controller.cancel)
  user.get('/:id',controller.read)
  admin.use(requireCsrfForStateChanges)
  admin.get('/configuration/gcash',requireLibraryPermission('library.manage'),(_request,response,next)=>{void gcashAvailability.get().then(data=>response.set('Cache-Control','private, no-store').json({success:true,data})).catch(next)})
  admin.post('/configuration/gcash',requireLibraryPermission('library.manage'),writes,(request,response,next)=>{const user=response.locals.authenticatedUser;void gcashAvailability.save({accountId:user?.accountId??user?.id,role:user?.role},request.body).then(data=>response.json({success:true,data})).catch(next)})
  admin.get('/funds',requireLibraryPermission('library.manage'),controller.funds)
  admin.post('/funds/practice-transfers',requireLibraryPermission('library.manage'),writes,controller.draftPracticeTransfer)
  admin.post('/funds/practice-transfers/:id/confirm',requireLibraryPermission('library.manage'),writes,controller.confirmPracticeTransfer)
  admin.post('/funds/practice-transfers/:id/cancel',requireLibraryPermission('library.manage'),writes,controller.cancelPracticeTransfer)
  admin.post('/funds/transfer-fee',requireLibraryPermission('library.manage'),writes,controller.transferFee)
  admin.post('/funds/beneficiaries',requireLibraryPermission('library.manage'),writes,controller.beneficiary)
  admin.post('/funds/beneficiaries/:id',requireLibraryPermission('library.manage'),writes,controller.updateBank)
  admin.get('/refund-requests',requireLibraryPermission('library.manage'),controller.refundRequests)
  admin.get('/refund-requests-summary',requireLibraryPermission('library.manage'),controller.refundRequestSummary)
  admin.get('/refund-requests/:id',requireLibraryPermission('library.manage'),controller.refundRequestDetails)
  admin.post('/refund-requests/:id/reject',requireLibraryPermission('library.manage'),writes,controller.rejectRefundRequest)
  admin.post('/:id/refund-requests',requireLibraryPermission('library.manage'),writes,controller.requestRefund)
  admin.get('/:id/refund-options',requireLibraryPermission('library.manage'),controller.ownerRefundOptions)
  admin.post('/funds/sample-bank',requireLibraryPermission('library.manage'),writes,controller.sampleBank)
  admin.post('/funds/withdrawals',requireLibraryPermission('library.manage'),writes,controller.draftWithdrawal)
  admin.post('/funds/recover',requireLibraryPermission('library.manage'),writes,controller.recoverMoneyOut)
  admin.post('/funds/void',requireLibraryPermission('library.manage'),writes,controller.voidFine)
  admin.post('/funds/:id/confirm',requireLibraryPermission('library.manage'),writes,controller.submitMoneyOut)
  admin.post('/funds/:id/cancel',requireLibraryPermission('library.manage'),writes,controller.cancelMoneyOut)
  admin.post('/funds/:id/check',requireLibraryPermission('library.manage'),writes,controller.checkMoneyOut)
  admin.get('/:id/refunds',requireLibraryPermission('library.manage'),controller.refundOptions)
  admin.post('/:id/refunds',requireLibraryPermission('library.manage'),writes,controller.draftRefund)
  admin.get('/operations',requireLibraryPermission('library.manage'),controller.operations)
  admin.post('/recover',requireLibraryPermission('library.manage'),writes,controller.recover)
  admin.post('/:id/settlement',requireLibraryPermission('library.manage'),writes,controller.settlement)
  admin.get('/:id/settlement',requireLibraryPermission('library.manage'),controller.readSettlement)
  admin.get('/',requireLibraryPermission('desk.operate'),controller.list)
  admin.put('/fee-rules',requireLibraryPermission('library.manage'),writes,controller.setFee)
  admin.post('/:id/check',requireLibraryPermission('desk.operate'),writes,controller.adminCheck)
  admin.post('/:id/cancel',requireLibraryPermission('library.manage'),writes,controller.adminCancel)
  return {user,admin}
}

export const paymentRouters = createPaymentsRouters()

export function createPaymentWebhookRouter(gateway: ReturnType<typeof createPaymentGatewayService> = paymentGatewayService) {
  const router = Router()
  router.post('/',rateLimit({windowMs:60_000,limit:150,standardHeaders:'draft-7',legacyHeaders:false}),
    express.json({limit:'32kb'}),(request,response,next)=>{
      const received = localPaymentPreview && ['refund.succeeded','refund.failed'].includes(request.body?.event)
        ? localPaymentPreview.moneyOut.receiveRefund(request.get('x-callback-token'),request.body)
        : gateway.receive(request.get('x-callback-token'),request.body)
      void received
        .then(data=>response.status(200).set('Cache-Control','no-store').json({success:true,data})).catch(next)
    })
  return router
}
export const paymentWebhookRouter = createPaymentWebhookRouter()
