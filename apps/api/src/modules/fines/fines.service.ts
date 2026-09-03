import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { fineId, parseFineFilters, receiptId, validateAdjustment, validateCashPayment, validateInfraction, validateReversal, type FineFilters } from './fines.validation.ts'

export type FineActor = { accountId?: number; role?: string }

function requireStaff(actor: FineActor) {
  if (!['Admin', 'Librarian'].includes(String(actor.role))) throw new HttpError(403, 'FINES_STAFF_ONLY', 'Only authorized staff can manage fines.')
}

function actorAccountId(actor: FineActor) {
  const value = Number(actor.accountId)
  if (!Number.isSafeInteger(value) || value < 1) throw new HttpError(401, 'FINES_LOGIN_REQUIRED', 'Sign in again to continue.')
  return value
}

async function linkedUserId(executor: Pool | PoolConnection, accountId: number) {
  const [rows] = await executor.execute<RowDataPacket[]>('SELECT user_id FROM accounts WHERE account_id=? AND user_id IS NOT NULL LIMIT 1', [accountId])
  const value = Number(rows[0]?.user_id)
  if (!Number.isSafeInteger(value) || value < 1) throw new HttpError(422, 'FINES_PROFILE_NOT_LINKED', 'This account is not linked to a library profile.')
  return value
}

function dateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return { year: get('year'), month: get('month'), day: get('day') }
}

function sqlDate(value: unknown) {
  if (value instanceof Date) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
    return `${get('year')}-${get('month')}-${get('day')}`
  }
  const text = String(value ?? '')
  return text.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? text.slice(0, 10)
}

function daysInMonth(month: string) {
  const [year, value] = month.split('-').map(Number)
  return new Date(Date.UTC(year, value, 0)).getUTCDate()
}

