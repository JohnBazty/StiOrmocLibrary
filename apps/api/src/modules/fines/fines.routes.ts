import { createUrgentCases } from './urgent-cases.ts'
import { Router } from 'express'
import { conductExport } from './conduct-export.ts'
import { conductService } from './conduct.service.ts'
import type { Request, Response, NextFunction } from 'express'
import { finesController } from './fines.controller.ts'

function conductHandler(operation: (req: Request,res: Response)=>Promise<unknown>) {
  return (req:Request,res:Response,next:NextFunction)=>{res.set('Cache-Control','private, no-store');void operation(req,res).then(data=>res.json({success:true,data})).catch(next)}
}
function actor(res:Response){const u=res.locals.authenticatedUser;return {accountId:u?.accountId??u?.id,role:u?.role}}
export const userFinesV1Router=Router()
userFinesV1Router.get('/violations',conductHandler((req,res)=>conductService.list(actor(res),req.query,true)))
userFinesV1Router.get('/me',finesController.mine)
userFinesV1Router.get('/terms',finesController.terms)
userFinesV1Router.get('/receipts',finesController.receipts)
userFinesV1Router.get('/receipts/:receiptId.pdf',finesController.receiptPdf)
userFinesV1Router.get('/receipts/:receiptId',finesController.receipt)

export const adminFinesV1Router=Router()
adminFinesV1Router.get('/urgent-cases',conductHandler(()=>createUrgentCases().list()))
adminFinesV1Router.post('/urgent-settings',conductHandler((req,res)=>createUrgentCases().save(Number(actor(res).accountId),req.body)))
adminFinesV1Router.get('/terms',finesController.terms)
adminFinesV1Router.get('/report.pdf',finesController.reportPdf)
adminFinesV1Router.get('/receipts/:receiptId.pdf',finesController.receiptPdf)
adminFinesV1Router.get('/receipts/:receiptId',finesController.receipt)
adminFinesV1Router.post('/receipts/:receiptId/reverse',finesController.reverseReceipt)
adminFinesV1Router.get('/violations/report.:format',conductExport)
adminFinesV1Router.get('/violations',conductHandler((req,res)=>conductService.list(actor(res),req.query)))
adminFinesV1Router.post('/violations/preview',conductHandler((req,res)=>conductService.preview(actor(res),req.body)))
adminFinesV1Router.post('/violations',conductHandler((req,res)=>conductService.record(actor(res),req.body)))
adminFinesV1Router.post('/violations/:id/events',conductHandler((req,res)=>conductService.event(actor(res),req.params.id,req.body)))
// Legacy clients must also supply a reviewed conduct incident; no immediate-fine bypass.
adminFinesV1Router.post('/infractions',conductHandler((req,res)=>conductService.record(actor(res),req.body)))
adminFinesV1Router.post('/payments',finesController.payment)
adminFinesV1Router.post('/:fineId/adjustments',finesController.adjustment)
adminFinesV1Router.get('/',finesController.list)

// Legacy mock routes are intentionally retired; authenticated v1 routes are authoritative.
export const finesRouter=Router()
