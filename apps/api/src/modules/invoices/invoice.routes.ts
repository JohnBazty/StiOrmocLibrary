import { Router, type NextFunction, type Request, type Response } from 'express'
import PDFDocument from 'pdfkit'
import { invoiceService } from './invoice.service.ts'

function actor(response: Response) { return (response.locals.authenticatedUser as { accountId?: number } | undefined)?.accountId }
function handle(fn: (request: Request, response: Response) => Promise<void>) {
  return (request: Request, response: Response, next: NextFunction) => { void fn(request, response).catch(next) }
}
function pdf(response: Response, row: Record<string, unknown>) {
  const document = new PDFDocument({ size: 'A4', margin: 50 })
  response.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${String(row.invoice_number).replace(/[^A-Za-z0-9-]/g, '')}.pdf"`, 'Cache-Control': 'private, no-store' })
  document.pipe(response)
  document.fontSize(20).text('INVOICE', { align: 'center' }).moveDown()
  document.fontSize(12).text(String(row.issuer_name)).text(String(row.issuer_address)).text(`TIN: ${row.issuer_tin}`).text(`Authority / permit: ${row.authority_reference}`).moveDown()
  document.text(`Invoice number: ${row.invoice_number}`).text(`Issued: ${new Date(String(row.issued_at)).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}`).text(`Status: ${row.status}`).moveDown()
  document.text(`Customer: ${row.customer_name}`).text(`School ID: ${row.customer_school_id}`).moveDown()
  document.text(`Description: ${row.description}`).text(`Amount: PHP ${Number(row.amount).toFixed(2)}`)
  if (row.status === 'Voided') document.moveDown().text(`Voided: ${row.void_reason}`)
  document.end()
}

export const adminInvoiceRouter = Router()
adminInvoiceRouter.get('/', handle(async (request, response) => { response.json({ success: true, data: await invoiceService.list(request.query.limit) }) }))
adminInvoiceRouter.get('/setup', handle(async (_request, response) => { response.json({ success: true, data: await invoiceService.setup() }) }))
adminInvoiceRouter.put('/setup', handle(async (request, response) => { response.json({ success: true, data: await invoiceService.configure(request.body) }) }))
adminInvoiceRouter.post('/issue', handle(async (request, response) => { response.json({ success: true, data: await invoiceService.issue(request.body?.sourceType, request.body?.sourceId, actor(response)) }) }))
adminInvoiceRouter.post('/:invoiceId/void', handle(async (request, response) => { response.json({ success: true, data: await invoiceService.void(request.params.invoiceId, request.body?.reason, actor(response)) }) }))
adminInvoiceRouter.get('/:invoiceId', handle(async (request, response) => { response.json({ success: true, data: await invoiceService.get(request.params.invoiceId, actor(response), true) }) }))
adminInvoiceRouter.get('/:invoiceId/pdf', handle(async (request, response) => { pdf(response, await invoiceService.get(request.params.invoiceId, actor(response), true)) }))

export const userInvoiceRouter = Router()
userInvoiceRouter.get('/', handle(async (_request, response) => { response.json({ success: true, data: await invoiceService.mine(actor(response)) }) }))
userInvoiceRouter.get('/:invoiceId', handle(async (request, response) => { response.json({ success: true, data: await invoiceService.get(request.params.invoiceId, actor(response), false) }) }))
userInvoiceRouter.get('/:invoiceId/pdf', handle(async (request, response) => { pdf(response, await invoiceService.get(request.params.invoiceId, actor(response), false)) }))