async function resolveRange(database: Pool, filters: FineFilters) {
  const todayParts = dateParts()
  const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`
  if (filters.period === 'all') {
    return { from: '2000-01-01', to: today, label: 'All fine records', termId: null }
  }
  if (filters.period === 'semester') {
    const parameters: Array<string|number> = []
    const where = filters.termId ? 'academic_term_id=?' : 'is_active=1 AND starts_on<=? AND ends_on>=?'
    if (filters.termId) parameters.push(filters.termId); else parameters.push(today, today)
    const [rows] = await database.execute<RowDataPacket[]>(`SELECT academic_term_id,academic_year,term_name,starts_on,ends_on FROM academic_terms WHERE ${where} ORDER BY starts_on DESC LIMIT 1`, parameters)
    const term = rows[0]
    if (!term) throw new HttpError(422, 'FINE_TERM_REQUIRED', 'Select a configured semester for this report.')
    const from = sqlDate(term.starts_on); const to = sqlDate(term.ends_on)
    return { from, to, label: `${term.term_name} ${term.academic_year}`, termId: Number(term.academic_term_id) }
  }
  if (filters.period === 'daily') {
    const value = filters.date ?? today
    return { from: value, to: value, label: value, termId: null }
  }
  if (filters.period === 'weekly') {
    const month = filters.month ?? `${todayParts.year}-${todayParts.month}`
    const week = filters.week ?? 1
    const startDay = (week - 1) * 7 + 1
    const endDay = week === 4 ? daysInMonth(month) : Math.min(startDay + 6, daysInMonth(month))
    return { from: `${month}-${String(startDay).padStart(2, '0')}`, to: `${month}-${String(endDay).padStart(2, '0')}`, label: `${month}, week ${week}`, termId: null }
  }
  if (filters.period === 'custom') {
    if (!filters.from || !filters.to || filters.from > filters.to) throw new HttpError(422, 'FINE_CUSTOM_RANGE_REQUIRED', 'Choose a valid starting and ending date.')
    return { from: filters.from, to: filters.to, label: `${filters.from} to ${filters.to}`, termId: null }
  }
  const month = filters.month ?? `${todayParts.year}-${todayParts.month}`
  return { from: `${month}-01`, to: `${month}-${String(daysInMonth(month)).padStart(2, '0')}`, label: month, termId: null }
}

type Obligation = {
  id: string; fineId: number | null; lostBookReportId: number | null; userId: number; schoolId: string; userName: string
  type: 'Overdue' | 'Infraction' | 'Lost Book'; title: string; reason: string; assessed: number; paid: number
  adjusted: number; balance: number; status: string; occurredAt: unknown; updatedAt: unknown; paymentAllowed: boolean
}

function number(value: unknown) { return Number(value ?? 0) }

async function queryObligations(database: Pool, filters: FineFilters, onlyUserId?: number) {
  const range = await resolveRange(database, filters)
  const commonParameters: Array<string|number> = [`${range.from} 00:00:00`, `${range.to} 23:59:59`]
  const userClause = onlyUserId ? ' AND f.user_id=?' : ''
  const lostUserClause = onlyUserId ? ' AND l.user_id=?' : ''
  const [fineRows] = await database.execute<RowDataPacket[]>(
    `SELECT f.fine_id,f.user_id,f.fine_type,f.fine_amount,f.payment_status,f.calculation_basis,
            f.overdue_units,f.rate_applied,f.maximum_cap_applied,f.applied_date,f.finalized_at,f.notes,f.updated_at,
            u.school_id,u.full_name,bt.transaction_status,bt.lost_confirmed_at,
            COALESCE(t.title,m.title,fi.category,'Library fine') AS source_title,
            fi.category,fi.incident_at,fi.incident_location,fi.details,
            COALESCE(payments.paid_amount,0) AS paid_amount,
            COALESCE(adjustments.adjusted_amount,0) AS adjusted_amount
       FROM fines f INNER JOIN users u ON u.user_id=f.user_id
       LEFT JOIN borrow_transactions bt ON bt.transaction_id=f.transaction_id
       LEFT JOIN materials m ON m.material_id=bt.material_id
       LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id
       LEFT JOIN titles t ON t.title_id=pc.title_id
       LEFT JOIN fine_infractions fi ON fi.fine_id=f.fine_id
       LEFT JOIN (
         SELECT a.fine_id,SUM(a.amount_allocated) AS paid_amount FROM fine_payment_allocations a
         INNER JOIN fine_payment_receipts r ON r.fine_payment_receipt_id=a.fine_payment_receipt_id AND r.receipt_status='Issued'
         WHERE a.fine_id IS NOT NULL GROUP BY a.fine_id
       ) payments ON payments.fine_id=f.fine_id
       LEFT JOIN (SELECT fine_id,SUM(amount_adjusted) AS adjusted_amount FROM fine_adjustments GROUP BY fine_id) adjustments ON adjustments.fine_id=f.fine_id
      WHERE f.applied_date BETWEEN ? AND ?${userClause}
      ORDER BY f.applied_date DESC,f.fine_id DESC LIMIT 5000`, onlyUserId ? [...commonParameters, onlyUserId] : commonParameters,
  )
  const [lostRows] = await database.execute<RowDataPacket[]>(
    `SELECT l.lost_book_report_id,l.user_id,l.replacement_charge,l.payment_status,l.reported_at,l.verified_at,l.updated_at,
            u.school_id,u.full_name,COALESCE(t.title,m.title,'Lost book') AS source_title,
            COALESCE(payments.paid_amount,0) AS paid_amount
       FROM lost_book_reports l INNER JOIN users u ON u.user_id=l.user_id
       INNER JOIN borrow_transactions bt ON bt.transaction_id=l.transaction_id
       INNER JOIN materials m ON m.material_id=bt.material_id
       LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id
       LEFT JOIN titles t ON t.title_id=pc.title_id
       LEFT JOIN (
         SELECT a.lost_book_report_id,SUM(a.amount_allocated) AS paid_amount FROM fine_payment_allocations a
         INNER JOIN fine_payment_receipts r ON r.fine_payment_receipt_id=a.fine_payment_receipt_id AND r.receipt_status='Issued'
         WHERE a.lost_book_report_id IS NOT NULL GROUP BY a.lost_book_report_id
       ) payments ON payments.lost_book_report_id=l.lost_book_report_id
      WHERE l.report_status='Confirmed' AND COALESCE(l.verified_at,l.reported_at) BETWEEN ? AND ?${lostUserClause}
      ORDER BY COALESCE(l.verified_at,l.reported_at) DESC,l.lost_book_report_id DESC LIMIT 5000`, onlyUserId ? [...commonParameters, onlyUserId] : commonParameters,
  )
  const obligations: Obligation[] = fineRows.map((row) => {
    const assessed = number(row.fine_amount); const paid = number(row.paid_amount); const adjusted = number(row.adjusted_amount)
    const balance = Math.max(0, assessed - paid - adjusted)
    const accruing = row.fine_type === 'Overdue' && ['Borrowed', 'Overdue'].includes(String(row.transaction_status)) && !row.lost_confirmed_at
    const status = accruing ? 'Accruing' : row.payment_status === 'Accruing' ? 'Unpaid' : String(row.payment_status)
    const reason = row.fine_type === 'Infraction'
      ? `${row.category}: ${row.details}`
      : `${row.overdue_units} ${String(row.calculation_basis).toLowerCase()} unit(s) at PHP ${number(row.rate_applied).toFixed(2)}`
    return {
      id: `F-${row.fine_id}`, fineId: Number(row.fine_id), lostBookReportId: null, userId: Number(row.user_id), schoolId: String(row.school_id), userName: String(row.full_name),
      type: String(row.fine_type) as 'Overdue' | 'Infraction', title: String(row.source_title), reason, assessed, paid, adjusted, balance,
      status, occurredAt: row.incident_at ?? row.applied_date, updatedAt: row.updated_at ?? row.applied_date,
      paymentAllowed: !accruing && balance > 0 && !['Waived', 'Voided'].includes(status),
    }
  })
  obligations.push(...lostRows.map((row) => {
    const assessed = number(row.replacement_charge); const paid = number(row.paid_amount); const balance = Math.max(0, assessed - paid)
    return {
      id: `L-${row.lost_book_report_id}`, fineId: null, lostBookReportId: Number(row.lost_book_report_id), userId: Number(row.user_id), schoolId: String(row.school_id), userName: String(row.full_name),
      type: 'Lost Book' as const, title: String(row.source_title), reason: 'Confirmed lost-book replacement charge', assessed, paid, adjusted: 0, balance,
      status: String(row.payment_status), occurredAt: row.verified_at ?? row.reported_at, updatedAt: row.updated_at ?? row.verified_at ?? row.reported_at,
      paymentAllowed: row.payment_status !== 'Paid' && balance > 0,
    }
  }))
  const needle = filters.search.toLocaleLowerCase('en-US')
  const filtered = obligations.filter((item) => {
    if (filters.type !== 'all' && item.type !== filters.type) return false
    if (filters.status !== 'all' && item.status !== filters.status) return false
    return !needle || [item.id,item.userName,item.schoolId,item.title,item.reason].some((value) => value.toLocaleLowerCase('en-US').includes(needle))
  }).sort((left, right) => new Date(String(right.occurredAt)).getTime() - new Date(String(left.occurredAt)).getTime())
  return { range, items: filtered }
}

async function recomputeFineStatus(connection: PoolConnection, targetFineId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT f.fine_amount,f.payment_status,
            COALESCE((SELECT SUM(a.amount_allocated) FROM fine_payment_allocations a INNER JOIN fine_payment_receipts r
              ON r.fine_payment_receipt_id=a.fine_payment_receipt_id AND r.receipt_status='Issued' WHERE a.fine_id=f.fine_id),0) AS paid,
            COALESCE((SELECT SUM(amount_adjusted) FROM fine_adjustments WHERE fine_id=f.fine_id),0) AS adjusted,
            EXISTS(SELECT 1 FROM fine_adjustments WHERE fine_id=f.fine_id AND adjustment_type='Void') AS is_void
       FROM fines f WHERE f.fine_id=? LIMIT 1 FOR UPDATE`, [targetFineId],
  )
  const row = rows[0]
  if (!row) throw new HttpError(404, 'FINE_NOT_FOUND', 'The fine was not found.')
  const remaining = Math.max(0, number(row.fine_amount) - number(row.paid) - number(row.adjusted))
  const status = Number(row.is_void) ? 'Voided' : remaining <= 0 ? (number(row.adjusted) > 0 ? 'Waived' : 'Paid') : number(row.paid) > 0 ? 'Partially Paid' : 'Unpaid'
  await connection.execute('UPDATE fines SET payment_status=?,paid_at=IF(?=\'Paid\',NOW(),NULL),updated_at=NOW() WHERE fine_id=?', [status, status, targetFineId])
  return { status, remaining, paid: number(row.paid), adjusted: number(row.adjusted), assessed: number(row.fine_amount) }
}

