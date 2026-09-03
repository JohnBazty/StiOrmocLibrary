import type { NextFunction, Request, Response } from 'express'
import { createFineAuditPdf, createFineReceiptPdf } from './fines.pdf.ts'
import { finesService } from './fines.service.ts'
import { fineId, parseFineFilters, receiptId } from './fines.validation.ts'

function actor(response: Response) {
  const user = response.locals.authenticatedUser as { accountId?: number; id?: number; role?: string; schoolId?: string } | undefined
  return { accountId: user?.accountId ?? user?.id, role: user?.role, schoolId: user?.schoolId }
}
function handle(handler: (request: Request, response: Response) => Promise<unknown>) {
  return (request: Request, response: Response, next: NextFunction) => { void handler(request, response).catch(next) }
}
function safeFilename(value: string) { return value.replace(/[^A-Za-z0-9_-]/g, '-') }

export const finesController = {
  list: handle(async (request,response)=>response.json({success:true,data:await finesService.list(parseFineFilters(request.query as Record<string,unknown>))})),
  mine: handle(async (request,response)=>response.json({success:true,data:await finesService.mine(actor(response),parseFineFilters(request.query as Record<string,unknown>))})),
  terms: handle(async (_request,response)=>response.json({success:true,data:await finesService.terms()})),
  receipts: handle(async (_request,response)=>response.json({success:true,data:await finesService.receiptsForUser(actor(response))})),
  receipt: handle(async (request,response)=>response.json({success:true,data:await finesService.receipt(receiptId(request.params.receiptId),actor(response))})),
  issueInfraction: handle(async (request,response)=>response.status(201).json({success:true,data:await finesService.issueInfraction(actor(response),request.body)})),
  payment: handle(async (request,response)=>response.status(201).json({success:true,data:await finesService.recordCashPayment(actor(response),request.body)})),
  adjustment: handle(async (request,response)=>response.json({success:true,data:await finesService.adjust(actor(response),fineId(request.params.fineId),request.body)})),
  reverseReceipt: handle(async (request,response)=>response.json({success:true,data:await finesService.reverseReceipt(actor(response),receiptId(request.params.receiptId),request.body)})),
  reportPdf: handle(async (request,response)=>{
    const filters=parseFineFilters(request.query as Record<string,unknown>); const result=await finesService.report(filters)
    const totals=result.items.reduce((value,item)=>({assessed:value.assessed+item.assessed,collected:value.collected+item.paid,outstanding:value.outstanding+item.balance,waived:value.waived+item.adjusted}),{assessed:0,collected:0,outstanding:0,waived:0})
    const report=createFineAuditPdf(result.items,{label:result.range.label,generatedBy:actor(response).schoolId??'Authorized staff',...totals})
    response.status(200).set({'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="smartlib-fines-${safeFilename(result.range.from)}-${safeFilename(result.range.to)}.pdf"`,'Cache-Control':'private, no-store'})
    report.on('error',(error)=>response.destroy(error)).pipe(response)
  }),
  receiptPdf: handle(async (request,response)=>{
    const receipt=await finesService.receipt(receiptId(request.params.receiptId),actor(response)); const report=createFineReceiptPdf(receipt)
    const disposition=request.query.download==='1'?'attachment':'inline'
    response.status(200).set({'Content-Type':'application/pdf','Content-Disposition':`${disposition}; filename="${safeFilename(receipt.receiptNumber)}.pdf"`,'Cache-Control':'private, no-store'})
    report.on('error',(error)=>response.destroy(error)).pipe(response)
  }),
}
