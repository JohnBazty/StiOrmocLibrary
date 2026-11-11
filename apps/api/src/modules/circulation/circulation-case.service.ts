import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryActor, type LibraryPermission } from '../../core/library-permissions.ts'
import { lockInventoryCopy, recordInventoryAudit, synchronizeLegacyAvailability, type LockedInventoryCopy } from '../inventory/inventory.repository.ts'
import {
  BOOK_PRICE_RESOLUTION, TERMINAL_CASE_STATUSES,
  type CaseEventType, type CaseStatus, type DamageDisposition, type PublicCaseSummary,
} from './circulation-case.types.ts'
import {
  positiveCaseId, validateCaseListQuery, validateCaseNote, validateCaseReason, validateDisposition,
} from './circulation-case.validation.ts'

/** Timestamps in this schema are Manila wall time (see `returnBook`). */
const MANILA_TIMESTAMP = "(?::timestamptz AT TIME ZONE 'Asia/Manila')"

type CaseRow = RowDataPacket & {
  case_id: number; case_type: string; transaction_id: number; physical_copy_id: number; borrower_user_id: number
  status: CaseStatus; summary: string | null; opened_at: Date | string; updated_at: Date | string; resolved_at: Date | string | null
  baseline_condition_status: string | null; observed_condition_status: string | null; lost_book_report_id: number | null
}

function nullableId(value: unknown) { return value === null || value === undefined ? null : Number(value) }

function mapCase(row: CaseRow) {
  return {
    caseId: Number(row.case_id), caseType: 'Damage' as const, transactionId: Number(row.transaction_id),
    physicalCopyId: Number(row.physical_copy_id), borrowerUserId: Number(row.borrower_user_id), status: row.status,
    summary: row.summary, openedAt: row.opened_at, updatedAt: row.updated_at, resolvedAt: row.resolved_at,
    baselineConditionStatus: row.baseline_condition_status, observedConditionStatus: row.observed_condition_status,
    lostBookReportId: nullableId(row.lost_book_report_id),
  }
}

function publicInstruction(status: CaseStatus) {
  return TERMINAL_CASE_STATUSES.includes(status)
    ? 'This damage review is closed. Check Clearance for any charge, or ask at the library desk.'
    : 'Library staff are reviewing damage reported on this book. Please follow any desk instructions.'
}

async function appendEvent(connection: PoolConnection, caseId: number, eventType: CaseEventType, actorUserId: number | null,
  fromStatus: string | null, toStatus: string | null, reason: string | null, notes: string | null) {
  const [insert] = await connection.execute<ResultSetHeader>(
    `INSERT INTO circulation_case_events (case_id, event_type, actor_user_id, from_status, to_status, reason, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`, [caseId, eventType, actorUserId, fromStatus, toStatus, reason, notes],
  )
  return Number(insert.insertId)
}

async function notifyBorrower(connection: PoolConnection, userId: number, title: string, body: string, caseId: number, dedupeKey: string) {
  await connection.execute(
    `INSERT INTO notifications (user_id, message_title, message_body, trigger_type, source_type, source_id, action_path, priority, dedupe_key, scheduled_for, delivered_at)
     VALUES (?, ?, ?, 'Circulation Case', 'Circulation Case', ?, '/student/borrowing', 'Important', ?, NOW(), NOW())
     ON CONFLICT (user_id, dedupe_key) DO NOTHING`, [userId, title, body, caseId, dedupeKey],
  )
}

/** Returns the actor's user ID after checking the account is active and holds `permission`. */
async function staffUserId(connection: PoolConnection, accountIdValue: unknown, permission: LibraryPermission) {
  const accountId = positiveCaseId(accountIdValue, 'account ID')
  await requireLibraryActor(connection, accountId, permission)
  const [rows] = await connection.execute<RowDataPacket[]>('SELECT user_id FROM accounts WHERE account_id = ? LIMIT 1', [accountId])
  return nullableId(rows[0]?.user_id)
}

async function lockCase(connection: PoolConnection, caseId: number) {
  const [rows] = await connection.execute<CaseRow[]>(
    "SELECT * FROM circulation_cases WHERE case_id = ? AND case_type = 'Damage' LIMIT 1 FOR UPDATE", [caseId],
  )
  if (!rows[0]) throw new HttpError(404, 'CASE_NOT_FOUND', 'The damage case was not found.')
  return rows[0]
}

function requireOpen(row: CaseRow) {
  if (TERMINAL_CASE_STATUSES.includes(row.status)) {
    throw new HttpError(422, 'CASE_TERMINAL', 'Reopen this case before taking a new action.')
  }
}