async function refreshClearance(connection: PoolConnection, userId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT
       EXISTS(SELECT 1 FROM borrow_transactions WHERE user_id=? AND transaction_status IN ('Borrowed','Overdue') AND lost_confirmed_at IS NULL) AS has_loan,
       EXISTS(SELECT 1 FROM fines WHERE user_id=? AND payment_status IN ('Accruing','Unpaid','Partially Paid') AND fine_amount>0) AS has_fine,
       EXISTS(SELECT 1 FROM lost_book_reports WHERE user_id=? AND report_status='Confirmed' AND payment_status='Unpaid') AS has_loss`,
    [userId,userId,userId],
  )
  const blocked = Number(rows[0]?.has_loan) || Number(rows[0]?.has_fine) || Number(rows[0]?.has_loss)
  await connection.execute(
    `INSERT INTO clearance_statuses(user_id,standing_status,reason_block_details,last_checked_at,updated_at)
     VALUES (?,?,?,NOW(),NOW()) ON DUPLICATE KEY UPDATE standing_status=VALUES(standing_status),reason_block_details=VALUES(reason_block_details),last_checked_at=NOW(),updated_at=NOW()`,
    [userId, blocked ? 'Not Cleared' : 'Cleared', blocked ? 'Outstanding library obligations remain.' : 'No outstanding library obligations.'],
  )
}

export function createFinesService(database: Pool = db) {
  async function receiptDetail(targetReceiptId: number, actor?: FineActor) {
    const [rows] = await database.execute<RowDataPacket[]>(
      `SELECT r.*,u.school_id,u.full_name,staff.full_name AS received_by,reverser.full_name AS reversed_by
         FROM fine_payment_receipts r INNER JOIN users u ON u.user_id=r.user_id
         INNER JOIN users staff ON staff.user_id=r.received_by_user_id
         LEFT JOIN users reverser ON reverser.user_id=r.reversed_by_user_id
        WHERE r.fine_payment_receipt_id=? LIMIT 1`, [targetReceiptId],
    )
    const receipt = rows[0]
    if (!receipt) throw new HttpError(404, 'FINE_RECEIPT_NOT_FOUND', 'The payment receipt was not found.')
    if (actor && !['Admin','Librarian'].includes(String(actor.role))) {
      const userId = await linkedUserId(database, actorAccountId(actor))
      if (Number(receipt.user_id) !== userId) throw new HttpError(403, 'FINE_RECEIPT_NOT_OWNED', 'You cannot access another user’s receipt.')
    }
    const [allocations] = await database.execute<RowDataPacket[]>(
      `SELECT a.amount_allocated,a.balance_before,a.balance_after,a.fine_id,a.lost_book_report_id,
              CASE WHEN a.fine_id IS NOT NULL THEN f.fine_type ELSE 'Lost Book' END AS obligation_type,
              COALESCE(t.title,m.title,fi.category,lt.title,lm.title,'Library obligation') AS source_title,
              COALESCE(f.fine_amount,l.replacement_charge,0) AS assessed_amount
         FROM fine_payment_allocations a
         LEFT JOIN fines f ON f.fine_id=a.fine_id
         LEFT JOIN fine_infractions fi ON fi.fine_id=f.fine_id
         LEFT JOIN borrow_transactions bt ON bt.transaction_id=f.transaction_id
         LEFT JOIN materials m ON m.material_id=bt.material_id
         LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id
         LEFT JOIN titles t ON t.title_id=pc.title_id
         LEFT JOIN lost_book_reports l ON l.lost_book_report_id=a.lost_book_report_id
         LEFT JOIN borrow_transactions lbt ON lbt.transaction_id=l.transaction_id
         LEFT JOIN materials lm ON lm.material_id=lbt.material_id
         LEFT JOIN physical_copies lpc ON lpc.physical_copy_id=lbt.physical_copy_id
         LEFT JOIN titles lt ON lt.title_id=lpc.title_id
        WHERE a.fine_payment_receipt_id=? ORDER BY a.fine_payment_allocation_id`, [targetReceiptId],
    )
    return {
      receiptId: Number(receipt.fine_payment_receipt_id), receiptNumber: String(receipt.receipt_number), requestKey: String(receipt.request_key),
      student: { userId: Number(receipt.user_id), schoolId: String(receipt.school_id), name: String(receipt.full_name) },
      amountReceived: number(receipt.amount_received), paymentMethod: 'Cash' as const, receivedBy: String(receipt.received_by), receivedAt: receipt.received_at,
      status: String(receipt.receipt_status), reversedBy: receipt.reversed_by ? String(receipt.reversed_by) : null, reversedAt: receipt.reversed_at, reversalReason: receipt.reversal_reason,
      notes: receipt.notes,
      allocations: allocations.map((item) => ({ fineId: item.fine_id ? Number(item.fine_id) : null, lostBookReportId: item.lost_book_report_id ? Number(item.lost_book_report_id) : null, type: String(item.obligation_type), title: String(item.source_title), assessed: number(item.assessed_amount), paid: number(item.amount_allocated), balanceBefore: number(item.balance_before), balanceAfter: number(item.balance_after) })),
    }
  }

  async function list(filters: FineFilters, onlyUserId?: number) {
    const result = await queryObligations(database, filters, onlyUserId)
    const total = result.items.length; const start = (filters.page - 1) * filters.limit
    const summary = result.items.reduce((value, item) => ({
      assessed: value.assessed + item.assessed, outstanding: value.outstanding + item.balance,
      collected: value.collected + item.paid, waived: value.waived + item.adjusted,
      accounts: item.balance > 0 ? value.accounts.add(item.userId) : value.accounts,
    }), { assessed: 0, outstanding: 0, collected: 0, waived: 0, accounts: new Set<number>() })
    return {
      range: result.range,
      summary: { assessed: summary.assessed, outstanding: summary.outstanding, collected: summary.collected, waived: summary.waived, accountsWithBalance: summary.accounts.size },
      items: result.items.slice(start, start + filters.limit),
      pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.max(1, Math.ceil(total / filters.limit)) },
    }
  }

  return {
    filters: parseFineFilters,
    async terms() {
      const [rows] = await database.execute<RowDataPacket[]>('SELECT academic_term_id,academic_year,term_name,starts_on,ends_on,is_active FROM academic_terms ORDER BY starts_on DESC')
      return rows.map((row) => ({ id: Number(row.academic_term_id), academicYear: String(row.academic_year), name: String(row.term_name), startsOn: row.starts_on, endsOn: row.ends_on, active: Boolean(row.is_active) }))
    },
    list,
    async mine(actor: FineActor, filters: FineFilters) { return list(filters, await linkedUserId(database, actorAccountId(actor))) },
    async report(filters: FineFilters) { return queryObligations(database, filters) },
    async issueInfraction(actor: FineActor, body: unknown) {
      requireStaff(actor); const input = validateInfraction(body); const connection = await database.getConnection()
      try {
        await connection.beginTransaction(); const staffUserId = await linkedUserId(connection, actorAccountId(actor))
        const [users] = await connection.execute<RowDataPacket[]>("SELECT user_id,full_name FROM users WHERE school_id=? AND user_role IN ('Student','Faculty') AND account_status='Active' LIMIT 1 FOR UPDATE", [input.schoolId])
        if (!users[0]) throw new HttpError(404, 'FINE_USER_NOT_FOUND', 'The active student or faculty account was not found.')
        const targetUserId=Number(users[0].user_id)
        const [insert] = await connection.execute<ResultSetHeader>(
          `INSERT INTO fines(transaction_id,user_id,fine_type,fine_amount,payment_status,calculation_basis,overdue_units,rate_applied,applied_date,finalized_at,notes,updated_at)
           VALUES (NULL,?,'Infraction',?,'Unpaid','Manual',1,?,NOW(),NOW(),?,NOW())`, [targetUserId,input.amount,input.amount,`${input.category}: ${input.details}`],
        )
        await connection.execute(
          'INSERT INTO fine_infractions(fine_id,category,incident_at,incident_location,details,issued_by_user_id) VALUES (?,?,?,?,?,?)',
          [insert.insertId,input.category,input.incidentAt,input.location,input.details,staffUserId],
        )
        await connection.execute(
          `INSERT IGNORE INTO notifications(user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at)
           VALUES (?,'Library fine issued',?,'Fine','Fine',?,'/student/fines','Important',?,NOW(),NOW())`,
          [targetUserId,`${input.category} fine: PHP ${input.amount.toFixed(2)}.`,insert.insertId,`fine:${insert.insertId}:issued`],
        )
        await refreshClearance(connection,targetUserId); await connection.commit()
        return { fineId: Number(insert.insertId), status: 'Unpaid' }
      } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
    },
    async recordCashPayment(actor: FineActor, body: unknown) {
      requireStaff(actor); const input = validateCashPayment(body)
      const [existing] = await database.execute<RowDataPacket[]>('SELECT fine_payment_receipt_id FROM fine_payment_receipts WHERE request_key=? LIMIT 1', [input.requestKey])
      if (existing[0]) return receiptDetail(Number(existing[0].fine_payment_receipt_id))
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction(); const staffUserId = await linkedUserId(connection, actorAccountId(actor))
        let ownerUserId: number | null = null; let total = 0
        const prepared: Array<(typeof input.allocations)[number] & { balanceBefore: number; balanceAfter: number }> = []
        for (const allocation of input.allocations) {
          if (allocation.fineId) {
            const [rows] = await connection.execute<RowDataPacket[]>(
              `SELECT f.fine_id,f.user_id,f.fine_amount,f.payment_status,f.fine_type,bt.transaction_status,bt.lost_confirmed_at,
                      COALESCE((SELECT SUM(a.amount_allocated) FROM fine_payment_allocations a INNER JOIN fine_payment_receipts r ON r.fine_payment_receipt_id=a.fine_payment_receipt_id AND r.receipt_status='Issued' WHERE a.fine_id=f.fine_id),0) AS paid,
                      COALESCE((SELECT SUM(amount_adjusted) FROM fine_adjustments WHERE fine_id=f.fine_id),0) AS adjusted
                 FROM fines f LEFT JOIN borrow_transactions bt ON bt.transaction_id=f.transaction_id WHERE f.fine_id=? LIMIT 1 FOR UPDATE`, [allocation.fineId],
            )
            const fine = rows[0]; if (!fine) throw new HttpError(404, 'FINE_NOT_FOUND', 'A selected fine was not found.')
            if (fine.fine_type === 'Overdue' && ['Borrowed','Overdue'].includes(String(fine.transaction_status)) && !fine.lost_confirmed_at) throw new HttpError(422, 'FINE_STILL_ACCRUING', 'Return the overdue book before accepting payment for its changing fine.')
            if (['Waived','Voided','Paid'].includes(String(fine.payment_status))) throw new HttpError(422, 'FINE_ALREADY_SETTLED', 'A selected fine is already settled.')
            const remaining = Math.max(0,number(fine.fine_amount)-number(fine.paid)-number(fine.adjusted))
            if (allocation.amount > remaining + 0.001) throw new HttpError(422, 'FINE_PAYMENT_EXCEEDS_BALANCE', 'A payment allocation exceeds the remaining fine balance.')
            prepared.push({ ...allocation, balanceBefore: remaining, balanceAfter: Math.max(0, remaining-allocation.amount) })
            ownerUserId ??= Number(fine.user_id); if (ownerUserId !== Number(fine.user_id)) throw new HttpError(422, 'FINE_PAYMENT_MIXED_USERS', 'One receipt cannot contain obligations from different users.')
          } else {
            const [rows] = await connection.execute<RowDataPacket[]>(
              `SELECT l.lost_book_report_id,l.user_id,l.replacement_charge,l.payment_status,
                      COALESCE((SELECT SUM(a.amount_allocated) FROM fine_payment_allocations a INNER JOIN fine_payment_receipts r ON r.fine_payment_receipt_id=a.fine_payment_receipt_id AND r.receipt_status='Issued' WHERE a.lost_book_report_id=l.lost_book_report_id),0) AS paid
                 FROM lost_book_reports l WHERE l.lost_book_report_id=? AND l.report_status='Confirmed' LIMIT 1 FOR UPDATE`, [allocation.lostBookReportId],
            )
            const loss = rows[0]; if (!loss) throw new HttpError(404, 'LOST_BOOK_CHARGE_NOT_FOUND', 'A selected lost-book charge was not found.')
            const remaining = Math.max(0,number(loss.replacement_charge)-number(loss.paid))
            if (Math.abs(allocation.amount-remaining) > 0.001) throw new HttpError(422, 'LOST_BOOK_FULL_PAYMENT_REQUIRED', 'A lost-book replacement charge must be paid in full.')
            prepared.push({ ...allocation, balanceBefore: remaining, balanceAfter: 0 })
            ownerUserId ??= Number(loss.user_id); if (ownerUserId !== Number(loss.user_id)) throw new HttpError(422, 'FINE_PAYMENT_MIXED_USERS', 'One receipt cannot contain obligations from different users.')
          }
          total += allocation.amount
        }
        if (!ownerUserId) throw new HttpError(422, 'FINE_PAYMENT_EMPTY', 'No payable obligations were selected.')
        const [insert] = await connection.execute<ResultSetHeader>(
          `INSERT INTO fine_payment_receipts(receipt_number,request_key,user_id,amount_received,payment_method,received_by_user_id,received_at,notes)
           VALUES (NULL,?,?,?,'Cash',?,NOW(),?)`, [input.requestKey,ownerUserId,total,staffUserId,input.notes],
        )
        const current = dateParts(); const receiptNumber = `OR-${current.year}${current.month}${current.day}-${String(insert.insertId).padStart(6,'0')}`
        await connection.execute('UPDATE fine_payment_receipts SET receipt_number=? WHERE fine_payment_receipt_id=?', [receiptNumber,insert.insertId])
        for (const allocation of prepared) {
          await connection.execute(
            'INSERT INTO fine_payment_allocations(fine_payment_receipt_id,fine_id,lost_book_report_id,amount_allocated,balance_before,balance_after) VALUES (?,?,?,?,?,?)',
            [insert.insertId,allocation.fineId,allocation.lostBookReportId,allocation.amount,allocation.balanceBefore,allocation.balanceAfter],
          )
          if (allocation.fineId) await recomputeFineStatus(connection,allocation.fineId)
          else await connection.execute("UPDATE lost_book_reports SET payment_status='Paid',paid_at=NOW(),payment_recorded_by_user_id=?,updated_at=NOW() WHERE lost_book_report_id=?", [staffUserId,allocation.lostBookReportId])
        }
        await connection.execute(
          `INSERT IGNORE INTO notifications(user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at)
           VALUES (?,'Cash payment received',?,'Fine','Fine Receipt',?,'/student/fines','Normal',?,NOW(),NOW())`,
          [ownerUserId,`Receipt ${receiptNumber}: PHP ${total.toFixed(2)} received at the library counter.`,insert.insertId,`fine-receipt:${insert.insertId}:issued`],
        )
        await refreshClearance(connection,ownerUserId); await connection.commit()
        return receiptDetail(Number(insert.insertId))
      } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
    },
    async adjust(actor: FineActor, target: unknown, body: unknown) {
      requireStaff(actor); const targetFineId=fineId(target); const input=validateAdjustment(body); const connection=await database.getConnection()
      try {
        await connection.beginTransaction(); const staffUserId=await linkedUserId(connection,actorAccountId(actor))
        const [rows]=await connection.execute<RowDataPacket[]>(
          `SELECT f.fine_id,f.user_id,f.fine_amount,f.fine_type,f.payment_status,bt.transaction_status,bt.lost_confirmed_at,
                  COALESCE((SELECT SUM(a.amount_allocated) FROM fine_payment_allocations a INNER JOIN fine_payment_receipts r ON r.fine_payment_receipt_id=a.fine_payment_receipt_id AND r.receipt_status='Issued' WHERE a.fine_id=f.fine_id),0) AS paid,
                  COALESCE((SELECT SUM(amount_adjusted) FROM fine_adjustments WHERE fine_id=f.fine_id),0) AS adjusted
             FROM fines f LEFT JOIN borrow_transactions bt ON bt.transaction_id=f.transaction_id WHERE f.fine_id=? LIMIT 1 FOR UPDATE`, [targetFineId],
        )
        const fine=rows[0]; if(!fine) throw new HttpError(404,'FINE_NOT_FOUND','The fine was not found.')
        if(fine.fine_type==='Overdue'&&['Borrowed','Overdue'].includes(String(fine.transaction_status))&&!fine.lost_confirmed_at) throw new HttpError(422,'FINE_STILL_ACCRUING','An accruing fine cannot be adjusted until the loan is returned or confirmed lost.')
        if(['Waived','Voided','Paid'].includes(String(fine.payment_status))) throw new HttpError(422,'FINE_ALREADY_SETTLED','This fine is already settled.')
        const remaining=Math.max(0,number(fine.fine_amount)-number(fine.paid)-number(fine.adjusted)); const amount=input.type==='Reduction'?(input.amount??0):(input.amount??remaining)
        if(amount<=0||amount>remaining+0.001) throw new HttpError(422,'FINE_ADJUSTMENT_EXCEEDS_BALANCE','The adjustment must not exceed the remaining balance.')
        await connection.execute('INSERT INTO fine_adjustments(fine_id,adjustment_type,amount_adjusted,reason,adjusted_by_user_id,adjusted_at) VALUES (?,?,?,?,?,NOW())',[targetFineId,input.type,amount,input.reason,staffUserId])
        const result=await recomputeFineStatus(connection,targetFineId)
        await connection.execute(
          `INSERT IGNORE INTO notifications(user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at)
           VALUES (?,'Fine adjusted',?,'Fine','Fine',?,'/student/fines','Important',?,NOW(),NOW())`,
          [fine.user_id,`${input.type}: PHP ${amount.toFixed(2)}. Reason: ${input.reason}`,targetFineId,`fine:${targetFineId}:adjustment:${Date.now()}`],
        )
        await refreshClearance(connection,Number(fine.user_id)); await connection.commit(); return { fineId:targetFineId,...result }
      } catch(error){await connection.rollback();throw error}finally{connection.release()}
    },
    async reverseReceipt(actor: FineActor, target: unknown, body: unknown) {
      requireStaff(actor); const targetReceiptId=receiptId(target); const input=validateReversal(body); const connection=await database.getConnection()
      try {
        await connection.beginTransaction(); const staffUserId=await linkedUserId(connection,actorAccountId(actor))
        const [rows]=await connection.execute<RowDataPacket[]>('SELECT user_id,receipt_status FROM fine_payment_receipts WHERE fine_payment_receipt_id=? LIMIT 1 FOR UPDATE',[targetReceiptId])
        const receipt=rows[0]; if(!receipt) throw new HttpError(404,'FINE_RECEIPT_NOT_FOUND','The payment receipt was not found.')
        if(receipt.receipt_status!=='Issued') throw new HttpError(422,'FINE_RECEIPT_ALREADY_REVERSED','This receipt has already been reversed.')
        await connection.execute("UPDATE fine_payment_receipts SET receipt_status='Reversed',reversed_by_user_id=?,reversed_at=NOW(),reversal_reason=? WHERE fine_payment_receipt_id=?",[staffUserId,input.reason,targetReceiptId])
        const [allocations]=await connection.execute<RowDataPacket[]>('SELECT fine_id,lost_book_report_id FROM fine_payment_allocations WHERE fine_payment_receipt_id=?',[targetReceiptId])
        for(const allocation of allocations){if(allocation.fine_id) await recomputeFineStatus(connection,Number(allocation.fine_id));else await connection.execute("UPDATE lost_book_reports SET payment_status='Unpaid',paid_at=NULL,payment_recorded_by_user_id=NULL,updated_at=NOW() WHERE lost_book_report_id=?",[allocation.lost_book_report_id])}
        await connection.execute(
          `INSERT IGNORE INTO notifications(user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at)
           VALUES (?,'Cash receipt reversed',?,'Fine','Fine Receipt',?,'/student/fines','Urgent',?,NOW(),NOW())`,
          [receipt.user_id,`A cash receipt was reversed. Reason: ${input.reason}`,targetReceiptId,`fine-receipt:${targetReceiptId}:reversed`],
        )
        await refreshClearance(connection,Number(receipt.user_id)); await connection.commit(); return receiptDetail(targetReceiptId)
      }catch(error){await connection.rollback();throw error}finally{connection.release()}
    },
    receipt: receiptDetail,
    async receiptsForUser(actor: FineActor) {
      const userId=await linkedUserId(database,actorAccountId(actor)); const [rows]=await database.execute<RowDataPacket[]>(
        `SELECT fine_payment_receipt_id,receipt_number,amount_received,payment_method,received_at,receipt_status
           FROM fine_payment_receipts WHERE user_id=? ORDER BY received_at DESC,fine_payment_receipt_id DESC`,[userId],
      )
      return rows.map((row)=>({receiptId:Number(row.fine_payment_receipt_id),receiptNumber:String(row.receipt_number),amountReceived:number(row.amount_received),paymentMethod:String(row.payment_method),receivedAt:row.received_at,status:String(row.receipt_status)}))
    },
  }
}

export const finesService=createFinesService()
