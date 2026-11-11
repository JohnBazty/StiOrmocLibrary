import type { NextFunction, Request, Response } from 'express'
import { paymentsService, type createPaymentsService, type PaymentActor } from './payments.service.ts'

export function createPaymentsController(service: ReturnType<typeof createPaymentsService> = paymentsService) {
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
    quote:handle((request,identity)=>service.quote(identity,request.body)),
    prepare:handle((request,identity)=>service.prepare(identity,request.body),202),
    read:handle((request,identity)=>service.read(identity,request.params.id)),
    list:handle((request,identity)=>service.list(identity,request.query as Record<string,unknown>)),
    setFee:handle((request,identity)=>service.setFee(identity,request.body)),
  }
}
