import { printingPaidSql } from './printing-paid.ts'
import type { pricePages } from './printing-phase-one.rules.ts'
import PDFDocument from 'pdfkit'
import type { Pool, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { SYSTEM_NAME } from '../../config/branding.ts'
import { localPaymentPreview } from '../payments/payments.preview.ts'
import { previewPrint } from '../payments/preview-balances.ts'

export function invoiceAmounts(total: unknown, paid: string, job: string, balance?: unknown) {
  const amount = Number(total)
  if (!Number.isFinite(amount) || amount < 0) throw new HttpError(422,'INVOICE_INVALID','The printing amount needs staff review.')
  const status = paid==='Refunded'?'Refunded':paid==='Refund pending'?'Refund pending':job === 'Cancelled' ? 'Cancelled' : paid === 'Paid' ? 'Paid' : paid==='Partially Paid'?'Partially Paid':'Unpaid'
  return { total: amount, amountDue: ['Unpaid','Partially Paid'].includes(status) ? Number(balance??amount) : 0, status }
}
export async function printingInvoice(actor: { accountId?: number; schoolId?: string; role?: string }, value: unknown, admin = false, database: Pool = db) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(422,'INVOICE_INVALID','Choose a printing request.')
  if (!actor.schoolId || (admin && !['Librarian','Staff'].includes(String(actor.role)))) throw new HttpError(403,'INVOICE_FORBIDDEN','You cannot open this invoice.')
  const [rows] = await database.execute<RowDataPacket[]>(`SELECT pr.request_id,pr.user_id,to_jsonb(pr)->'pricing_snapshot' AS pricing_snapshot,to_jsonb(pr)->>'pricing_review_state' AS price_status,to_jsonb(pr)->>'paper_brand_snapshot' AS paper_brand,to_jsonb(pr)->>'output_mode' AS output_mode,pr.file_name,pr.page_count,pr.number_of_copies,pr.total_sheets,pr.print_type,pr.paper_size,pr.calculated_cost,pr.payment_status,pr.job_status,pr.created_at,(${printingPaidSql()}) AS amount_paid,GREATEST(0,pr.calculated_cost-(${printingPaidSql()})) AS balance,u.full_name,u.school_id,r.receipt_number,r.received_at,r.payment_method FROM print_requests pr JOIN users u ON u.user_id=pr.user_id LEFT JOIN LATERAL (SELECT * FROM print_payment_receipts receipt WHERE receipt.request_id=pr.request_id AND receipt.receipt_status='Issued' ORDER BY receipt.print_receipt_id DESC LIMIT 1) r ON TRUE WHERE pr.request_id=?${admin ? '' : ' AND u.school_id=?'} LIMIT 1`, admin ? [id] : [id,actor.schoolId])
  const row = rows[0]
  if (!row) throw new HttpError(404,'INVOICE_NOT_FOUND','This printing invoice is unavailable.')
  if(admin&&database===db&&localPaymentPreview){
    const view=(await localPaymentPreview.moneyOut.printingProjection()).find(view=>view.request_id===id&&view.user_id===Number(row.user_id))
    if(view){const projected=previewPrint({...row,request_id:id,calculated_cost:Number(row.calculated_cost),payment_status:String(row.payment_status),job_status:String(row.job_status)},[{kind:'Printing',targetId:id,principalCentavos:view.paid_centavos??0,paymentId:view.local_payment_id,voided:view.cancel_job}]);Object.assign(row,projected);if(view.refund_pending)row.payment_status='Refund pending'}
  }
  if (!admin && database === db && localPaymentPreview && actor.accountId && ['Student','Faculty'].includes(String(actor.role))) {
    const credits = await localPaymentPreview.credits(actor)
    const viewed = previewPrint({...row,request_id:Number(row.request_id),calculated_cost:Number(row.calculated_cost),payment_status:String(row.payment_status),job_status:String(row.job_status)},credits)
    row.payment_status = viewed.payment_status
    row.job_status = viewed.job_status
    row.balance = viewed.balance
  }
  return { pricing:row.pricing_snapshot as ReturnType<typeof pricePages>|null,priceStatus:row.price_status as string|null,paperBrand:row.paper_brand as string|null,outputMode:row.output_mode as string|null,full_name: String(row.full_name), school_id: String(row.school_id), file_name: String(row.file_name), page_count: Number(row.page_count), number_of_copies: Number(row.number_of_copies), total_sheets: Number(row.total_sheets), print_type: String(row.print_type), paper_size: String(row.paper_size), receipt_number: row.receipt_number ? String(row.receipt_number) : null, payment_method: row.payment_method ? String(row.payment_method) : null, invoiceNumber: `PRINT-INV-${String(id).padStart(8,'0')}`, ...invoiceAmounts(row.calculated_cost,row.payment_status,row.job_status,row.balance) }
}
export function createPrintingInvoicePdf(invoice: Awaited<ReturnType<typeof printingInvoice>>) {
  const document = new PDFDocument({size:'A4',margin:42})
  document.fontSize(14).text(SYSTEM_NAME)
  document.moveDown().fontSize(22).text('PRINTING INVOICE')
  document.fontSize(12).text(invoice.invoiceNumber).text(`Status: ${invoice.status}`)
  document.moveDown().text(`Student: ${invoice.full_name}`).text(`School ID: ${invoice.school_id}`)
  document.moveDown().text(`Document: ${invoice.file_name}`)
  document.text(`Pages: ${invoice.page_count} | Copies: ${invoice.number_of_copies} | Printed sheets: ${invoice.total_sheets}`)
  document.text(`Print type: ${invoice.print_type} | Paper: ${invoice.paper_size}`)
  if(invoice.priceStatus&&invoice.priceStatus!=='Ready')document.moveDown().fontSize(12).text(`Estimate - ${invoice.priceStatus}. Not ready for payment.`)
  if(invoice.paperBrand)document.fontSize(12).text(`Accepted paper brand: ${invoice.paperBrand}`)
  if(invoice.pricing){const bill=invoice.pricing;document.moveDown().fontSize(11).text(`Monochrome: ${bill.monoPages} pages x PHP ${(bill.monoRate/100).toFixed(2)} x ${bill.copies} copies`).text(`Colored: ${bill.colorPages} pages x PHP ${(bill.colorRate/100).toFixed(2)} x ${bill.copies} copies`).text(`Base printing: PHP ${(bill.baseCentavos/100).toFixed(2)}`).text(`Image-page additions: PHP ${(bill.imageCentavos/100).toFixed(2)}`).text(`Eligible image pages: ${bill.images.join(', ')||'None'}`).text(`Color pages: ${bill.coloredPages.join(', ')||'None'}`)}
  document.moveDown().fontSize(16).text(`Total charge: PHP ${invoice.total.toFixed(2)}`).text(`Amount due: PHP ${invoice.amountDue.toFixed(2)}`)
  if (invoice.receipt_number) document.moveDown().fontSize(11).text(`Payment reference: ${invoice.receipt_number}`).text(`Payment method: ${invoice.payment_method}`)
  document.moveDown().fontSize(10).text(invoice.status==='Refunded'?'This payment was refunded and the printing request is cancelled.':invoice.status==='Refund pending'?'A refund is awaiting confirmation. Do not pay this bill again.':['Unpaid','Partially Paid'].includes(invoice.status) ? 'This invoice is a bill, not proof of payment. Pay at the library counter.' : invoice.status === 'Cancelled' ? 'This printing request is cancelled.' : 'Payment is recorded. Keep your linked payment record for confirmation.')
  document.end()
  return document
}
