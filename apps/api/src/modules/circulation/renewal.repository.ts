import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { forUpdate, insertIgnore } from '../../config/sql-dialect.js'

export type RenewalExecutor = Pool | PoolConnection

export interface RenewalAccount {
  accountId: number
  userId: number | null
  role: string
  accountStatus: string
}

export interface RenewalLoan {
  transactionId: number
  userId: number
  materialId: number
  physicalCopyId: number | null
  policyVersionId: number | null
  borrowedAt: Date | null
  dueAt: Date | null
  initialDueAt: Date | null
  renewalCount: number
  status: string
  userAccountStatus: string
  normalizedAccountStatus: string | null
  materialType: string
  titleId: number | null
  title: string
  copyCondition: string | null
  copyLifecycleStatus: string | null
  titleLifecycleStatus: string | null
}

export interface RenewalBlockState {
  hasWaitingReservation: boolean
  hasOutstandingFine: boolean
  hasUnpaidLostCharge: boolean
  hasOpenLostReport: boolean
}

export interface StoredRenewalDecision {
  renewalRequestId: number
  requestKey: string
  transactionId: number
  renewalNumber: number
  requesterAccountId: number | null
  requesterUserId: number
  decisionSource: 'System' | 'Staff'
  decidingStaffAccountId: number | null
  decidingStaffUserId: number | null
  staffNote: string | null
  status: 'Approved' | 'Rejected'
  decisionCode: string
  decisionSummary: string
  blockerCodes: string[]
  previousDueAt: Date
  newDueAt: Date | null
  policyVersionId: number | null
  requestedAt: Date
  decidedAt: Date
}

export interface InsertRenewalDecision {
  requestKey: string
  transactionId: number
  renewalNumber: number
  requesterAccountId: number
  requesterUserId: number
  decisionSource: 'System' | 'Staff'
  decidingStaffAccountId: number | null
  decidingStaffUserId: number | null
  staffNote: string | null
  status: 'Approved' | 'Rejected'
  decisionCode: string
  decisionSummary: string
  blockerCodes: string[]
  previousDueAt: Date
  newDueAt: Date | null
  policyVersionId: number | null
  requestedAt: Date
  decidedAt: Date
}

function mapAccount(row: RowDataPacket | undefined): RenewalAccount | null {
  if (!row) return null
  return {
    accountId: Number(row.account_id),
    userId: row.user_id === null || row.user_id === undefined ? null : Number(row.user_id),
    role: String(row.role),
    accountStatus: String(row.account_status),
  }
}

function mapLoan(row: RowDataPacket | undefined): RenewalLoan | null {
  if (!row) return null
  return {
    transactionId: Number(row.transaction_id),
    userId: Number(row.user_id),
    materialId: Number(row.material_id),
    physicalCopyId: row.physical_copy_id ? Number(row.physical_copy_id) : null,
    policyVersionId: row.borrowing_policy_version_id ? Number(row.borrowing_policy_version_id) : null,
    borrowedAt: row.borrowed_at ? new Date(row.borrowed_at) : null,
    dueAt: row.due_at ? new Date(row.due_at) : null,
    initialDueAt: row.initial_due_at ? new Date(row.initial_due_at) : null,
    renewalCount: Number(row.renewal_count ?? 0),
    status: String(row.transaction_status),
    userAccountStatus: String(row.user_account_status),
    normalizedAccountStatus: row.normalized_account_status ? String(row.normalized_account_status) : null,
    materialType: String(row.material_type),
    titleId: row.title_id ? Number(row.title_id) : null,
    title: String(row.title ?? 'Catalog title unavailable'),
    copyCondition: row.condition_status ? String(row.condition_status) : null,
    copyLifecycleStatus: row.copy_lifecycle_status ? String(row.copy_lifecycle_status) : null,
    titleLifecycleStatus: row.title_lifecycle_status ? String(row.title_lifecycle_status) : null,
  }
}

function mapDecision(row: RowDataPacket | undefined): StoredRenewalDecision | null {
  if (!row) return null
  let blockerCodes: string[] = []
  try {
    blockerCodes = row.blocker_codes ? JSON.parse(String(row.blocker_codes)) as string[] : []
  } catch {
    blockerCodes = []
  }
  return {
    renewalRequestId: Number(row.renewal_request_id),
    requestKey: String(row.request_key),
    transactionId: Number(row.transaction_id),
    renewalNumber: Number(row.renewal_number),
    requesterAccountId: row.requester_account_id ? Number(row.requester_account_id) : null,
    requesterUserId: Number(row.requester_user_id),
    decisionSource: String(row.decision_source) as StoredRenewalDecision['decisionSource'],
    decidingStaffAccountId: row.deciding_staff_account_id ? Number(row.deciding_staff_account_id) : null,
    decidingStaffUserId: row.deciding_staff_user_id ? Number(row.deciding_staff_user_id) : null,
    staffNote: row.staff_note ? String(row.staff_note) : null,
    status: String(row.status) as StoredRenewalDecision['status'],
    decisionCode: String(row.decision_code),
    decisionSummary: String(row.decision_summary),
    blockerCodes,
    previousDueAt: new Date(row.previous_due_at),
    newDueAt: row.new_due_at ? new Date(row.new_due_at) : null,
    policyVersionId: row.borrowing_policy_version_id ? Number(row.borrowing_policy_version_id) : null,
    requestedAt: new Date(row.requested_at),
    decidedAt: new Date(row.decided_at),
  }
}

