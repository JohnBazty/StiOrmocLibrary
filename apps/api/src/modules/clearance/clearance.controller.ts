import type { NextFunction, Request, Response } from 'express'
import { clearanceService } from './clearance.service.ts'

function actor(response: Response) {
  const user = response.locals.authenticatedUser as { accountId?: number; id?: number; role?: string } | undefined
  return { accountId: user?.accountId ?? user?.id, role: user?.role }
}
function handle(handler: (request: Request, response: Response) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => { void handler(request, response).catch(next) }
}
function csv(value: unknown) { return `"${String(value ?? '').replace(/"/g, '""')}"` }

export const clearanceController = {
  mine: handle(async (_request, response) => { response.json({ success: true, data: await clearanceService.mine(actor(response)) }) }),
  list: handle(async (request, response) => { response.json({ success: true, data: await clearanceService.list(actor(response), request.query as Record<string, unknown>) }) }),
  detail: handle(async (request, response) => { response.json({ success: true, data: await clearanceService.detail(actor(response), request.params.userId) }) }),
  applyOverride: handle(async (request, response) => { response.status(201).json({ success: true, data: await clearanceService.applyOverride(actor(response), request.params.userId, request.body) }) }),
  revokeOverride: handle(async (request, response) => { response.json({ success: true, data: await clearanceService.revokeOverride(actor(response), request.params.userId, request.params.overrideId, request.body) }) }),
  reportLost: handle(async (request, response) => { response.status(201).json({ success: true, data: await clearanceService.reportLost(actor(response), request.params.transactionId) }) }),
  decideLost: handle(async (request, response) => { response.json({ success: true, data: await clearanceService.decideLost(actor(response), request.params.reportId, request.body) }) }),
  settleLost: handle(async (request, response) => { response.json({ success: true, data: await clearanceService.settleLostCharge(actor(response), request.params.reportId) }) }),
  exportCsv: handle(async (_request, response) => {
    const items = await clearanceService.exportRows(actor(response))
    const lines = [['School ID','Student','Program','Standing','Computed standing','Active loans','Overdue fines','Lost-book charges','Total outstanding','Reason'].map(csv).join(',')]
    for (const item of items) lines.push([
      item.student.schoolId, item.student.name, item.student.program, item.status, item.computedStatus,
      item.summary.activeLoans, item.summary.unpaidOverdueFines.toFixed(2), item.summary.unpaidReplacementCharges.toFixed(2),
      item.summary.totalOutstanding.toFixed(2), item.reason,
    ].map(csv).join(','))
    response.status(200).set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="smartlib-clearance.csv"', 'Cache-Control': 'no-store' }).send(`\uFEFF${lines.join('\r\n')}\r\n`)
  }),
}