/** Opens (or reuses) the Damage case for a loan inside the caller's return transaction. */
export async function openDamageCaseAtReturn(connection: PoolConnection, input: {
  transactionId: number; physicalCopyId: number; borrowerUserId: number; actorUserId: number | null
  baselineCondition: string | null; observedCondition: string; description: string; openedAt: Date
}) {
  const [insert] = await connection.execute<ResultSetHeader>(
    `INSERT INTO circulation_cases (case_type, transaction_id, physical_copy_id, borrower_user_id, status, summary, opened_at,
       opened_by_user_id, baseline_condition_status, observed_condition_status)
     VALUES ('Damage', ?, ?, ?, 'Open', ?, ${MANILA_TIMESTAMP}, ?, ?, ?)
     ON CONFLICT (transaction_id, case_type) DO NOTHING`,
    [input.transactionId, input.physicalCopyId, input.borrowerUserId, input.description, input.openedAt.toISOString(),
      input.actorUserId, input.baselineCondition, input.observedCondition],
  )
  if (!insert.insertId) {
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT case_id, status FROM circulation_cases WHERE transaction_id = ? AND case_type = 'Damage' LIMIT 1 FOR UPDATE", [input.transactionId],
    )
    const caseId = Number(rows[0].case_id)
    await appendEvent(connection, caseId, 'Note Added', input.actorUserId, rows[0].status, rows[0].status, null, input.description)
    return { caseId, created: false }
  }
  const caseId = Number(insert.insertId)
  await appendEvent(connection, caseId, 'Opened', input.actorUserId, null, 'Open', null, input.description)
  await connection.execute(
    `INSERT INTO admin_notifications (event_type, actor_user_id, borrow_transaction_id, message_title, message_body)
     VALUES ('damage_case_opened', ?, ?, 'Damage case opened', ?)`, [input.actorUserId, input.transactionId, input.description],
  )
  await notifyBorrower(connection, input.borrowerUserId, 'Damage review opened',
    'Library staff found damage on a book you returned and opened a review. You may be asked about it at the desk.', caseId, `case:${caseId}:opened`)
  return { caseId, created: true }
}

async function setCopy(connection: PoolConnection, copy: LockedInventoryCopy, condition: string, availability: 'Available' | 'Unavailable',
  actor: { userId: number | null; label: string }, auditTypes: Array<'Condition Changed' | 'Availability Changed' | 'Lost Override'>) {
  await connection.execute(
    'UPDATE physical_copies SET condition_status = ?, availability_status = ?, row_version = row_version + 1, updated_at = NOW() WHERE physical_copy_id = ?',
    [condition, availability, copy.physical_copy_id],
  )
  await synchronizeLegacyAvailability(connection, nullableId(copy.material_id), availability)
  if (auditTypes.includes('Lost Override')) return recordInventoryAudit(connection, copy, 'Lost Override', actor, condition, availability)
  if (copy.condition_status !== condition) await recordInventoryAudit(connection, copy, 'Condition Changed', actor, condition, copy.availability_status)
  if (copy.availability_status !== availability) {
    await recordInventoryAudit(connection, { ...copy, condition_status: condition } as LockedInventoryCopy, 'Availability Changed', actor, condition, availability)
  }
}

