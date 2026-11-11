import type { NextFunction, Request, Response } from 'express'
import { paymentsService, type createPaymentsService, type PaymentActor } from './payments.service.ts'
import type { createPaymentGatewayService } from './payments.gateway.ts'
import { paymentError } from './payments.validation.ts'

export function createPaymentsController(service: ReturnType<typeof createPaymentsService> = paymentsService,
  gateway?: ReturnType<typeof createPaymentGatewayService>) {
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
  return {
    options:handle((request,identity)=>service.options(identity,request.query)),
    quote:handle((request,identity)=>service.quote(identity,request.body)),
    prepare:handle((request,identity)=>gateway ? gateway.checkout(identity,request.body) : service.prepare(identity,request.body),202),
    check:handle((request,identity)=>{
      if (!gateway) return Promise.reject(paymentError('Online payments are currently unavailable.','ONLINE_PAYMENTS_UNAVAILABLE',503))
      return gateway.check(identity,request.params.id)
    }),
    resume:handle((request,identity)=>gateway!.resume(identity,request.params.id),202),
    cancel:handle((request,identity)=>gateway!.cancel(identity,request.params.id)),
    adminCancel:handle((request,identity)=>gateway!.cancel(identity,request.params.id,true)),
    adminCheck:handle((request,identity)=>gateway!.adminCheck(identity,request.params.id)),
    read:handle((request,identity)=>service.read(identity,request.params.id)),
    list:handle((request,identity)=>service.list(identity,request.query as Record<string,unknown>)),
    setFee:handle((request,identity)=>service.setFee(identity,request.body)),
  }
}
