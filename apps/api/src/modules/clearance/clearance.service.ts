import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { createFinesService } from '../fines/fines.service.ts'
import { positiveId, validateLostDecision, validateOverride, validateRevocation } from './clearance.validation.ts'

export type ClearanceActor = { accountId?: number; role?: string }

function actorAccountId(actor: ClearanceActor) {
  return positiveId(actor.accountId, 'Account ID')
}

async function linkedUserId(executor: Pool | PoolConnection, accountId: number) {
  const [rows] = await executor.execute<RowDataPacket[]>('SELECT user_id FROM accounts WHERE account_id = ? AND user_id IS NOT NULL LIMIT 1', [accountId])
  const userId = rows[0]?.user_id ? Number(rows[0].user_id) : null
  if (!userId) throw new HttpError(422, 'CLEARANCE_PROFILE_NOT_LINKED', 'This login account is not linked to a library profile.')
  return userId
}

function requireStaff(actor: ClearanceActor) {
  if (!['Admin', 'Librarian'].includes(String(actor.role))) throw new HttpError(403, 'CLEARANCE_STAFF_ONLY', 'Only authorized staff can manage clearance records.')
}

export function createClearanceService(database: Pool = db) {
  async function aggregateStudents() {
    const [rows] = await database.execute<RowDataPacket[]>(
      `SELECT u.user_id,u.school_id,u.full_name,u.course_or_strand,u.section,u.account_status,
              COALESCE(loans.active_loans,0) AS active_loans,
              COALESCE(fines.unpaid_fines,0) AS unpaid_fines,
              COALESCE(losses.unpaid_replacement,0) AS unpaid_replacement,
              active_override.clearance_override_id,active_override.override_status,active_override.reason AS override_reason
         FROM users u
         LEFT JOIN (
           SELECT user_id,COUNT(*) AS active_loans FROM borrow_transactions
            WHERE transaction_status IN ('Borrowed','Overdue') AND lost_confirmed_at IS NULL GROUP BY user_id
         ) loans ON loans.user_id=u.user_id
         LEFT JOIN (
           SELECT f.user_id,SUM(GREATEST(f.fine_amount-COALESCE(payments.paid,0)-COALESCE(adjustments.adjusted,0),0)) AS unpaid_fines
             FROM fines f
             LEFT JOIN (
               SELECT a.fine_id,SUM(a.amount_allocated) AS paid FROM fine_payment_allocations a
               INNER JOIN fine_payment_receipts r ON r.fine_payment_receipt_id=a.fine_payment_receipt_id AND r.receipt_status='Issued'
               WHERE a.fine_id IS NOT NULL GROUP BY a.fine_id
             ) payments ON payments.fine_id=f.fine_id
             LEFT JOIN (SELECT fine_id,SUM(amount_adjusted) AS adjusted FROM fine_adjustments GROUP BY fine_id) adjustments ON adjustments.fine_id=f.fine_id
            WHERE f.payment_status IN ('Accruing','Unpaid','Partially Paid') GROUP BY f.user_id
         ) fines ON fines.user_id=u.user_id
         LEFT JOIN (
           SELECT user_id,SUM(replacement_charge) AS unpaid_replacement FROM lost_book_reports
            WHERE report_status='Confirmed' AND payment_status='Unpaid' GROUP BY user_id
         ) losses ON losses.user_id=u.user_id
         LEFT JOIN clearance_overrides active_override
           ON active_override.clearance_override_id=(
             SELECT recent.clearance_override_id FROM clearance_overrides recent
              WHERE recent.user_id=u.user_id AND recent.revoked_at IS NULL
                AND (recent.expires_at IS NULL OR recent.expires_at>NOW())
              ORDER BY recent.applied_at DESC,recent.clearance_override_id DESC LIMIT 1
           )
        WHERE u.user_role='Student' ORDER BY u.full_name,u.user_id`,
    )
    return rows.map((row) => {
      const activeLoans = Number(row.active_loans ?? 0)
      const unpaidFines = Number(row.unpaid_fines ?? 0)
      const unpaidReplacement = Number(row.unpaid_replacement ?? 0)
      const computedStatus = activeLoans || unpaidFines > 0 || unpaidReplacement > 0 ? 'Not Cleared' : 'Cleared'
      const status = row.override_status ? String(row.override_status) : computedStatus
      const reasons = [activeLoans ? `${activeLoans} unreturned ${activeLoans === 1 ? 'book' : 'books'}` : '', unpaidFines ? `PHP ${unpaidFines.toFixed(2)} unpaid overdue fines` : '', unpaidReplacement ? `PHP ${unpaidReplacement.toFixed(2)} unpaid lost-book replacement charges` : ''].filter(Boolean)
      return {
        student: { userId: Number(row.user_id), schoolId: String(row.school_id), name: String(row.full_name), program: row.course_or_strand ?? null, section: row.section ?? null, accountStatus: String(row.account_status) },
        status, computedStatus, reason: row.override_status ? `Authorized override: ${row.override_reason}` : reasons.join('; ') || 'No library obligations', checkedAt: new Date(),
        summary: { activeLoans, unpaidOverdueFines: unpaidFines, unpaidReplacementCharges: unpaidReplacement, totalOutstanding: unpaidFines + unpaidReplacement, blockCount: activeLoans + (unpaidFines > 0 ? 1 : 0) + (unpaidReplacement > 0 ? 1 : 0) },
        loans: [], fines: [], lostBooks: [], activeOverride: row.clearance_override_id ? { overrideId: Number(row.clearance_override_id), status: String(row.override_status), reason: String(row.override_reason) } : null, overrideHistory: [],
      }
    })
  }

  async function compute(userId: number) {
    const [[userRows], [loanRows], [fineRows], [lostRows], [overrideRows], [historyRows]] = await Promise.all([
      database.execute<RowDataPacket[]>(
        `SELECT u.user_id, u.school_id, u.full_name, u.course_or_strand, u.section, u.account_status
           FROM users u WHERE u.user_id = ? AND u.user_role IN ('Student','Faculty') LIMIT 1`, [userId],
      ),
      database.execute<RowDataPacket[]>(
        `SELECT bt.transaction_id, bt.transaction_status, bt.borrowed_at, bt.due_at,
                COALESCE(t.title,m.title) AS title, COALESCE(pc.accession_number,m.barcode) AS accession_number,
                CASE WHEN bt.due_at IS NULL OR bt.due_at >= NOW() THEN 0
                     ELSE CEIL(TIMESTAMPDIFF(SECOND,bt.due_at,NOW())/3600) END AS overdue_hours,
                GREATEST(COALESCE(f.fine_amount,0)-COALESCE(fp.paid,0)-COALESCE(fa.adjusted,0),0) AS current_fine
           FROM borrow_transactions bt INNER JOIN materials m ON m.material_id=bt.material_id
           LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id
           LEFT JOIN titles t ON t.title_id=pc.title_id
           LEFT JOIN fines f ON f.transaction_id=bt.transaction_id AND f.payment_status IN ('Accruing','Unpaid','Partially Paid')
           LEFT JOIN (SELECT a.fine_id,SUM(a.amount_allocated) AS paid FROM fine_payment_allocations a INNER JOIN fine_payment_receipts r ON r.fine_payment_receipt_id=a.fine_payment_receipt_id AND r.receipt_status='Issued' WHERE a.fine_id IS NOT NULL GROUP BY a.fine_id) fp ON fp.fine_id=f.fine_id
           LEFT JOIN (SELECT fine_id,SUM(amount_adjusted) AS adjusted FROM fine_adjustments GROUP BY fine_id) fa ON fa.fine_id=f.fine_id
          WHERE bt.user_id=? AND bt.transaction_status IN ('Borrowed','Overdue') AND bt.lost_confirmed_at IS NULL
          ORDER BY bt.due_at, bt.transaction_id`, [userId],
      ),
      database.execute<RowDataPacket[]>(
        `SELECT calculated.* FROM (
           SELECT f.fine_id,f.transaction_id,f.calculation_basis,f.overdue_units,f.rate_applied,f.applied_date,f.notes,
                  COALESCE(t.title,m.title,fi.category,'Library fine') AS title,
                  GREATEST(f.fine_amount-COALESCE(fp.paid,0)-COALESCE(fa.adjusted,0),0) AS fine_amount
             FROM fines f
             LEFT JOIN borrow_transactions bt ON bt.transaction_id=f.transaction_id
             LEFT JOIN materials m ON m.material_id=bt.material_id
             LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id
             LEFT JOIN titles t ON t.title_id=pc.title_id
             LEFT JOIN fine_infractions fi ON fi.fine_id=f.fine_id
             LEFT JOIN (SELECT a.fine_id,SUM(a.amount_allocated) AS paid FROM fine_payment_allocations a INNER JOIN fine_payment_receipts r ON r.fine_payment_receipt_id=a.fine_payment_receipt_id AND r.receipt_status='Issued' WHERE a.fine_id IS NOT NULL GROUP BY a.fine_id) fp ON fp.fine_id=f.fine_id
             LEFT JOIN (SELECT fine_id,SUM(amount_adjusted) AS adjusted FROM fine_adjustments GROUP BY fine_id) fa ON fa.fine_id=f.fine_id
            WHERE f.user_id=? AND f.payment_status IN ('Accruing','Unpaid','Partially Paid')
         ) calculated WHERE calculated.fine_amount>0 ORDER BY calculated.applied_date DESC`, [userId],
      ),
      database.execute<RowDataPacket[]>(
        `SELECT l.lost_book_report_id, l.transaction_id, l.report_status, l.purchase_price_snapshot,
                l.replacement_charge, l.payment_status, l.reported_at, l.verified_at,
                COALESCE(t.title,m.title) AS title
           FROM lost_book_reports l INNER JOIN borrow_transactions bt ON bt.transaction_id=l.transaction_id
           INNER JOIN materials m ON m.material_id=bt.material_id
           LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id
           LEFT JOIN titles t ON t.title_id=pc.title_id
          WHERE l.user_id=? ORDER BY l.reported_at DESC`, [userId],
      ),
      database.execute<RowDataPacket[]>(
        `SELECT o.clearance_override_id, o.override_status, o.reason, o.applied_at, o.expires_at,
                u.full_name AS applied_by
           FROM clearance_overrides o INNER JOIN users u ON u.user_id=o.applied_by_user_id
          WHERE o.user_id=? AND o.revoked_at IS NULL AND (o.expires_at IS NULL OR o.expires_at>NOW())
          ORDER BY o.applied_at DESC, o.clearance_override_id DESC LIMIT 1`, [userId],
      ),
      database.execute<RowDataPacket[]>(
        `SELECT o.clearance_override_id, o.override_status, o.reason, o.applied_at, o.expires_at,
                o.revoked_at, o.revocation_reason, applied.full_name AS applied_by,
                revoked.full_name AS revoked_by
           FROM clearance_overrides o INNER JOIN users applied ON applied.user_id=o.applied_by_user_id
           LEFT JOIN users revoked ON revoked.user_id=o.revoked_by_user_id
          WHERE o.user_id=? ORDER BY o.applied_at DESC, o.clearance_override_id DESC`, [userId],
      ),
    ])
    const user = userRows[0]
    if (!user) throw new HttpError(404, 'CLEARANCE_STUDENT_NOT_FOUND', 'The student profile was not found.')
    const unpaidFines = fineRows.reduce((sum, row) => sum + Number(row.fine_amount ?? 0), 0)
    const unpaidReplacement = lostRows
      .filter((row) => row.report_status === 'Confirmed' && row.payment_status === 'Unpaid')
      .reduce((sum, row) => sum + Number(row.replacement_charge ?? 0), 0)
    const activeLoans = loanRows.length
    const computedStatus = activeLoans || unpaidFines > 0 || unpaidReplacement > 0 ? 'Not Cleared' : 'Cleared'
    const activeOverride = overrideRows[0]
    const status = activeOverride?.override_status ? String(activeOverride.override_status) : computedStatus
    const reasons = [
      activeLoans ? `${activeLoans} unreturned ${activeLoans === 1 ? 'book' : 'books'}` : '',
      unpaidFines > 0 ? `PHP ${unpaidFines.toFixed(2)} unpaid overdue fines` : '',
      unpaidReplacement > 0 ? `PHP ${unpaidReplacement.toFixed(2)} unpaid lost-book replacement charges` : '',
    ].filter(Boolean)
    const reason = activeOverride ? `Authorized override: ${activeOverride.reason}` : reasons.join('; ') || 'No library obligations'
    await database.execute(
      `INSERT INTO clearance_statuses(user_id,standing_status,reason_block_details,reviewed_by_user_id,last_checked_at,updated_at)
       VALUES (?,?,?,NULL,NOW(),NOW())
       ON DUPLICATE KEY UPDATE standing_status=VALUES(standing_status),reason_block_details=VALUES(reason_block_details),
         last_checked_at=NOW(),updated_at=NOW()`, [userId, status, reason],
    )
    return {
      student: { userId: Number(user.user_id), schoolId: String(user.school_id), name: String(user.full_name), program: user.course_or_strand ?? null, section: user.section ?? null, accountStatus: String(user.account_status) },
      status, computedStatus, reason, checkedAt: new Date(),
      summary: { activeLoans, unpaidOverdueFines: unpaidFines, unpaidReplacementCharges: unpaidReplacement, totalOutstanding: unpaidFines + unpaidReplacement, blockCount: activeLoans + fineRows.length + lostRows.filter((row) => row.report_status === 'Confirmed' && row.payment_status === 'Unpaid').length },
      loans: loanRows.map((row) => ({ transactionId: Number(row.transaction_id), title: String(row.title), accessionNumber: row.accession_number, status: String(row.transaction_status), borrowedAt: row.borrowed_at, dueAt: row.due_at, overdueHours: Number(row.overdue_hours ?? 0), currentFine: Number(row.current_fine ?? 0) })),
      fines: fineRows.map((row) => ({ fineId: Number(row.fine_id), transactionId: row.transaction_id ? Number(row.transaction_id) : null, title: String(row.title), amount: Number(row.fine_amount), basis: String(row.calculation_basis), overdueUnits: Number(row.overdue_units), rate: Number(row.rate_applied), appliedAt: row.applied_date, notes: row.notes })),
      lostBooks: lostRows.map((row) => ({ lostBookReportId: Number(row.lost_book_report_id), transactionId: Number(row.transaction_id), title: String(row.title), status: String(row.report_status), purchasePrice: row.purchase_price_snapshot === null ? null : Number(row.purchase_price_snapshot), replacementCharge: Number(row.replacement_charge), paymentStatus: String(row.payment_status), reportedAt: row.reported_at, verifiedAt: row.verified_at })),
      activeOverride: activeOverride ? { overrideId: Number(activeOverride.clearance_override_id), status: String(activeOverride.override_status), reason: String(activeOverride.reason), appliedAt: activeOverride.applied_at, expiresAt: activeOverride.expires_at, appliedBy: String(activeOverride.applied_by) } : null,
      overrideHistory: historyRows.map((row) => ({ overrideId: Number(row.clearance_override_id), status: String(row.override_status), reason: String(row.reason), appliedAt: row.applied_at, expiresAt: row.expires_at, revokedAt: row.revoked_at, revocationReason: row.revocation_reason, appliedBy: String(row.applied_by), revokedBy: row.revoked_by ? String(row.revoked_by) : null })),
    }
  }

  return {
    compute,
    async mine(actor: ClearanceActor) { return compute(await linkedUserId(database, actorAccountId(actor))) },

    async list(actor: ClearanceActor, query: Record<string, unknown>) {
      requireStaff(actor)
      const page = Math.max(1, Math.trunc(Number(query.page) || 1))
      const limit = Math.min(100, Math.max(1, Math.trunc(Number(query.limit) || 25)))
      const search = typeof query.search === 'string' ? query.search.trim().slice(0, 100) : ''
      const offset = (page - 1) * limit
      const all = await aggregateStudents()
      const normalized = search.toLocaleLowerCase('en-US')
      const filtered = normalized ? all.filter((item) => `${item.student.name} ${item.student.schoolId}`.toLocaleLowerCase('en-US').includes(normalized)) : all
      const items = filtered.slice(offset, offset + limit)
      const total = filtered.length
      return {
        summary: { totalStudents: all.length, cleared: all.filter((item) => item.status === 'Cleared').length, pending: all.filter((item) => item.status !== 'Cleared').length, activeOverrides: all.filter((item) => item.activeOverride).length },
        items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      }
    },

    async exportRows(actor: ClearanceActor) { requireStaff(actor); return aggregateStudents() },

    async detail(actor: ClearanceActor, userIdValue: unknown) { requireStaff(actor); return compute(positiveId(userIdValue, 'Student ID')) },

    async applyOverride(actor: ClearanceActor, userIdValue: unknown, body: unknown) {
      requireStaff(actor)
      const userId = positiveId(userIdValue, 'Student ID')
      const input = validateOverride(body)
      const staffUserId = await linkedUserId(database, actorAccountId(actor))
      const [result] = await database.execute<ResultSetHeader>(
        `INSERT INTO clearance_overrides(user_id,override_status,reason,applied_by_user_id,applied_at,expires_at)
         VALUES (?,?,?,?,NOW(),?)`, [userId, input.status, input.reason, staffUserId, input.expiresAt],
      )
      return { overrideId: Number(result.insertId), clearance: await compute(userId) }
    },

    async revokeOverride(actor: ClearanceActor, userIdValue: unknown, overrideIdValue: unknown, body: unknown) {
      requireStaff(actor)
      const userId = positiveId(userIdValue, 'Student ID')
      const overrideId = positiveId(overrideIdValue, 'Override ID')
      const input = validateRevocation(body)
      const staffUserId = await linkedUserId(database, actorAccountId(actor))
      const [result] = await database.execute<ResultSetHeader>(
        `UPDATE clearance_overrides SET revoked_by_user_id=?,revoked_at=NOW(),revocation_reason=?
          WHERE clearance_override_id=? AND user_id=? AND revoked_at IS NULL`, [staffUserId, input.reason, overrideId, userId],
      )
      if (!result.affectedRows) throw new HttpError(404, 'CLEARANCE_OVERRIDE_NOT_FOUND', 'The active override was not found.')
      return compute(userId)
    },

    async reportLost(actor: ClearanceActor, transactionIdValue: unknown) {
      if (!['Student', 'Faculty'].includes(String(actor.role))) throw new HttpError(403, 'LOST_BOOK_REPORT_FORBIDDEN', 'Only the borrower can report a lost book.')
      const transactionId = positiveId(transactionIdValue, 'Transaction ID')
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const userId = await linkedUserId(connection, actorAccountId(actor))
        const [rows] = await connection.execute<RowDataPacket[]>(
          `SELECT bt.transaction_id,bt.user_id,bt.physical_copy_id,bt.transaction_status,
                  COALESCE(t.title,m.title) AS title,t.purchase_price
             FROM borrow_transactions bt INNER JOIN materials m ON m.material_id=bt.material_id
             LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id
             LEFT JOIN titles t ON t.title_id=pc.title_id
            WHERE bt.transaction_id=? LIMIT 1 FOR UPDATE`, [transactionId],
        )
        const loan = rows[0]
        if (!loan || Number(loan.user_id) !== userId) throw new HttpError(404, 'LOST_BOOK_LOAN_NOT_FOUND', 'The active borrowing record was not found.')
        if (!['Borrowed', 'Overdue'].includes(String(loan.transaction_status))) throw new HttpError(422, 'LOST_BOOK_REPORT_INVALID', 'Only a currently borrowed or overdue book can be reported lost.')
        const [existing] = await connection.execute<RowDataPacket[]>('SELECT lost_book_report_id,report_status FROM lost_book_reports WHERE transaction_id=? LIMIT 1 FOR UPDATE', [transactionId])
        if (existing[0]) throw new HttpError(409, 'LOST_BOOK_ALREADY_REPORTED', 'This book has already been reported lost.')
        const [insert] = await connection.execute<ResultSetHeader>(
          `INSERT INTO lost_book_reports(transaction_id,user_id,physical_copy_id,purchase_price_snapshot,replacement_charge,reported_at)
           VALUES (?,?,?,?,0,NOW())`, [transactionId, userId, loan.physical_copy_id, loan.purchase_price ?? null],
        )
        await connection.execute('UPDATE borrow_transactions SET reported_lost_at=NOW(),updated_at=NOW() WHERE transaction_id=?', [transactionId])
        await connection.execute(
          `INSERT INTO admin_notifications(event_type,actor_user_id,borrow_transaction_id,message_title,message_body)
           VALUES ('lost_book_reported',?,?, 'Lost book reported',?)`, [userId, transactionId, `${loan.title} was reported lost by its borrower.`],
        )
        await connection.execute(
          `INSERT IGNORE INTO notifications(user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at)
           VALUES (?, 'Lost book report received', ?, 'Lost Book','Lost Book Report',?,'/student/clearance','Urgent',?,NOW(),NOW())`,
          [userId, `${loan.title} has been reported lost. Library staff will verify the report and replacement charge.`, insert.insertId, `lost-report:${insert.insertId}:pending`],
        )
        await connection.commit()
        return { lostBookReportId: Number(insert.insertId), status: 'Pending', purchasePrice: loan.purchase_price === null ? null : Number(loan.purchase_price) }
      } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
    },

    async decideLost(actor: ClearanceActor, reportIdValue: unknown, body: unknown) {
      requireStaff(actor)
      const reportId = positiveId(reportIdValue, 'Lost-book report ID')
      const input = validateLostDecision(body)
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const staffUserId = await linkedUserId(connection, actorAccountId(actor))
        const [rows] = await connection.execute<RowDataPacket[]>(
          `SELECT l.*,bt.material_id,bt.physical_copy_id,COALESCE(t.title,m.title) AS title,t.purchase_price
             FROM lost_book_reports l INNER JOIN borrow_transactions bt ON bt.transaction_id=l.transaction_id
             INNER JOIN materials m ON m.material_id=bt.material_id
             LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id
             LEFT JOIN titles t ON t.title_id=pc.title_id
            WHERE l.lost_book_report_id=? LIMIT 1 FOR UPDATE`, [reportId],
        )
        const report = rows[0]
        if (!report) throw new HttpError(404, 'LOST_BOOK_REPORT_NOT_FOUND', 'The lost-book report was not found.')
        if (report.report_status !== 'Pending') throw new HttpError(422, 'LOST_BOOK_ALREADY_REVIEWED', 'This lost-book report has already been reviewed.')
        if (input.status === 'Confirmed') {
          const charge = input.replacementCharge ?? (report.purchase_price_snapshot === null ? null : Number(report.purchase_price_snapshot)) ?? (report.purchase_price === null ? null : Number(report.purchase_price))
          if (!charge || charge <= 0) throw new HttpError(422, 'LOST_BOOK_PRICE_REQUIRED', 'This legacy book has no purchase price. Enter its replacement charge before confirming the loss.')
          await connection.execute(
            `UPDATE lost_book_reports SET report_status='Confirmed',purchase_price_snapshot=?,replacement_charge=?,
               verified_by_user_id=?,verified_at=NOW(),staff_notes=?,updated_at=NOW() WHERE lost_book_report_id=?`,
            [charge, charge, staffUserId, input.notes, reportId],
          )
          await connection.execute('UPDATE borrow_transactions SET lost_confirmed_at=NOW(),updated_at=NOW() WHERE transaction_id=?', [report.transaction_id])
          if (report.physical_copy_id) await connection.execute("UPDATE physical_copies SET condition_status='Lost',availability_status='Unavailable',updated_at=NOW() WHERE physical_copy_id=?", [report.physical_copy_id])
          await connection.execute("UPDATE materials SET availability_status='Unavailable',updated_at=NOW() WHERE material_id=?", [report.material_id])
          await connection.execute(
            `INSERT INTO admin_notifications(event_type,actor_user_id,borrow_transaction_id,message_title,message_body)
             VALUES ('lost_book_confirmed',?,?, 'Lost book confirmed',?)`, [report.user_id, report.transaction_id, `${report.title} was confirmed lost. Replacement charge: PHP ${charge.toFixed(2)}.`],
          )
          await connection.execute(
            `INSERT IGNORE INTO notifications(user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at)
             VALUES (?, 'Lost book charge confirmed', ?, 'Lost Book','Lost Book Report',?,'/student/clearance','Urgent',?,NOW(),NOW())`,
            [report.user_id, `${report.title} was confirmed lost. Replacement charge: PHP ${charge.toFixed(2)}.`, reportId, `lost-report:${reportId}:confirmed`],
          )
        } else {
          await connection.execute(
            `UPDATE lost_book_reports SET report_status='Rejected',verified_by_user_id=?,verified_at=NOW(),staff_notes=?,updated_at=NOW()
              WHERE lost_book_report_id=?`, [staffUserId, input.notes, reportId],
          )
          await connection.execute('UPDATE borrow_transactions SET reported_lost_at=NULL,updated_at=NOW() WHERE transaction_id=?', [report.transaction_id])
          await connection.execute(
            `INSERT IGNORE INTO notifications(user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at)
             VALUES (?, 'Lost book report rejected', ?, 'Lost Book','Lost Book Report',?,'/student/borrowing','Important',?,NOW(),NOW())`,
            [report.user_id, `${report.title} remains an active loan. Please coordinate with the library if this is incorrect.`, reportId, `lost-report:${reportId}:rejected`],
          )
        }
        await connection.commit()
        return { lostBookReportId: reportId, status: input.status }
      } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
    },

    async settleLostCharge(actor: ClearanceActor, reportIdValue: unknown) {
      requireStaff(actor)
      const reportId = positiveId(reportIdValue, 'Lost-book report ID')
      const [rows] = await database.execute<RowDataPacket[]>(
        "SELECT replacement_charge FROM lost_book_reports WHERE lost_book_report_id=? AND report_status='Confirmed' AND payment_status='Unpaid' LIMIT 1", [reportId],
      )
      if (!rows[0]) throw new HttpError(422, 'LOST_BOOK_PAYMENT_INVALID', 'The confirmed unpaid replacement charge was not found.')
      return createFinesService(database).recordCashPayment(actor, {
        requestKey: `clearance-lost-${reportId}-${Date.now()}`,
        allocations: [{ lostBookReportId: reportId, amount: Number(rows[0].replacement_charge) }],
        notes: 'Lost-book replacement payment recorded from clearance management.',
      })
    },
  }
}

export const clearanceService = createClearanceService()