/** Write the copy off and charge the borrower the book price (no extra fee) as a confirmed lost-book report. */
async function chargeBookPrice(connection: PoolConnection, row: CaseRow, copy: LockedInventoryCopy, actorUserId: number | null,
  reason: string, staffCharge: number | null) {
  const [existing] = await connection.execute<RowDataPacket[]>(
    'SELECT lost_book_report_id FROM lost_book_reports WHERE transaction_id = ? LIMIT 1 FOR UPDATE', [row.transaction_id],
  )
  if (existing[0]) throw new HttpError(409, 'CASE_LOST_ALREADY_CHARGED', 'A lost-book charge already exists for this loan. Review it in Clearance.')
  const [priceRows] = await connection.execute<RowDataPacket[]>('SELECT title, purchase_price FROM titles WHERE title_id = ? LIMIT 1', [copy.title_id])
  const price = priceRows[0]?.purchase_price === null || priceRows[0]?.purchase_price === undefined ? null : Number(priceRows[0].purchase_price)
  const bookPrice = price !== null && price > 0 ? price : null
  if (bookPrice !== null && staffCharge !== null && staffCharge !== bookPrice) {
    throw new HttpError(422, 'CASE_LOST_CHARGE_MISMATCH', `The charge must equal the book price, PHP ${bookPrice.toFixed(2)}.`)
  }
  const charge = bookPrice ?? staffCharge
  if (charge === null) throw new HttpError(422, 'CASE_LOST_CHARGE_REQUIRED', 'This title has no book price on record. Enter the replacement charge.')
  const [insert] = await connection.execute<ResultSetHeader>(
    `INSERT INTO lost_book_reports (transaction_id, user_id, physical_copy_id, report_status, purchase_price_snapshot, replacement_charge,
       charge_resolution, payment_status, reported_at, verified_by_user_id, verified_at, staff_notes, updated_at)
     VALUES (?, ?, ?, 'Confirmed', ?, ?, ?, 'Unpaid', NOW(), ?, NOW(), ?, NOW())`,
    [row.transaction_id, row.borrower_user_id, row.physical_copy_id, bookPrice, charge, BOOK_PRICE_RESOLUTION, actorUserId, reason],
  )
  const reportId = Number(insert.insertId)
  await setCopy(connection, copy, 'Lost', 'Unavailable', { userId: actorUserId, label: 'Librarian' }, ['Lost Override'])
  await connection.execute('UPDATE circulation_cases SET lost_book_report_id = ?, updated_at = NOW() WHERE case_id = ?', [reportId, row.case_id])
  await appendEvent(connection, Number(row.case_id), 'Linked Lost Report', actorUserId, row.status, row.status, reason, `Lost-book report ${reportId}`)
  const title = String(priceRows[0]?.title ?? 'A returned book')
  const message = `${title} was damaged beyond use and written off. Replacement charge: PHP ${charge.toFixed(2)}.`
  await connection.execute(
    `INSERT INTO admin_notifications (event_type, actor_user_id, borrow_transaction_id, message_title, message_body)
     VALUES ('lost_book_confirmed', ?, ?, 'Lost book confirmed', ?)`, [actorUserId, row.transaction_id, message],
  )
  await connection.execute(
    `INSERT INTO notifications (user_id, message_title, message_body, trigger_type, source_type, source_id, action_path, priority, dedupe_key, scheduled_for, delivered_at)
     VALUES (?, 'Lost book charge confirmed', ?, 'Lost Book', 'Lost Book Report', ?, '/student/clearance', 'Urgent', ?, NOW(), NOW())
     ON CONFLICT (user_id, dedupe_key) DO NOTHING`, [row.borrower_user_id, message, reportId, `lost-report:${reportId}:confirmed`],
  )
}

async function applyDisposition(connection: PoolConnection, row: CaseRow, disposition: DamageDisposition, reason: string,
  replacementCharge: number | null, actorUserId: number | null) {
  const [loanRows] = await connection.execute<RowDataPacket[]>(
    'SELECT bt.transaction_status, pc.barcode FROM borrow_transactions bt JOIN physical_copies pc ON pc.physical_copy_id = bt.physical_copy_id WHERE bt.transaction_id = ? LIMIT 1',
    [row.transaction_id],
  )
  if (String(loanRows[0]?.transaction_status) !== 'Returned') {
    throw new HttpError(422, 'CASE_LOAN_NOT_RETURNED', 'Record a disposition only after the book is returned.')
  }
  const copy = await lockInventoryCopy(connection, String(loanRows[0].barcode))
  if (!copy) throw new HttpError(404, 'CASE_COPY_NOT_FOUND', 'The physical copy for this case was not found.')
  // Only decide while the copy is still held as damaged; after repair it may be shelved or lent to someone else.
  if (copy.condition_status !== 'Damaged' || copy.availability_status !== 'Unavailable') {
    throw new HttpError(409, 'CASE_COPY_NOT_HELD', 'This copy is no longer held as damaged. Check it in inventory before recording a decision.')
  }
  const actor = { userId: actorUserId, label: 'Librarian' }
  if (disposition === 'repaired_available') return setCopy(connection, copy, 'Good', 'Available', actor, [])
  if (disposition === 'damaged_held') return setCopy(connection, copy, 'Damaged', 'Unavailable', actor, [])
  return chargeBookPrice(connection, row, copy, actorUserId, reason, replacementCharge)
}

