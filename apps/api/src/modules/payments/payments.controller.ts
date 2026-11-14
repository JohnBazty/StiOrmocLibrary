import type { NextFunction, Request, Response } from 'express'
import { paymentsService, type createPaymentsService, type PaymentActor } from './payments.service.ts'
import type { createPaymentGatewayService } from './payments.gateway.ts'
import { paymentError } from './payments.validation.ts'
import {paymentOperations,type createPaymentOperations} from './payments.operations.ts'
import { localPaymentPreview } from './payments.preview.ts'
import { createTransactionsService } from './transactions.service.ts'

export function createPaymentsController(service: ReturnType<typeof createPaymentsService> = paymentsService,
  gateway?: ReturnType<typeof createPaymentGatewayService>,operations:ReturnType<typeof createPaymentOperations>=paymentOperations) {
  function actor(response: Response): PaymentActor {
    const user = response.locals.authenticatedUser
    return {accountId:user?.accountId ?? user?.id,role:user?.role}
  }
  function handle(run: (request: Request, actor: PaymentActor) => Promise<unknown>, status = 200) {
    return (request: Request, response: Response, next: NextFunction) => {
      void run(request,actor(response)).then(data =>
        response.status(status).set('Cache-Control','private, no-store').json({success:true,data}),
      ).catch(next)
    }
  }
  function moneyOut() {
    if (!localPaymentPreview) throw paymentError('Refunds and transfers are not enabled for this installation.', 'MONEY_OUT_SETUP_REQUIRED', 503)
    return localPaymentPreview.moneyOut
  }
  return {
    demoCheckout:handle((request,identity)=>{
      if (!localPaymentPreview) throw paymentError('Demo wallet is unavailable.', 'DEMO_WALLET_DISABLED', 503)
      return localPaymentPreview.demoCheckout(identity,request.body)
    },202),
    funds:handle((_request,identity)=>moneyOut().overview(identity)),
    draftPracticeTransfer:handle((request,identity)=>moneyOut().practice.draft(identity,request.body),201),
    confirmPracticeTransfer:handle((request,identity)=>moneyOut().practice.confirm(identity,request.params.id)),
    cancelPracticeTransfer:handle((request,identity)=>moneyOut().practice.cancel(identity,request.params.id)),
    transferFee:handle((request,identity)=>moneyOut().setTransferFee(identity,request.body)),
    refundOptions:handle((request,identity)=>moneyOut().refundOptions(identity,request.params.id)),
    draftRefund:handle((request,identity)=>moneyOut().draftRefund(identity,request.params.id,request.body),201),
    beneficiary:handle((request,identity)=>moneyOut().addBeneficiary(identity,request.body),201),
    sampleBank:handle((request,identity)=>moneyOut().setupSampleBank(identity,request.body),201),
    draftWithdrawal:handle((request,identity)=>moneyOut().draftWithdrawal(identity,request.body),201),
    submitMoneyOut:handle((request,identity)=>moneyOut().submit(identity,request.params.id),202),
    cancelMoneyOut:handle((request,identity)=>moneyOut().cancel(identity,request.params.id)),
    checkMoneyOut:handle((request,identity)=>moneyOut().check(identity,request.params.id,request.body)),
    recoverMoneyOut:handle((_request,identity)=>moneyOut().sync(identity)),
    voidFine:handle((request,identity)=>moneyOut().voidFine(identity,request.body)),
    userList:handle((request,identity)=>service.userList(identity,request.query as Record<string,unknown>)),
    sync:handle(async(_request,identity)=>localPaymentPreview ? localPaymentPreview.sync(identity) : { checked: 0, failed: 0 }),
    transactions:handle(async(request,identity)=>createTransactionsService().list(identity,request.query as Record<string,unknown>,
      localPaymentPreview ? await localPaymentPreview.transactionRows(identity) : [])),
    operations:handle((_request,identity)=>operations.status(identity)),
    readSettlement:handle((request,identity)=>operations.readSettlement(identity,request.params.id)),
    recover:handle(async(_request,identity)=>{await operations.status(identity);return operations.recover()}),
    settlement:handle((request,identity)=>operations.settlement(identity,request.params.id,request.body)),
    options:handle((request,identity)=>localPaymentPreview ? localPaymentPreview.options(identity,request.query) : service.options(identity,request.query)),
    quote:handle((request,identity)=>localPaymentPreview ? localPaymentPreview.quote(identity,request.body) : service.quote(identity,request.body)),
    prepare:handle((request,identity)=>localPaymentPreview ? localPaymentPreview.checkout(identity,request.body) : gateway ? gateway.checkout(identity,request.body) : service.prepare(identity,request.body),202),
    check:handle((request,identity)=>{
      if (localPaymentPreview) return localPaymentPreview.check(identity,request.params.id)
      if (!gateway) return Promise.reject(paymentError('Online payments are currently unavailable.','ONLINE_PAYMENTS_UNAVAILABLE',503))
      return gateway.check(identity,request.params.id)
    }),
    resume:handle((request,identity)=>localPaymentPreview ? localPaymentPreview.read(identity,request.params.id) : gateway!.resume(identity,request.params.id),202),
    cancel:handle((request,identity)=>localPaymentPreview ? localPaymentPreview.check(identity,request.params.id,true) : gateway!.cancel(identity,request.params.id)),
    adminCancel:handle((request,identity)=>localPaymentPreview ? localPaymentPreview.adminCheck(identity,request.params.id,true) : gateway!.cancel(identity,request.params.id,true)),
    adminCheck:handle((request,identity)=>localPaymentPreview ? localPaymentPreview.adminCheck(identity,request.params.id) : gateway!.adminCheck(identity,request.params.id)),
    read:handle((request,identity)=>localPaymentPreview ? localPaymentPreview.read(identity,request.params.id) : service.read(identity,request.params.id)),
    list:handle((request,identity)=>localPaymentPreview ? localPaymentPreview.adminList(identity,request.query as Record<string,unknown>) : service.list(identity,request.query as Record<string,unknown>)),
    setFee:handle((request,identity)=>service.setFee(identity,request.body)),
  }
}
