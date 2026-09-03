import type { Pool, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { calculateOperatingFine, loadFineContext } from '../fines/fine-calculator.ts'

export function overdueCharge(dueAt: Date, evaluatedAt: Date) {
  const { amount,units,rate,basis }=calculateOperatingFine(dueAt,evaluatedAt)
  return { amount,units,rate,basis }
}

export async function escalateOverdueTransactions(database: Pool = db, now: Date = new Date(), batchSize = 100) {
  const limit = Math.min(Math.max(Math.trunc(batchSize), 1), 500)
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT bt.transaction_id, bt.user_id, bt.due_at, COALESCE(t.title, m.title) AS title
         FROM borrow_transactions bt
         INNER JOIN materials m ON m.material_id = bt.material_id
         LEFT JOIN physical_copies pc ON pc.physical_copy_id = bt.physical_copy_id
         LEFT JOIN titles t ON t.title_id = pc.title_id
        WHERE bt.transaction_status IN ('Borrowed','Overdue') AND bt.lost_confirmed_at IS NULL
          AND bt.due_at IS NOT NULL AND bt.due_at < ?
        ORDER BY bt.due_at ASC, bt.transaction_id ASC LIMIT ${limit} FOR UPDATE`, [now],
    )
    const earliest=rows.reduce((value,row)=>Math.min(value,new Date(row.due_at).getTime()),now.getTime())
    const context=await loadFineContext(connection,new Date(earliest),now)
    let newlyOverdue = 0
    for (const loan of rows) {
      const charge = calculateOperatingFine(new Date(loan.due_at), now, context.policy, context.calendar)
      const [changed] = await connection.execute<import('mysql2/promise').ResultSetHeader>(
        "UPDATE borrow_transactions SET transaction_status = 'Overdue', updated_at = NOW() WHERE transaction_id = ? AND transaction_status = 'Borrowed'",
        [loan.transaction_id],
      )
      if (changed.affectedRows > 0) {
        newlyOverdue += 1
        await connection.execute(
          `INSERT INTO admin_notifications
             (event_type, actor_user_id, borrow_transaction_id, message_title, message_body)
           VALUES ('overdue_detected', ?, ?, 'Overdue material detected', ?)`,
          [loan.user_id, loan.transaction_id, `${loan.title} passed its 8:59 AM return cutoff.`],
        )
      }
      await connection.execute(
        `INSERT INTO fines
           (transaction_id, user_id, fine_type, fine_amount, payment_status, calculation_basis, overdue_units, rate_applied, maximum_cap_applied, notes, updated_at)
         VALUES (?, ?, 'Overdue', ?, 'Accruing', ?, ?, ?, ?, 'Automatically calculated from the operating calendar and 8:59 AM cutoff', NOW())
         ON DUPLICATE KEY UPDATE fine_amount = VALUES(fine_amount), calculation_basis = VALUES(calculation_basis),
           overdue_units = VALUES(overdue_units), rate_applied = VALUES(rate_applied), maximum_cap_applied=VALUES(maximum_cap_applied),
           payment_status=IF(payment_status IN ('Paid','Waived','Voided'),payment_status,'Accruing'),notes = VALUES(notes),updated_at=NOW()`,
        [loan.transaction_id, loan.user_id, charge.amount, charge.basis, charge.units, charge.rate, charge.capApplied?context.policy.maximumPenalty:null],
      )
      await connection.execute(
        `INSERT INTO clearance_statuses
           (user_id, standing_status, reason_block_details, last_checked_at, updated_at)
         VALUES (?, 'Not Cleared', ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE standing_status = 'Not Cleared', reason_block_details = VALUES(reason_block_details),
           last_checked_at = NOW(), updated_at = NOW()`,
        [loan.user_id, `Overdue material: ${loan.title}; outstanding fine: PHP ${charge.amount.toFixed(2)}.`],
      )
    }
    await connection.commit()
    return { evaluatedCount: rows.length, newlyOverdue }
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
}