export function createCirculationCaseService(database: Pool = db, clock: () => Date = () => new Date()) {
  async function inTransaction<T>(work: (connection: PoolConnection) => Promise<T>) {
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      const result = await work(connection)
      await connection.commit()
      return result
    } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }

  const service = {
    async listCases(query: Record<string, unknown>) {
      const filters = validateCaseListQuery(query)
      const where = ["cc.case_type = 'Damage'"]
      const params: unknown[] = []
      if (filters.status) { where.push('cc.status = ?'); params.push(filters.status) }
      if (filters.search) {
        where.push("(u.full_name ILIKE ? OR u.school_id ILIKE ? OR t.title ILIKE ? OR pc.barcode ILIKE ?)")
        const like = `%${filters.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
        params.push(like, like, like, like)
      }
      const from = `FROM circulation_cases cc JOIN users u ON u.user_id = cc.borrower_user_id
        JOIN physical_copies pc ON pc.physical_copy_id = cc.physical_copy_id JOIN titles t ON t.title_id = pc.title_id
        WHERE ${where.join(' AND ')}`
      const offset = (filters.page - 1) * filters.limit
      const [rows] = await database.execute<RowDataPacket[]>(
        `SELECT cc.*, u.full_name AS borrower_name, u.school_id AS borrower_school_id, t.title, pc.barcode ${from}
          ORDER BY cc.opened_at DESC, cc.case_id DESC LIMIT ${filters.limit} OFFSET ${offset}`, params,
      )
      const [countRows] = await database.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total ${from}`, params)
      const total = Number(countRows[0]?.total ?? 0)
      return {
        items: rows.map((row) => ({
          ...mapCase(row as CaseRow), borrowerName: String(row.borrower_name), borrowerSchoolId: String(row.borrower_school_id),
          title: String(row.title), barcode: String(row.barcode),
        })),
        pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.max(1, Math.ceil(total / filters.limit)) },
      }
    },

    async getCaseDetail(caseIdValue: unknown) {
      const caseId = positiveCaseId(caseIdValue)
      const [caseRows] = await database.execute<CaseRow[]>("SELECT * FROM circulation_cases WHERE case_id = ? AND case_type = 'Damage' LIMIT 1", [caseId])
      const row = caseRows[0]
      if (!row) throw new HttpError(404, 'CASE_NOT_FOUND', 'The damage case was not found.')
      const [[loanRows], [eventRows]] = await Promise.all([
        database.execute<RowDataPacket[]>(
          `SELECT bt.transaction_status, bt.due_at, bt.returned_at, t.title, t.purchase_price, pc.barcode, pc.accession_number,
                  pc.condition_status, pc.availability_status, u.full_name, u.school_id,
                  f.fine_amount, f.payment_status AS fine_payment_status,
                  l.replacement_charge, l.payment_status AS lost_payment_status
             FROM borrow_transactions bt JOIN physical_copies pc ON pc.physical_copy_id = bt.physical_copy_id
             JOIN titles t ON t.title_id = pc.title_id JOIN users u ON u.user_id = bt.user_id
             LEFT JOIN fines f ON f.transaction_id = bt.transaction_id
             LEFT JOIN lost_book_reports l ON l.transaction_id = bt.transaction_id
            WHERE bt.transaction_id = ? LIMIT 1`, [row.transaction_id]),
        database.execute<RowDataPacket[]>(
          `SELECT e.event_id, e.event_type, e.from_status, e.to_status, e.reason, e.notes, e.created_at, u.full_name AS actor_name
             FROM circulation_case_events e LEFT JOIN users u ON u.user_id = e.actor_user_id
            WHERE e.case_id = ? ORDER BY e.created_at ASC, e.event_id ASC`, [caseId]),
      ])
      const loan = loanRows[0]
      const money = (value: unknown) => (value === null || value === undefined ? null : Number(value))
      return {
        case: mapCase(row),
        loan: loan ? {
          status: String(loan.transaction_status), dueAt: loan.due_at, returnedAt: loan.returned_at, title: String(loan.title),
          titlePrice: money(loan.purchase_price), barcode: String(loan.barcode), accessionNumber: loan.accession_number ? String(loan.accession_number) : null,
          conditionStatus: String(loan.condition_status), availabilityStatus: String(loan.availability_status),
          borrowerName: String(loan.full_name), borrowerSchoolId: String(loan.school_id),
          fineAmount: money(loan.fine_amount), finePaymentStatus: loan.fine_payment_status ? String(loan.fine_payment_status) : null,
          replacementCharge: money(loan.replacement_charge), replacementPaymentStatus: loan.lost_payment_status ? String(loan.lost_payment_status) : null,
        } : null,
        events: eventRows.map((event) => ({
          eventId: Number(event.event_id), eventType: String(event.event_type), actorName: event.actor_name ? String(event.actor_name) : null,
          fromStatus: event.from_status ?? null, toStatus: event.to_status ?? null, reason: event.reason ?? null, notes: event.notes ?? null,
          createdAt: event.created_at,
        })),
      }
    },

    async addNote(accountId: unknown, caseIdValue: unknown, body: unknown) {
      const caseId = positiveCaseId(caseIdValue)
      const input = validateCaseNote(body)
      await inTransaction(async (connection) => {
        const actorUserId = await staffUserId(connection, accountId, 'desk.operate')
        const row = await lockCase(connection, caseId)
        requireOpen(row)
        const next: CaseStatus = row.status === 'Open' ? 'Under Investigation' : row.status
        if (next !== row.status) await connection.execute('UPDATE circulation_cases SET status = ?, updated_at = NOW() WHERE case_id = ?', [next, caseId])
        await appendEvent(connection, caseId, 'Note Added', actorUserId, row.status, next, null, input.notes)
      })
      return service.getCaseDetail(caseId)
    },

    async recordDisposition(accountId: unknown, caseIdValue: unknown, body: unknown) {
      const caseId = positiveCaseId(caseIdValue)
      const input = validateDisposition(body)
      await inTransaction(async (connection) => {
        const actorUserId = await staffUserId(connection, accountId, 'library.manage')
        const row = await lockCase(connection, caseId)
        requireOpen(row)
        if (row.lost_book_report_id) throw new HttpError(409, 'CASE_LOST_ALREADY_CHARGED', 'This copy was already written off and charged. Review it in Clearance.')
        await applyDisposition(connection, row, input.disposition, input.reason, input.replacementCharge, actorUserId)
        await appendEvent(connection, caseId, 'Disposition Recorded', actorUserId, row.status, row.status, input.reason, input.disposition)
      })
      return service.getCaseDetail(caseId)
    },

    async closeCase(accountId: unknown, caseIdValue: unknown, body: unknown, status: 'Resolved' | 'Dismissed') {
      const caseId = positiveCaseId(caseIdValue)
      const input = validateCaseReason(body)
      await inTransaction(async (connection) => {
        const actorUserId = await staffUserId(connection, accountId, 'library.manage')
        const row = await lockCase(connection, caseId)
        requireOpen(row)
        if (status === 'Dismissed' && row.lost_book_report_id) {
          throw new HttpError(422, 'CASE_CHARGED_CANNOT_DISMISS', 'This case has a replacement charge. Resolve it instead, or waive the charge in Clearance first.')
        }
        await connection.execute(
          `UPDATE circulation_cases SET status = ?, resolved_at = ${MANILA_TIMESTAMP}, resolved_by_user_id = ?, updated_at = NOW() WHERE case_id = ?`,
          [status, clock().toISOString(), actorUserId, caseId],
        )
        const eventId = await appendEvent(connection, caseId, status, actorUserId, row.status, status, input.reason, null)
        // Keyed by event so a re-close after reopen notifies again.
        await notifyBorrower(connection, Number(row.borrower_user_id), status === 'Resolved' ? 'Damage review closed' : 'Damage review dismissed',
          publicInstruction(status), caseId, `case:${caseId}:${status.toLowerCase()}:${eventId}`)
      })
      return service.getCaseDetail(caseId)
    },

    async reopenCase(accountId: unknown, caseIdValue: unknown, body: unknown) {
      const caseId = positiveCaseId(caseIdValue)
      const input = validateCaseReason(body)
      await inTransaction(async (connection) => {
        const actorUserId = await staffUserId(connection, accountId, 'library.manage')
        const row = await lockCase(connection, caseId)
        if (!TERMINAL_CASE_STATUSES.includes(row.status)) throw new HttpError(422, 'CASE_NOT_CLOSED', 'Only a resolved or dismissed case can be reopened.')
        await connection.execute(
          "UPDATE circulation_cases SET status = 'Reopened', resolved_at = NULL, resolved_by_user_id = NULL, updated_at = NOW() WHERE case_id = ?", [caseId],
        )
        await appendEvent(connection, caseId, 'Reopened', actorUserId, row.status, 'Reopened', input.reason, null)
      })
      return service.getCaseDetail(caseId)
    },

    /** Borrower-safe summaries: status and an instruction only, never staff notes. */
    async publicSummariesForTransactions(userId: number, transactionIds: number[]) {
      const map = new Map<number, PublicCaseSummary>()
      if (transactionIds.length === 0) return map
      const [rows] = await database.execute<CaseRow[]>(
        `SELECT case_id, transaction_id, status, opened_at FROM circulation_cases
          WHERE case_type = 'Damage' AND borrower_user_id = ? AND transaction_id = ANY(?::bigint[])`,
        [userId, transactionIds],
      )
      for (const row of rows) {
        map.set(Number(row.transaction_id), {
          caseId: Number(row.case_id), caseType: 'Damage', status: row.status, openedAt: row.opened_at, instruction: publicInstruction(row.status),
        })
      }
      return map
    },
  }
  return service
}

export const circulationCaseService = createCirculationCaseService()