function localDateKey(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function createRenewalRepository(database: Pool = db) {
  return {
    async findAccount(accountId: number, executor: RenewalExecutor = database, lock = false): Promise<RenewalAccount | null> {
      const [rows] = await executor.execute<RowDataPacket[]>(
        `SELECT account_id, user_id, role, account_status
           FROM accounts WHERE account_id = ? LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
        [accountId],
      )
      return mapAccount(rows[0])
    },

    async findDecisionByRequestKey(
      requestKey: string,
      executor: RenewalExecutor = database,
      lock = false,
    ): Promise<StoredRenewalDecision | null> {
      const [rows] = await executor.execute<RowDataPacket[]>(
        `SELECT * FROM loan_renewal_requests WHERE request_key = ? LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
        [requestKey],
      )
      return mapDecision(rows[0])
    },

    async findLoan(
      transactionId: number,
      executor: RenewalExecutor = database,
      lock = false,
    ): Promise<RenewalLoan | null> {
      const [rows] = await executor.execute<RowDataPacket[]>(
        `SELECT bt.transaction_id, bt.user_id, bt.material_id, bt.physical_copy_id,
                bt.borrowing_policy_version_id, bt.borrowed_at, bt.due_at, bt.initial_due_at,
                bt.renewal_count, bt.transaction_status, u.account_status AS user_account_status,
                a.account_status AS normalized_account_status, m.material_type,
                pc.title_id, pc.condition_status, pc.lifecycle_status AS copy_lifecycle_status,
                t.lifecycle_status AS title_lifecycle_status, COALESCE(t.title, m.title) AS title
           FROM borrow_transactions bt
           INNER JOIN users u ON u.user_id = bt.user_id
           INNER JOIN materials m ON m.material_id = bt.material_id
           LEFT JOIN accounts a ON a.user_id = bt.user_id
           LEFT JOIN physical_copies pc
             ON pc.physical_copy_id = bt.physical_copy_id
             OR (bt.physical_copy_id IS NULL AND pc.material_id = bt.material_id)
           LEFT JOIN titles t ON t.title_id = pc.title_id
          WHERE bt.transaction_id = ? LIMIT 1${lock ? ` ${forUpdate('bt')}` : ''}`,
        [transactionId],
      )
      return mapLoan(rows[0])
    },

    async loadBlockState(
      loan: RenewalLoan,
      executor: RenewalExecutor = database,
      lockReservations = false,
    ): Promise<RenewalBlockState> {
      let hasWaitingReservation = false
      if (loan.titleId) {
        if (lockReservations) {
          await executor.execute<RowDataPacket[]>(
            'SELECT physical_copy_id FROM physical_copies WHERE title_id = ? ORDER BY physical_copy_id ASC FOR UPDATE',
            [loan.titleId],
          )
        }
        const [reservationRows] = await executor.execute<RowDataPacket[]>(
          `SELECT reservation_id FROM reservations
            WHERE book_title_id = ? AND user_id <> ?
              AND reservation_status IN ('pending','approved','ready_for_pickup')
            ORDER BY queue_position ASC, reservation_id ASC${lockReservations ? ' FOR UPDATE' : ''}`,
          [loan.titleId, loan.userId],
        )
        hasWaitingReservation = reservationRows.length > 0
      }
      const [fineRows] = await executor.execute<RowDataPacket[]>(
        `SELECT fine_id FROM fines
          WHERE user_id = ? AND payment_status IN ('Accruing','Unpaid','Partially Paid')
          LIMIT 1`,
        [loan.userId],
      )
      const [lostChargeRows] = await executor.execute<RowDataPacket[]>(
        `SELECT lost_book_report_id FROM lost_book_reports
          WHERE user_id = ? AND report_status = 'Confirmed' AND payment_status = 'Unpaid'
          LIMIT 1`,
        [loan.userId],
      )
      const [lostReportRows] = await executor.execute<RowDataPacket[]>(
        `SELECT lost_book_report_id FROM lost_book_reports
          WHERE transaction_id = ? AND report_status IN ('Pending','Confirmed')
          LIMIT 1`,
        [loan.transactionId],
      )
      return {
        hasWaitingReservation,
        hasOutstandingFine: fineRows.length > 0,
        hasUnpaidLostCharge: lostChargeRows.length > 0,
        hasOpenLostReport: lostReportRows.length > 0,
      }
    },

    async countApproved(transactionId: number, executor: RenewalExecutor = database): Promise<number> {
      const [rows] = await executor.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS approved_count FROM loan_renewal_requests
          WHERE transaction_id = ? AND status = 'Approved'`,
        [transactionId],
      )
      return Number(rows[0]?.approved_count ?? 0)
    },

    async loadCalendarClosedDates(start: Date, executor: RenewalExecutor = database): Promise<Set<string>> {
      const horizon = new Date(start)
      horizon.setDate(horizon.getDate() + 366)
      const [closedRows] = await executor.execute<RowDataPacket[]>(
        'SELECT closed_date FROM library_closed_days WHERE closed_date > DATE(?) AND closed_date <= DATE(?)',
        [start, horizon],
      )
      const [scheduleRows] = await executor.execute<RowDataPacket[]>(
        'SELECT day_of_week, is_open FROM library_operating_schedule',
      )
      if (scheduleRows.length === 0) throw new Error('The library operating schedule is not configured.')
      const openDays = new Set(
        scheduleRows.filter((row) => Boolean(row.is_open)).map((row) => Number(row.day_of_week)),
      )
      const closedDates = new Set(closedRows.map((row) => {
        return row.closed_date instanceof Date
          ? localDateKey(row.closed_date)
          : String(row.closed_date).slice(0, 10)
      }))
      const date = new Date(start)
      date.setHours(12, 0, 0, 0)
      while (date <= horizon) {
        const campusDay = date.getDay() === 0 ? 7 : date.getDay()
        if (!openDays.has(campusDay)) closedDates.add(localDateKey(date))
        date.setDate(date.getDate() + 1)
      }
      return closedDates
    },

    async insertDecision(input: InsertRenewalDecision, executor: PoolConnection): Promise<number> {
      const [result] = await executor.execute<ResultSetHeader>(
        `INSERT INTO loan_renewal_requests (
           request_key, transaction_id, renewal_number, requester_account_id, requester_user_id,
           decision_source, deciding_staff_account_id, deciding_staff_user_id, staff_note,
           status, decision_code, decision_summary, blocker_codes, previous_due_at, new_due_at,
           borrowing_policy_version_id, requested_at, decided_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.requestKey, input.transactionId, input.renewalNumber, input.requesterAccountId,
          input.requesterUserId, input.decisionSource, input.decidingStaffAccountId,
          input.decidingStaffUserId, input.staffNote, input.status, input.decisionCode,
          input.decisionSummary, JSON.stringify(input.blockerCodes), input.previousDueAt,
          input.newDueAt, input.policyVersionId, input.requestedAt, input.decidedAt,
        ],
      )
      return Number(result.insertId)
    },

    async approveLoan(
      transactionId: number,
      currentRenewalCount: number,
      previousDueAt: Date,
      newDueAt: Date,
      executor: PoolConnection,
    ): Promise<boolean> {
      const [result] = await executor.execute<ResultSetHeader>(
        `UPDATE borrow_transactions
            SET initial_due_at = COALESCE(initial_due_at, ?), due_at = ?,
                renewal_count = renewal_count + 1, updated_at = NOW()
          WHERE transaction_id = ? AND renewal_count = ?`,
        [previousDueAt, newDueAt, transactionId, currentRenewalCount],
      )
      return result.affectedRows === 1
    },

    async insertApprovalNotification(
      loan: RenewalLoan,
      renewalRequestId: number,
      renewalNumber: number,
      newDueAt: Date,
      executor: PoolConnection,
    ): Promise<void> {
      await executor.execute(
        insertIgnore(
          `INSERT IGNORE INTO notifications
             (user_id, message_title, message_body, trigger_type, source_type, source_id,
              action_path, priority, dedupe_key, scheduled_for, delivered_at)
           VALUES (?, 'Loan renewal approved', ?, 'Due Date', 'Borrow Transaction', ?,
                   '/student/borrowing', 'Important', ?, NOW(), NOW())`,
        ),
        [
          loan.userId,
          `${loan.title} was renewed. Its new due date is ${newDueAt.toLocaleString('en-PH')}.`,
          loan.transactionId,
          `loan:${loan.transactionId}:renewal:${renewalNumber}:approved:${renewalRequestId}`,
        ],
      )
    },
  }
}

export const renewalRepository = createRenewalRepository()
