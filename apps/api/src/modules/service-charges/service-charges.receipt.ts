import PDFDocument from 'pdfkit'
import { SYSTEM_NAME } from '../../config/branding.ts'
import type { ServiceChargeReceipt } from './service-charges.service.ts'

/** Uses the existing school receipt format without describing an unpaid balance as received money. */
export function createServiceChargeReceiptPdf(receipt: ServiceChargeReceipt) {
  const document = new PDFDocument({ size: 'A4', margin: 42 })
  const blue = '#003399', yellow = '#FFF200', width = document.page.width - 84
  const money = (value: number) => `PHP ${value.toFixed(2)}`
  const date = new Date(String(receipt.receivedAt))
  const received = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
  document.rect(0, 0, document.page.width, 94).fill(blue)
  document.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12).text(SYSTEM_NAME, 42, 24, { width, lineBreak: false })
  document.fillColor(yellow).fontSize(10).text('SERVICE PAYMENT RECORD - NOT A TAX INVOICE', 42, 53)
  document.fillColor('#FFFFFF').font('Helvetica').fontSize(8).text('Cash received by authorized library personnel', 42, 70)
  document.fillColor(blue).font('Helvetica-Bold').fontSize(16).text(receipt.receiptNumber, 42, 120)
  document.fontSize(10).text(receipt.status.toUpperCase(), 42, 148)
  const details: Array<[string, string]> = [
    ['User', receipt.studentName], ['School ID', receipt.schoolId], ['Service charge', `#${receipt.chargeId}`],
    ['Received', received], ['Received by', receipt.receivedBy], ['Payment method', 'Cash'], ['Verification code', receipt.verificationCode],
  ]
  let y = 184
  for (const [label, value] of details) {
    document.font('Helvetica-Bold').fontSize(9).text(label.toUpperCase(), 42, y, { width: 128 })
    document.font('Helvetica').text(value, 176, y, { width: width - 134, height: 28, ellipsis: true })
    y += 34
  }
  document.font('Helvetica-Bold').text('SERVICE', 42, y)
  document.font('Helvetica').text(receipt.description, 42, y + 18, { width, height: 54, ellipsis: true })
  y += 92
  document.fontSize(10).text(`Balance before this payment: ${money(receipt.balanceBefore)}`, 42, y)
  document.text(`Balance after this payment: ${money(receipt.balanceAfter)}`, 42, y + 22)
  document.roundedRect(42, y + 56, width, 62, 10).fill(blue)
  document.fillColor('#FFFFFF').font('Helvetica').fontSize(10).text('CASH RECEIVED', 58, y + 68)
  document.fillColor(yellow).font('Helvetica-Bold').fontSize(20).text(money(receipt.amountPaid), 58, y + 88)
  if (receipt.status === 'Reversed') {
    document.fillColor(blue).font('Helvetica').fontSize(9).text(`Reversed: ${receipt.reversalReason ?? 'See payment history'}`, 42, y + 132, { width, height: 38, ellipsis: true })
  }
  document.fillColor(blue).font('Helvetica').fontSize(8).text('This record confirms only the cash amount received. Any remaining balance is payable separately. Reprints retain the same reference.', 42, document.page.height - 72, { width, align: 'center' })
  document.end()
  return document
}
