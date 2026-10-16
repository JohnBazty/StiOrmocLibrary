import PDFDocument from 'pdfkit'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { SYSTEM_NAME } from '../../config/branding.ts'

export function invoiceAmounts(total: unknown, paid: string, job: string) {
  const amount = Number(total)
  if (!Number.isFinite(amount) || amount < 0) throw new HttpError(422,'INVOICE_INVALID','The printing amount needs staff review.')
  const status = job === 'Cancelled' ? 'Cancelled' : paid === 'Paid' ? 'Paid' : 'Unpaid'
  return { total: amount, amountDue: status === 'Unpaid' ? amount : 0, status }
}
export async function printingInvoice(actor: { schoolId?: string; role?: string }, value: unknown, admin = false, database: Pool = db) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(422,'INVOICE_INVALID','Choose a printing request.')
  if (!actor.schoolId || (admin && !['Librarian','Staff'].includes(String(actor.role)))) throw new HttpError(403,'INVOICE_FORBIDDEN','You cannot open this invoice.')
  const [rows] = await database.execute<RowDataPacket[]>(`SELECT pr.request_id,pr.file_name,pr.page_count,pr.number_of_copies,pr.total_sheets,pr.print_type,pr.paper_size,pr.calculated_cost,pr.payment_status,pr.job_status,pr.created_at,u.full_name,u.school_id,r.receipt_number,r.received_at,r.payment_method FROM print_requests pr JOIN users u ON u.user_id=pr.user_id LEFT JOIN print_payment_receipts r ON r.request_id=pr.request_id AND r.receipt_status='Issued' WHERE pr.request_id=?${admin ? '' : ' AND u.school_id=?'} LIMIT 1`, admin ? [id] : [id,actor.schoolId])
  const row = rows[0]
  if (!row) throw new HttpError(404,'INVOICE_NOT_FOUND','This printing invoice is unavailable.')
  return { full_name: String(row.full_name), school_id: String(row.school_id), file_name: String(row.file_name), page_count: Number(row.page_count), number_of_copies: Number(row.number_of_copies), total_sheets: Number(row.total_sheets), print_type: String(row.print_type), paper_size: String(row.paper_size), receipt_number: row.receipt_number ? String(row.receipt_number) : null, payment_method: row.payment_method ? String(row.payment_method) : null, invoiceNumber: `PRINT-INV-${String(id).padStart(8,'0')}`, ...invoiceAmounts(row.calculated_cost,row.payment_status,row.job_status) }
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
  document.moveDown().fontSize(16).text(`Total charge: PHP ${invoice.total.toFixed(2)}`).text(`Amount due: PHP ${invoice.amountDue.toFixed(2)}`)
  if (invoice.receipt_number) document.moveDown().fontSize(11).text(`Payment reference: ${invoice.receipt_number}`).text(`Payment method: ${invoice.payment_method}`)
  document.moveDown().fontSize(10).text(invoice.status === 'Unpaid' ? 'This invoice is a bill, not proof of payment. Pay at the library counter.' : invoice.status === 'Cancelled' ? 'This printing request is cancelled.' : 'Payment is recorded. Keep your linked payment record for confirmation.')
  document.end()
  return document
}
