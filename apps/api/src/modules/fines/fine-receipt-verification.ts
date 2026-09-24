import { createHash } from 'node:crypto'

export type ReceiptVerificationData = {
  receiptId: number
  receiptNumber: string
  amountReceived: number
  receivedAt: unknown
  student: { schoolId: string }
}

export function receiptVerificationCode(receipt: ReceiptVerificationData) {
  return createHash('sha256')
    .update(`${receipt.receiptId}|${receipt.receiptNumber}|${receipt.student.schoolId}|${receipt.amountReceived.toFixed(2)}|${String(receipt.receivedAt)}`)
    .digest('hex')
    .slice(0, 16)
    .toUpperCase()
}
