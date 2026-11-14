import { randomBytes } from 'node:crypto'
import type { PoolConnection, ResultSetHeader, RowDataPacket } from '../../config/db.js'
import { recomputeFineStatus, refreshClearance } from '../fines/fines.service.ts'
import type { PaymentRow } from './payments.repository.ts'

export function pesos(value: string | bigint) {
  const amount = BigInt(value)
  return (amount/100n).toString()+'.'+(amount%100n).toString().padStart(2,'0')
}

/** Caller holds the attempt and obligation locks and has verified provider evidence. */
export async function settleVerifiedPayment(connection: PoolConnection, payment: PaymentRow, now: Date) {
  const principal = pesos(payment.principal_centavos)
  const date = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'})
    .format(now).replaceAll('-','')
  if (payment.print_request_id) {
    const [rows] = await connection.execute<RowDataPacket[]>(`SELECT pr.*,u.full_name,u.school_id FROM print_requests pr
      JOIN users u ON u.user_id=pr.user_id WHERE request_id=? AND pr.user_id=?`,[payment.print_request_id,payment.user_id])
    const row = rows[0]
    const number = 'XP-'+date+'-'+randomBytes(8).toString('hex').toUpperCase()
    await connection.execute(`INSERT INTO print_payment_receipts(request_id,user_id,receipt_number,verification_code,
      student_name_snapshot,school_id_snapshot,file_name_snapshot,page_count_snapshot,copies_snapshot,total_sheets_snapshot,
      print_type_snapshot,paper_size_snapshot,amount_received,payment_method,received_by_name_snapshot,received_at,
      confirmation_source,online_payment_attempt_id,transaction_fee_centavos)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'Xendit',?,'Xendit',?,?)`,
      [payment.print_request_id,payment.user_id,number,randomBytes(8).toString('hex').toUpperCase(),
        row.full_name,row.school_id,row.file_name,row.page_count,row.number_of_copies,row.total_sheets,
        row.print_type,row.paper_size,principal,payment.channel_code,now,payment.payment_id,payment.fee_centavos])
    await connection.execute("UPDATE print_requests SET payment_status='Paid',paid_at=?,updated_at=NOW(),row_version=row_version+1 WHERE request_id=?",
      [now,payment.print_request_id])
    return
  }
  const [insert] = await connection.execute<ResultSetHeader>(`INSERT INTO fine_payment_receipts(request_key,user_id,
    amount_received,payment_method,received_at,confirmation_source,online_payment_attempt_id,transaction_fee_centavos)
    VALUES(?,?,?,?,?,'Xendit',?,?) RETURNING fine_payment_receipt_id`,
    ['xendit:'+payment.payment_id,payment.user_id,principal,payment.channel_code,now,payment.payment_id,payment.fee_centavos])
  const receiptId = Number(insert.rows[0].fine_payment_receipt_id)
  await connection.execute('UPDATE fine_payment_receipts SET receipt_number=? WHERE fine_payment_receipt_id=?',
    ['XF-'+date+'-'+String(receiptId).padStart(8,'0'),receiptId])
  await connection.execute(`INSERT INTO fine_payment_allocations(fine_payment_receipt_id,fine_id,lost_book_report_id,
    amount_allocated,balance_before,balance_after) VALUES(?,?,?,?,?,?)`,
    [receiptId,payment.fine_id,payment.lost_book_report_id,principal,pesos(payment.balance_before_centavos),
      pesos(BigInt(payment.balance_before_centavos)-BigInt(payment.principal_centavos))])
  if (payment.fine_id) await recomputeFineStatus(connection,Number(payment.fine_id))
  else await connection.execute(`UPDATE lost_book_reports SET payment_status='Paid',paid_at=?,
    payment_recorded_by_user_id=NULL,updated_at=NOW() WHERE lost_book_report_id=?`,[now,payment.lost_book_report_id])
  await refreshClearance(connection,Number(payment.user_id))
}
