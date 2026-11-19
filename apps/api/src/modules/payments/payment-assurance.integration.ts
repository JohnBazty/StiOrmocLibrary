import { createPrintingPaymentAssurance } from '../printing/payment-assurance.service.ts'
import { createPrintingPaymentAssuranceRouters } from '../printing/payment-assurance.routes.ts'
import { createServiceChargesService } from '../service-charges/service-charges.service.ts'
import { createServiceChargesRouters } from '../service-charges/service-charges.routes.ts'
import { localPaymentPreview } from './payments.preview.ts'
import { db } from '../../config/db.js'
import { paymentError } from './payments.validation.ts'
import { guardCounterPayment } from './payments.guard.ts'

export const paymentAssuranceRouters=createPrintingPaymentAssuranceRouters(createPrintingPaymentAssurance(db,{
  attempt:async(actor,id,staff)=>{
    if(!localPaymentPreview)throw paymentError('The connected payment record is unavailable.','PAYMENT_NOT_FOUND',404)
    return localPaymentPreview.assuranceAttempt(actor,id,staff)
  },
}))
export const serviceChargeRouters=createServiceChargesRouters(createServiceChargesService(db,{
  withLock:run=>localPaymentPreview?localPaymentPreview.moneyOut.withPrintingLock(run):run(),
  credits:actor=>localPaymentPreview?['Student','Faculty'].includes(String(actor.role))?localPaymentPreview.credits(actor):localPaymentPreview.staffCredits(actor):Promise.resolve([]),
  guard:async(q,id)=>{
    await guardCounterPayment(q,{kind:'Other',targetId:id})
    // A private capture also needs review before receiving counter cash or cancelling its bill.
    if(localPaymentPreview&&await localPaymentPreview.hasAppliedCredit('Other',id))throw paymentError('Review the existing payment first.')
  },
}))
