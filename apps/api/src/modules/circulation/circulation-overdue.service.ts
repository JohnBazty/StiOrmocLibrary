import type { Pool, RowDataPacket } from '../../config/db.js'
import { localTimestamp } from '../attendance/attendance-intervals.ts'
import { db } from '../../config/db.js'
import { caseIf, excluded } from '../../config/sql-dialect.js'
import { calculateOperatingFine, loadFineContext } from '../fines/fine-calculator.ts'
import type { OverdueCursor } from '../job-runner/job-runner.rules.ts'

export function overdueCharge(dueAt: Date, evaluatedAt: Date) {
  const { amount,units,rate,basis }=calculateOperatingFine(dueAt,evaluatedAt)
  return { amount,units,rate,basis }
}

/** D5: `after` continues a pass from the last loan seen; `nextCursor` is null once a short batch ends the pass. */
export async function escalateOverdueTransactions(database: Pool = db, now: Date = new Date(), batchSize = 100, after: OverdueCursor | null = null) {
  const limit = Math.min(Math.max(Math.trunc(batchSize), 1), 500)
  const resume = after ? ' AND (bt.due_at, bt.transaction_id) > (?::timestamp, ?::bigint)' : ''
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT bt.transaction_id, bt.user_id, ${"(bt.due_at AT TIME ZONE 'Asia/Manila') AS due_at"}, bt.due_at::text AS due_at_key, COALESCE(t.title, m.title) AS title
         FROM borrow_transactions bt
         INNER JOIN materials m ON m.material_id = bt.material_id
         LEFT JOIN physical_copies pc ON pc.physical_copy_id = bt.physical_copy_id
         LEFT JOIN titles t ON t.title_id = pc.title_id
        WHERE bt.transaction_status IN ('Borrowed','Overdue') AND bt.lost_confirmed_at IS NULL
          AND bt.due_at IS NOT NULL AND bt.due_at < ${"(?::timestamptz AT TIME ZONE 'Asia/Manila')"}${resume}
        ORDER BY bt.due_at ASC, bt.transaction_id ASC LIMIT ${limit}
        FOR UPDATE OF bt`, after ? [now, after.dueAt, after.transactionId] : [now],
    )
    const earliest=rows.reduce((value,row)=>Math.min(value,localTimestamp(row.due_at)),now.getTime())
    const context=await loadFineContext(connection,new Date(earliest),now)
    let newlyOverdue = 0
    for (const loan of rows) {
      const charge = calculateOperatingFine(new Date(localTimestamp(loan.due_at)), now, context.policy, context.calendar)
      const [changed] = await connection.execute<import('../../config/db.js').ResultSetHeader>(
        "UPDATE borrow_transactions SET transaction_status = 'Overdue', updated_at = NOW() WHERE transaction_id = ? AND transaction_status = 'Borrowed'",
        [loan.transaction_id],
      )
      if (changed.affectedRows > 0) {
        newlyOverdue += 1
        await connection.execute(
          `INSERT INTO admin_notifications
             (event_type, actor_user_id, borrow_transaction_id, message_title, message_body)
           VALUES ('overdue_detected', ?, ?, 'Overdue material detected', ?)`,
          [loan.user_id, loan.transaction_id, `${loan.title} passed its recorded return deadline.`],
        )
      }
      await connection.execute(
        `INSERT INTO fines
           (transaction_id, user_id, fine_type, fine_amount, payment_status, calculation_basis, overdue_units, rate_applied, maximum_cap_applied, notes, updated_at)
         VALUES (?, ?, 'Overdue', ?, 'Accruing', ?, ?, ?, ?, 'Automatically calculated from the operating calendar and recorded return deadline', NOW())
         ON CONFLICT (transaction_id) DO UPDATE SET fine_amount = ${excluded('fine_amount')}, calculation_basis = ${excluded('calculation_basis')},
           overdue_units = ${excluded('overdue_units')}, rate_applied = ${excluded('rate_applied')}, maximum_cap_applied=${excluded('maximum_cap_applied')},
           payment_status=${caseIf("fines.payment_status IN ('Paid','Waived','Voided')", 'fines.payment_status', "'Accruing'")},notes = ${excluded('notes')},updated_at=NOW()`,
        [loan.transaction_id, loan.user_id, charge.amount, charge.basis, charge.units, charge.rate, charge.capApplied?context.policy.maximumPenalty:null],
      )
      await connection.execute(
        `INSERT INTO clearance_statuses
           (user_id, standing_status, reason_block_details, last_checked_at, updated_at)
         VALUES (?, 'Not Cleared', ?, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET standing_status = 'Not Cleared', reason_block_details = ${excluded('reason_block_details')},
           last_checked_at = NOW(), updated_at = NOW()`,
        [loan.user_id, `Overdue material: ${loan.title}; outstanding fine: PHP ${charge.amount.toFixed(2)}.`],
      )
    }
    await connection.commit()
    const last = rows.at(-1)
    const nextCursor: OverdueCursor | null = rows.length === limit && last ? { dueAt: String(last.due_at_key), transactionId: Number(last.transaction_id) } : null
    return { evaluatedCount: rows.length, newlyOverdue, nextCursor }
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
}
