import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { randomUUID } from 'node:crypto'
import { db } from '../../config/db.js'
import {
  authorsAgg,
  caseIf,
  currentDate,
  excluded,
  isPostgres,
  sumEquals,
} from '../../config/sql-dialect.js'
import { HttpError } from '../../core/http-error.ts'
import { calculateOperatingFine, loadFineContext } from '../fines/fine-calculator.ts'
import {
  assertTokenMatchesEvaluation,
  evaluateCheckoutRules,
  signPreflightToken,
  sortedWarningCodes,
  throwFirstBlocker,
  type CheckoutEvaluationContext,
  type CheckoutFlow,
} from './circulation-preflight.ts'
import { createBorrowingPolicyService } from './borrowing-policy.service.ts'
import { isMaterialBorrowable, roleBookLimit } from './borrowing-policy.types.ts'
import { formatDueCutoffLabel } from './due-date.ts'
import { createRenewalService, type RenewalActor } from './renewal.service.ts'
import {
  positiveCirculationId,
  validateBorrowCart,
  validateCancellation,
  validateCheckout,
  validateHistoryQuery,
  validatePreflight,
  type BorrowCartInput,
} from './circulation.validation.ts'

const ACTIVE_LOANS = "('Pending','Borrowed','Overdue')"
const ACTIVE_RESERVATIONS = "('pending','approved','ready_for_pickup')"
const WAITING_RESERVATIONS = "('pending','approved','ready_for_pickup')"

type OperationalUser = RowDataPacket & {
  user_id: number; full_name: string; institutional_id: string; school_id: string
  role_name: string; account_status: string
}

async function actorUserId(connection: PoolConnection, accountId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    'SELECT user_id FROM accounts WHERE account_id = ? AND user_id IS NOT NULL LIMIT 1 FOR UPDATE', [accountId],
  )
  return rows[0]?.user_id ? Number(rows[0].user_id) : null
}

async function findBorrower(connection: PoolConnection, userId: number | null, schoolId: string | null, forUpdate: boolean) {
  const [rows] = await connection.execute<OperationalUser[]>(
    `SELECT u.user_id, u.full_name, u.institutional_id, u.school_id,
            ro.role_name, u.account_status
       FROM users u INNER JOIN roles ro ON ro.role_id = u.role_id
      WHERE ${userId ? 'u.user_id = ?' : 'u.school_id = ?'} LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`, [userId ?? schoolId],
  )
  return rows[0] ?? null
}

async function lockBorrower(connection: PoolConnection, userId: number | null, schoolId: string | null) {
  const borrower = await findBorrower(connection, userId, schoolId, true)
  if (!borrower) throw new HttpError(404, 'CIRCULATION_BORROWER_NOT_FOUND', 'The borrower account was not found.')
  if (borrower.account_status !== 'Active') throw new HttpError(422, 'CIRCULATION_ACCOUNT_BLOCKED', 'This account is not active and cannot borrow materials.')
  return borrower
}

async function loadCheckoutEvaluationContext(
  connection: PoolConnection,
  input: { barcode: string; schoolId: string | null; userId: number | null; reservationId: number | null },
  flow: CheckoutFlow,
  borrowedAt: Date,
  forUpdate: boolean,
): Promise<CheckoutEvaluationContext> {
  const lockSuffix = forUpdate ? ` FOR UPDATE${isPostgres ? ' OF pc, t' : ''}` : ''
  const loanLock = forUpdate ? ' FOR UPDATE' : ''
  const reservationLock = forUpdate ? ' FOR UPDATE' : ''
  const borrower = await findBorrower(connection, input.userId, input.schoolId, forUpdate)
  const [copyRows] = await connection.execute<RowDataPacket[]>(
    `SELECT pc.physical_copy_id, pc.title_id, pc.material_id, pc.accession_number, pc.barcode, pc.condition_status,
            pc.availability_status, pc.lifecycle_status, t.title, m.material_type
       FROM physical_copies pc INNER JOIN titles t ON t.title_id = pc.title_id LEFT JOIN materials m ON m.material_id = pc.material_id
      WHERE pc.barcode = ? LIMIT 1${lockSuffix}`, [input.barcode],
  )
  const copy = copyRows[0] ?? null
  let openLoan: CheckoutEvaluationContext['openLoan'] = null
  let queueHead: CheckoutEvaluationContext['queueHead'] = null
  let studentActiveTitleCount = 0
  let targetTitleAlreadyActive = false
  let borrowerActiveOrOverdueCount = 0
  if (copy) {
    const [openRows] = await connection.execute<RowDataPacket[]>(
      `SELECT transaction_id, user_id, transaction_status, request_group_id, reservation_id
         FROM borrow_transactions
        WHERE (physical_copy_id = ? OR material_id = ?) AND transaction_status IN ${ACTIVE_LOANS}
        ORDER BY transaction_id ASC LIMIT 1${loanLock}`,
      [copy.physical_copy_id, copy.material_id],
    )
    if (openRows[0]) {
      openLoan = {
        transactionId: Number(openRows[0].transaction_id),
        userId: Number(openRows[0].user_id),
        status: String(openRows[0].transaction_status),
        reservationId: openRows[0].reservation_id ? Number(openRows[0].reservation_id) : null,
        requestGroupId: openRows[0].request_group_id ? String(openRows[0].request_group_id) : null,
      }
    }
    const [queueRows] = await connection.execute<RowDataPacket[]>(
      `SELECT reservation_id, user_id, queue_position, reservation_status FROM reservations
        WHERE book_title_id = ? AND reservation_status IN ${WAITING_RESERVATIONS}
        ORDER BY queue_position ASC, reserved_at ASC, reservation_id ASC LIMIT 1${reservationLock}`, [copy.title_id],
    )
    if (queueRows[0]) {
      queueHead = {
        reservationId: Number(queueRows[0].reservation_id),
        userId: Number(queueRows[0].user_id),
        status: String(queueRows[0].reservation_status),
      }
    }
  }
  if (borrower) {
    if (copy) {
      const [capacityRows] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(DISTINCT activity.title_id) AS active_count, ${isPostgres ? 'COUNT(*) FILTER (WHERE activity.title_id = ?) > 0' : 'MAX(activity.title_id = ?)'} AS target_already_active FROM (
           SELECT pc_active.title_id FROM borrow_transactions bt INNER JOIN physical_copies pc_active ON pc_active.physical_copy_id = bt.physical_copy_id
            WHERE bt.user_id = ? AND bt.transaction_status IN ${ACTIVE_LOANS}
           UNION ALL SELECT r.book_title_id FROM reservations r WHERE r.user_id = ? AND r.reservation_status IN ${ACTIVE_RESERVATIONS} AND r.book_title_id IS NOT NULL
         ) activity`, [copy.title_id, borrower.user_id, borrower.user_id],
      )
      studentActiveTitleCount = Number(capacityRows[0]?.active_count ?? 0)
      targetTitleAlreadyActive = Boolean(capacityRows[0]?.target_already_active)
    }
    const [activeLoanRows] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS active_count FROM borrow_transactions
        WHERE user_id = ? AND transaction_status IN ('Borrowed','Overdue')`,
      [borrower.user_id],
    )
    borrowerActiveOrOverdueCount = Number(activeLoanRows[0]?.active_count ?? 0)
  }
  const closedDates = await closedDateSet(connection, borrowedAt)
  return {
    flow,
    borrower: {
      found: Boolean(borrower),
      userId: borrower ? Number(borrower.user_id) : null,
      schoolId: borrower ? String(borrower.school_id) : null,
      name: borrower ? String(borrower.full_name) : null,
      role: borrower ? String(borrower.role_name) : null,
      accountStatus: borrower ? String(borrower.account_status) : null,
    },
    copy: {
      found: Boolean(copy),
      physicalCopyId: copy ? Number(copy.physical_copy_id) : null,
      barcode: copy ? String(copy.barcode) : null,
      accessionNumber: copy ? String(copy.accession_number) : null,
      title: copy ? String(copy.title) : null,
      condition: copy ? String(copy.condition_status) : null,
      availability: copy ? String(copy.availability_status) : null,
      lifecycleStatus: copy ? String(copy.lifecycle_status) : null,
      materialId: copy?.material_id ? Number(copy.material_id) : null,
      materialType: copy?.material_type ? String(copy.material_type) : null,
      titleId: copy ? Number(copy.title_id) : null,
    },
    openLoan,
    queueHead,
    selectedReservationId: input.reservationId,
    studentActiveTitleCount,
    targetTitleAlreadyActive,
    borrowerActiveOrOverdueCount,
    borrowedAt,
    closedDates,
  }
}

async function closedDateSet(connection: PoolConnection, borrowedAt: Date) {
  const horizon = new Date(borrowedAt); horizon.setDate(horizon.getDate() + 31)
  const [rows] = await connection.execute<RowDataPacket[]>(
    'SELECT closed_date FROM library_closed_days WHERE closed_date > DATE(?) AND closed_date <= DATE(?)', [borrowedAt, horizon],
  )
  return new Set(rows.map((row) => {
    const value = row.closed_date
    if (value instanceof Date) {
      const year = value.getFullYear(); const month = String(value.getMonth() + 1).padStart(2, '0'); const day = String(value.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    return String(value).slice(0, 10)
  }))
}

async function compactQueue(connection: PoolConnection, titleId: number, removedPosition: number) {
  const [result] = await connection.execute<ResultSetHeader>(
    `UPDATE reservations SET queue_position = queue_position - 1, updated_at = NOW()
      WHERE book_title_id = ? AND reservation_status IN ${WAITING_RESERVATIONS} AND queue_position > ?`,
    [titleId, removedPosition],
  )
  return result.affectedRows
}

export function createCirculationService(database: Pool = db, clock: () => Date = () => new Date()) {
  const policyService = createBorrowingPolicyService(database, clock)
  const renewalService = createRenewalService(database, clock)
  return {
    async history(accountIdValue: unknown, query: Record<string, unknown>) {
      const accountId = positiveCirculationId(accountIdValue, 'accountId')
      const filters = validateHistoryQuery(query)
      const [identityRows] = await database.execute<RowDataPacket[]>('SELECT user_id, role FROM accounts WHERE account_id = ? LIMIT 1', [accountId])
      const identity = identityRows[0]
      if (!identity?.user_id) throw new HttpError(422, 'CIRCULATION_PROFILE_NOT_LINKED', 'This login account is not linked to a circulation profile.')
      const userId = Number(identity.user_id)
      const offset = (filters.page - 1) * filters.limit
      const policy = await policyService.resolveActive(database, clock())
      const [[rows], [countRows], [activityRows]] = await Promise.all([
        database.execute<RowDataPacket[]>(
          `SELECT bt.transaction_id, bt.borrowed_at, bt.due_at, bt.initial_due_at, bt.renewal_count, bt.returned_at,
              CASE WHEN bt.transaction_status = 'Borrowed' AND bt.due_at < NOW() THEN 'Overdue' ELSE bt.transaction_status END AS transaction_status,
              t.title_id, COALESCE(t.title, m.title) AS title, COALESCE(credits.author, m.author, 'Unknown author') AS author,
              t.cover_image_path,
              pc.accession_number, COALESCE(pc.barcode, m.barcode) AS barcode,
              lbr.report_status AS lost_report_status, m.material_type, pc.condition_status,
              pc.lifecycle_status AS copy_lifecycle_status, t.lifecycle_status AS title_lifecycle_status,
              (SELECT rr.status FROM loan_renewal_requests rr WHERE rr.transaction_id = bt.transaction_id ORDER BY rr.created_at DESC, rr.renewal_request_id DESC LIMIT 1) AS last_renewal_status,
              (SELECT rr.decision_summary FROM loan_renewal_requests rr WHERE rr.transaction_id = bt.transaction_id ORDER BY rr.created_at DESC, rr.renewal_request_id DESC LIMIT 1) AS last_renewal_decision_summary,
              (SELECT rr.decided_at FROM loan_renewal_requests rr WHERE rr.transaction_id = bt.transaction_id ORDER BY rr.created_at DESC, rr.renewal_request_id DESC LIMIT 1) AS last_renewal_at,
              (SELECT rr.decision_source FROM loan_renewal_requests rr WHERE rr.transaction_id = bt.transaction_id ORDER BY rr.created_at DESC, rr.renewal_request_id DESC LIMIT 1) AS last_renewal_decision_source,
              (SELECT COUNT(*) FROM reservations r WHERE r.book_title_id = t.title_id AND r.user_id <> bt.user_id AND r.reservation_status IN ('pending','approved','ready_for_pickup')) AS waiting_renewals,
              (SELECT COUNT(*) FROM fines f WHERE f.user_id = bt.user_id AND f.payment_status IN ('Accruing','Unpaid','Partially Paid')) AS blocking_fines,
              (SELECT COUNT(*) FROM lost_book_reports loss WHERE loss.user_id = bt.user_id AND loss.report_status = 'Confirmed' AND loss.payment_status = 'Unpaid') AS blocking_lost_charges,
              (SELECT COUNT(*) FROM lost_book_reports report WHERE report.transaction_id = bt.transaction_id AND report.report_status IN ('Pending','Confirmed')) AS blocking_lost_reports
             FROM borrow_transactions bt INNER JOIN materials m ON m.material_id = bt.material_id
             LEFT JOIN physical_copies pc ON pc.physical_copy_id = bt.physical_copy_id OR (bt.physical_copy_id IS NULL AND pc.material_id = bt.material_id)
             LEFT JOIN titles t ON t.title_id = pc.title_id
             LEFT JOIN lost_book_reports lbr ON lbr.transaction_id = bt.transaction_id
             LEFT JOIN (SELECT a.title_id, ${authorsAgg('a')} AS author FROM authors a GROUP BY a.title_id) credits ON credits.title_id = t.title_id
            WHERE bt.user_id = ? ORDER BY COALESCE(bt.borrowed_at, bt.created_at) DESC, bt.transaction_id DESC
            LIMIT ${filters.limit} OFFSET ${offset}`, [userId],
        ),
        database.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM borrow_transactions WHERE user_id = ?', [userId]),
        database.execute<RowDataPacket[]>(
          `SELECT
             (SELECT COUNT(*) FROM borrow_transactions WHERE user_id = ? AND transaction_status IN ${ACTIVE_LOANS}) AS active_loans,
             (SELECT COUNT(*) FROM reservations WHERE user_id = ? AND reservation_status IN ${ACTIVE_RESERVATIONS}) AS active_reservations,
             (SELECT MIN(due_at) FROM borrow_transactions WHERE user_id = ? AND transaction_status IN ('Borrowed','Overdue')) AS next_due_at`,
          [userId, userId, userId],
        ),
      ])
      const activity = activityRows[0] ?? {}; const role = String(identity.role)
      const activeLoans = Number(activity.active_loans ?? 0); const activeReservations = Number(activity.active_reservations ?? 0)
      const total = Number(countRows[0]?.total ?? 0)
      const loanLimit = roleBookLimit(policy, role)
      const activeStack = activeLoans + activeReservations
      return {
        summary: { role, activeLoans, activeReservations, activeStackCount: activeStack,
          loanLimit, remainingLoanSlots: loanLimit === null ? null : Math.max(0, loanLimit - activeStack),
          nextDueAt: activity.next_due_at ?? null, dueCutoffLabel: formatDueCutoffLabel(policy.dueTimeCutoff),
          policyVersionId: policy.versionId },
        items: rows.map((row) => {
          const renewalCount = Number(row.renewal_count ?? 0)
          const status = String(row.transaction_status)
          const dueAt = row.due_at ? new Date(row.due_at) : null
          const canRequestRenewal = status === 'Borrowed'
            && dueAt !== null
            && clock() < dueAt
            && renewalCount < policy.maxRenewals
            && isMaterialBorrowable(policy, String(row.material_type))
            && row.condition_status !== 'Lost'
            && row.copy_lifecycle_status !== 'Archived'
            && row.title_lifecycle_status !== 'Archived'
            && Number(row.waiting_renewals ?? 0) === 0
            && Number(row.blocking_fines ?? 0) === 0
            && Number(row.blocking_lost_charges ?? 0) === 0
            && Number(row.blocking_lost_reports ?? 0) === 0
          return {
            transactionId: Number(row.transaction_id), titleId: row.title_id ? Number(row.title_id) : null,
            title: row.title ?? 'Catalog title unavailable', author: row.author,
            coverImagePath: row.cover_image_path ? String(row.cover_image_path) : null,
            accessionNumber: row.accession_number ?? null, barcode: row.barcode ?? null,
            borrowDate: row.borrowed_at, initialDueAt: row.initial_due_at ?? row.due_at, dueDate: row.due_at,
            returnDate: row.returned_at, status, lostReportStatus: row.lost_report_status ? String(row.lost_report_status) : null,
            renewalCount, maxRenewals: policy.maxRenewals,
            remainingRenewals: Math.max(0, policy.maxRenewals - renewalCount),
            lastRenewalStatus: row.last_renewal_status ? String(row.last_renewal_status) : null,
            lastRenewalDecisionSummary: row.last_renewal_decision_summary ? String(row.last_renewal_decision_summary) : null,
            lastRenewalAt: row.last_renewal_at ?? null,
            lastRenewalDecisionSource: row.last_renewal_decision_source ? String(row.last_renewal_decision_source) : null,
            canRequestRenewal,
          }
        }),
        pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) },
      }
    },

    async submitBorrowRequest(accountIdValue: unknown, body: unknown | BorrowCartInput) {
      const accountId = positiveCirculationId(accountIdValue, 'accountId')
      const input = validateBorrowCart(body)
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const userId = await actorUserId(connection, accountId)
        if (!userId) throw new HttpError(422, 'CIRCULATION_PROFILE_NOT_LINKED', 'This login account is not linked to a circulation profile.')
        const borrower = await lockBorrower(connection, userId, null)
        if (!['Student', 'Faculty'].includes(String(borrower.role_name))) {
          throw new HttpError(403, 'BORROW_ROLE_FORBIDDEN', 'Only Student and Faculty accounts can submit book carts.')
        }

        const placeholders = input.titleIds.map(() => '?').join(', ')
        const [commitmentRows] = await connection.execute<RowDataPacket[]>(
          `SELECT COUNT(DISTINCT activity.title_id) AS active_count,
                  COUNT(DISTINCT CASE WHEN activity.title_id IN (${placeholders}) THEN activity.title_id END) AS requested_active_count
             FROM (
               SELECT pc_active.title_id
                 FROM borrow_transactions bt
                 INNER JOIN physical_copies pc_active ON pc_active.physical_copy_id = bt.physical_copy_id
                WHERE bt.user_id = ? AND bt.transaction_status IN ${ACTIVE_LOANS}
               UNION ALL
               SELECT r.book_title_id
                 FROM reservations r
                WHERE r.user_id = ? AND r.reservation_status IN ${ACTIVE_RESERVATIONS} AND r.book_title_id IS NOT NULL
             ) activity`,
          [...input.titleIds, borrower.user_id, borrower.user_id],
        )
        const activeCount = Number(commitmentRows[0]?.active_count ?? 0)
        if (Number(commitmentRows[0]?.requested_active_count ?? 0) > 0) {
          throw new HttpError(422, 'CART_TITLE_ALREADY_ACTIVE', 'One or more selected books already have an active loan or reservation.', {
            activeCount,
          })
        }
        const policy = await policyService.resolveActive(connection, clock())
        const bookLimit = roleBookLimit(policy, String(borrower.role_name))
        if (bookLimit !== null && activeCount + input.titleIds.length > bookLimit) {
          throw new HttpError(422, 'STUDENT_BORROW_LIMIT_REACHED', `Transaction Blocked: ${borrower.role_name} cannot exceed ${bookLimit} books`, {
            activeCount,
            incomingCount: input.titleIds.length,
            projectedCount: activeCount + input.titleIds.length,
            limit: bookLimit,
            policyVersionId: policy.versionId,
          })
        }

        const [copyRows] = await connection.execute<RowDataPacket[]>(
          `SELECT t.title_id, t.title, pc.physical_copy_id, pc.material_id, pc.accession_number, pc.barcode,
                  pc.condition_status, pc.availability_status, pc.lifecycle_status, m.material_type
             FROM titles t
             INNER JOIN physical_copies pc ON pc.title_id = t.title_id
             LEFT JOIN materials m ON m.material_id = pc.material_id
            WHERE t.title_id IN (${placeholders})
              AND t.record_type = 'Book'
              AND t.lifecycle_status = 'Active'
              AND pc.lifecycle_status = 'Active'
            ORDER BY t.title_id ASC, pc.physical_copy_id ASC
            FOR UPDATE${isPostgres ? ' OF t, pc' : ''}`,
          input.titleIds,
        )
        const selectedCopies = new Map<number, RowDataPacket>()
        for (const row of copyRows) {
          const titleId = Number(row.title_id)
          if (selectedCopies.has(titleId)) continue
          if (!row.material_id || (row.material_type && row.material_type !== 'Book')) continue
          if (String(row.availability_status) !== 'Available') continue
          if (String(row.condition_status) === 'Lost') continue
          selectedCopies.set(titleId, row)
        }
        const unavailableTitleIds = input.titleIds.filter((titleId) => !selectedCopies.has(titleId))
        if (unavailableTitleIds.length) {
          const titleNames = new Map(copyRows.map((row) => [Number(row.title_id), String(row.title)]))
          const unavailableTitles = unavailableTitleIds.map((titleId) => titleNames.get(titleId) ?? `Book #${titleId}`)
          throw new HttpError(422, 'CART_COPY_UNAVAILABLE', `Unavailable: ${unavailableTitles.join(', ')}. Refresh the catalog and review your cart.`, {
            unavailableTitleIds, unavailableTitles,
          })
        }

        // A title-level waitlist owns the next available copy even before an
        // accession is assigned. Checking only assigned_physical_copy_id lets
        // a later online cart steal a copy from the first reservation.
        const [waitingReservationRows] = await connection.execute<RowDataPacket[]>(
          `SELECT r.reservation_id, r.book_title_id, r.user_id, r.queue_position,
                  r.reservation_status, t.title
             FROM reservations r INNER JOIN titles t ON t.title_id = r.book_title_id
            WHERE r.book_title_id IN (${placeholders})
              AND r.reservation_status IN ${ACTIVE_RESERVATIONS}
            ORDER BY r.book_title_id ASC, r.queue_position ASC, r.reserved_at ASC
            FOR UPDATE`,
          input.titleIds,
        )
        if (waitingReservationRows.length) {
          const reservedTitles = [...new Set(waitingReservationRows.map((row) => String(row.title)))]
          throw new HttpError(422, 'CART_TITLE_RESERVED_FOR_QUEUE',
            `Reserved for the waiting queue: ${reservedTitles.join(', ')}. Use the Reserve action instead of adding this title to the borrow cart.`, {
              titleIds: [...new Set(waitingReservationRows.map((row) => Number(row.book_title_id)))],
              reservedTitles,
            })
        }

        const selectedCopyIds = [...selectedCopies.values()].map((row) => Number(row.physical_copy_id))
        const copyPlaceholders = selectedCopyIds.map(() => '?').join(', ')
        const [reservationRows] = await connection.execute<RowDataPacket[]>(
          `SELECT reservation_id, assigned_physical_copy_id
             FROM reservations
            WHERE assigned_physical_copy_id IN (${copyPlaceholders})
              AND reservation_status IN ${ACTIVE_RESERVATIONS}
            FOR UPDATE`,
          selectedCopyIds,
        )
        if (reservationRows.length) {
          throw new HttpError(422, 'CART_COPY_RESERVED', 'One or more physical copies have just been reserved. Refresh the catalog and try again.')
        }

        const requestGroupId = randomUUID()
        const items: Array<Record<string, unknown>> = []
        let firstTransactionId: number | null = null
        for (const titleId of input.titleIds) {
          const copy = selectedCopies.get(titleId)!
          const [insert] = await connection.execute<ResultSetHeader>(
            `INSERT INTO borrow_transactions
               (user_id, material_id, physical_copy_id, request_group_id, processed_by_user_id, borrowed_at, due_at, transaction_status, created_at)
             VALUES (?, ?, ?, ?, NULL, NULL, NULL, 'Pending', NOW())`,
            [borrower.user_id, copy.material_id, copy.physical_copy_id, requestGroupId],
          )
          firstTransactionId ??= Number(insert.insertId)
          await connection.execute(
            "UPDATE physical_copies SET availability_status = 'Reserved', row_version = row_version + 1, updated_at = NOW() WHERE physical_copy_id = ?",
            [copy.physical_copy_id],
          )
          await connection.execute(
            "UPDATE materials SET availability_status = 'Reserved', updated_at = NOW() WHERE material_id = ?",
            [copy.material_id],
          )
          items.push({
            transactionId: Number(insert.insertId), titleId, title: copy.title,
            physicalCopyId: Number(copy.physical_copy_id), accessionNumber: copy.accession_number, barcode: copy.barcode,
          })
        }
        await connection.execute(
          `INSERT INTO admin_notifications
             (event_type, actor_user_id, borrow_transaction_id, book_title_id, message_title, message_body)
           VALUES ('borrow_request_submitted', ?, ?, ?, 'Online borrow request', ?)`,
          [borrower.user_id, firstTransactionId, input.titleIds[0], `${borrower.full_name} submitted ${items.length} book${items.length === 1 ? '' : 's'} for counter claim.`],
        )
        await connection.commit()
        return {
          requestGroupId,
          status: 'pending_claim',
          instructions: 'Go to the library to claim and confirm books.',
          borrower: { userId: Number(borrower.user_id), name: borrower.full_name, schoolId: borrower.school_id, role: borrower.role_name },
          items,
        }
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async cancelRequest(actorValue: unknown, transactionIdValue: unknown, body: unknown) {
      const actor = actorValue && typeof actorValue === 'object' ? actorValue as { accountId?: unknown; role?: unknown } : {}
      const actorAccountId = positiveCirculationId(actor.accountId, 'actorAccountId')
      const actorRole = String(actor.role ?? '')
      if (!['Student', 'Faculty', 'Admin'].includes(actorRole)) {
        throw new HttpError(403, 'CIRCULATION_CANCEL_FORBIDDEN', 'Your role cannot cancel borrowing requests.')
      }
      const transactionId = positiveCirculationId(transactionIdValue, 'transactionId')
      const input = validateCancellation(body)
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const cancellingUserId = await actorUserId(connection, actorAccountId)
        const [rows] = await connection.execute<RowDataPacket[]>(
          `SELECT bt.transaction_id, bt.user_id, bt.material_id, bt.physical_copy_id,
                  bt.transaction_status, pc.title_id, pc.condition_status, pc.lifecycle_status,
                  COALESCE(t.title, m.title) AS title
             FROM borrow_transactions bt
             INNER JOIN materials m ON m.material_id = bt.material_id
             LEFT JOIN physical_copies pc
               ON pc.physical_copy_id = bt.physical_copy_id
               OR (bt.physical_copy_id IS NULL AND pc.material_id = bt.material_id)
             LEFT JOIN titles t ON t.title_id = pc.title_id
            WHERE bt.transaction_id = ?
            LIMIT 1 FOR UPDATE${isPostgres ? ' OF bt, m' : ''}`,
          [transactionId],
        )
        const request = rows[0]
        if (!request) throw new HttpError(404, 'BORROW_REQUEST_NOT_FOUND', 'The pending borrow request was not found.')
        const staffOverride = actorRole === 'Admin'
        if (!staffOverride && (!cancellingUserId || Number(request.user_id) !== cancellingUserId)) {
          throw new HttpError(403, 'BORROW_REQUEST_NOT_OWNED', 'You can cancel only your own pending borrow request.')
        }
        if (String(request.transaction_status) !== 'Pending') {
          throw new HttpError(422, 'BORROW_REQUEST_CANCELLATION_INVALID', 'Only a pending counter-claim request can be cancelled.')
        }

        const [reservationRows] = await connection.execute<RowDataPacket[]>(
          `SELECT reservation_id FROM reservations
            WHERE (assigned_physical_copy_id = ? OR material_id = ?)
              AND reservation_status IN ${ACTIVE_RESERVATIONS}
            LIMIT 1 FOR UPDATE`,
          [request.physical_copy_id, request.material_id],
        )
        const copyUsable = request.lifecycle_status === 'Active'
          && String(request.condition_status) !== 'Lost'
        const copyAvailability = reservationRows.length ? 'Reserved' : copyUsable ? 'Available' : 'Unavailable'
        const cancelledAt = clock()

        await connection.execute(
          `UPDATE borrow_transactions
              SET transaction_status = 'Cancelled', cancelled_at = ?, cancelled_by_user_id = ?,
                  cancellation_reason = ?, updated_at = NOW()
            WHERE transaction_id = ?`,
          [cancelledAt, cancellingUserId, input.reason, transactionId],
        )
        if (request.physical_copy_id) {
          await connection.execute(
            'UPDATE physical_copies SET availability_status = ?, row_version = row_version + 1, updated_at = NOW() WHERE physical_copy_id = ?',
            [copyAvailability, request.physical_copy_id],
          )
        }
        await connection.execute(
          'UPDATE materials SET availability_status = ?, updated_at = NOW() WHERE material_id = ?',
          [copyAvailability, request.material_id],
        )
        await connection.execute(
          `INSERT INTO admin_notifications
             (event_type, actor_user_id, borrow_transaction_id, book_title_id, message_title, message_body)
           VALUES ('borrow_request_cancelled', ?, ?, ?, 'Borrow request cancelled', ?)`,
          [cancellingUserId, transactionId, request.title_id ?? null,
            `${request.title} pending claim was cancelled by ${actorRole}.`],
        )
        await connection.commit()
        return { transactionId, status: 'Cancelled' as const, copyAvailability, cancelledAt }
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async monitor(query: Record<string, unknown>) {
      const filters = validateHistoryQuery(query); const offset = (filters.page - 1) * filters.limit
      const policy = await policyService.resolveActive(database, clock())
      const fromSql = `FROM borrow_transactions bt INNER JOIN users u ON u.user_id = bt.user_id
        INNER JOIN roles ro ON ro.role_id = u.role_id INNER JOIN materials m ON m.material_id = bt.material_id
        LEFT JOIN accounts acc ON acc.user_id = bt.user_id
        LEFT JOIN physical_copies pc ON pc.physical_copy_id = bt.physical_copy_id OR (bt.physical_copy_id IS NULL AND pc.material_id = bt.material_id)
        LEFT JOIN titles t ON t.title_id = pc.title_id`
      const [[rows], [summaryRows], [countRows]] = await Promise.all([
        database.execute<RowDataPacket[]>(
          `SELECT bt.transaction_id, u.full_name, u.school_id, ro.role_name, u.account_status AS user_account_status,
             acc.account_status AS normalized_account_status, COALESCE(t.title, m.title) AS title,
             pc.accession_number, COALESCE(pc.barcode, m.barcode) AS barcode, bt.created_at AS requested_at,
             bt.borrowed_at, bt.due_at, bt.initial_due_at, bt.renewal_count, bt.returned_at,
             m.material_type, pc.condition_status, pc.lifecycle_status AS copy_lifecycle_status,
             t.lifecycle_status AS title_lifecycle_status,
             (SELECT rr.status FROM loan_renewal_requests rr WHERE rr.transaction_id = bt.transaction_id ORDER BY rr.created_at DESC, rr.renewal_request_id DESC LIMIT 1) AS last_renewal_status,
             (SELECT rr.decision_summary FROM loan_renewal_requests rr WHERE rr.transaction_id = bt.transaction_id ORDER BY rr.created_at DESC, rr.renewal_request_id DESC LIMIT 1) AS last_renewal_decision_summary,
             (SELECT rr.decided_at FROM loan_renewal_requests rr WHERE rr.transaction_id = bt.transaction_id ORDER BY rr.created_at DESC, rr.renewal_request_id DESC LIMIT 1) AS last_renewal_at,
             (SELECT rr.decision_source FROM loan_renewal_requests rr WHERE rr.transaction_id = bt.transaction_id ORDER BY rr.created_at DESC, rr.renewal_request_id DESC LIMIT 1) AS last_renewal_decision_source,
             (SELECT COUNT(*) FROM reservations r WHERE r.book_title_id = t.title_id AND r.user_id <> bt.user_id AND r.reservation_status IN ('pending','approved','ready_for_pickup')) AS waiting_renewals,
             (SELECT COUNT(*) FROM fines f WHERE f.user_id = bt.user_id AND f.payment_status IN ('Accruing','Unpaid','Partially Paid')) AS blocking_fines,
             (SELECT COUNT(*) FROM lost_book_reports loss WHERE loss.user_id = bt.user_id AND loss.report_status = 'Confirmed' AND loss.payment_status = 'Unpaid') AS blocking_lost_charges,
             (SELECT COUNT(*) FROM lost_book_reports report WHERE report.transaction_id = bt.transaction_id AND report.report_status IN ('Pending','Confirmed')) AS blocking_lost_reports,
             CASE WHEN bt.transaction_status = 'Borrowed' AND bt.due_at < NOW() THEN 'Overdue' ELSE bt.transaction_status END AS transaction_status
           ${fromSql} ORDER BY ${isPostgres
             ? `CASE (CASE WHEN bt.transaction_status = 'Borrowed' AND bt.due_at < NOW() THEN 'Overdue' ELSE bt.transaction_status END) WHEN 'Overdue' THEN 1 WHEN 'Borrowed' THEN 2 WHEN 'Pending' THEN 3 WHEN 'Returned' THEN 4 ELSE 5 END`
             : `FIELD(CASE WHEN bt.transaction_status = 'Borrowed' AND bt.due_at < NOW() THEN 'Overdue' ELSE bt.transaction_status END, 'Overdue','Borrowed','Pending','Returned')`}, bt.due_at ASC, bt.transaction_id DESC LIMIT ${filters.limit} OFFSET ${offset}`,
        ),
        database.execute<RowDataPacket[]>(
          `SELECT ${sumEquals('transaction_status', 'Pending')} AS pending_claims,
             ${isPostgres
    ? `COUNT(*) FILTER (WHERE transaction_status = 'Borrowed' AND due_at >= NOW())`
    : `SUM(transaction_status = 'Borrowed' AND due_at >= NOW())`} AS active_loans,
             ${isPostgres
    ? `COUNT(*) FILTER (WHERE transaction_status = 'Overdue' OR (transaction_status = 'Borrowed' AND due_at < NOW()))`
    : `SUM(transaction_status = 'Overdue' OR (transaction_status = 'Borrowed' AND due_at < NOW()))`} AS overdue_loans,
             ${isPostgres
    ? `COUNT(*) FILTER (WHERE transaction_status = 'Returned' AND DATE(returned_at) = ${currentDate()})`
    : `SUM(transaction_status = 'Returned' AND DATE(returned_at) = CURDATE())`} AS returned_today,
             ${isPostgres
    ? `COUNT(*) FILTER (WHERE transaction_status IN ('Borrowed','Overdue') AND DATE(due_at) = ${currentDate()})`
    : `SUM(transaction_status IN ('Borrowed','Overdue') AND DATE(due_at) = CURDATE())`} AS due_today FROM borrow_transactions`,
        ),
        database.execute<RowDataPacket[]>('SELECT COUNT(*) AS total FROM borrow_transactions'),
      ])
      const summary = summaryRows[0] ?? {}; const total = Number(countRows[0]?.total ?? 0)
      return {
        summary: { pendingClaims: Number(summary.pending_claims ?? 0), activeLoans: Number(summary.active_loans ?? 0), overdueLoans: Number(summary.overdue_loans ?? 0), returnedToday: Number(summary.returned_today ?? 0), dueToday: Number(summary.due_today ?? 0) },
        items: rows.map((row) => {
          const renewalCount = Number(row.renewal_count ?? 0)
          const status = String(row.transaction_status)
          const dueAt = row.due_at ? new Date(row.due_at) : null
          const canRequestRenewal = status === 'Borrowed'
            && dueAt !== null
            && clock() < dueAt
            && row.user_account_status === 'Active'
            && row.normalized_account_status === 'Active'
            && renewalCount < policy.maxRenewals
            && isMaterialBorrowable(policy, String(row.material_type))
            && row.condition_status !== 'Lost'
            && row.copy_lifecycle_status !== 'Archived'
            && row.title_lifecycle_status !== 'Archived'
            && Number(row.waiting_renewals ?? 0) === 0
            && Number(row.blocking_fines ?? 0) === 0
            && Number(row.blocking_lost_charges ?? 0) === 0
            && Number(row.blocking_lost_reports ?? 0) === 0
          return {
            transactionId: Number(row.transaction_id), userName: row.full_name, schoolId: row.school_id,
            role: row.role_name, title: row.title, accessionNumber: row.accession_number ?? null,
            barcode: row.barcode, requestedAt: row.requested_at, borrowDate: row.borrowed_at,
            initialDueAt: row.initial_due_at ?? row.due_at, dueDate: row.due_at,
            returnDate: row.returned_at, status, renewalCount, maxRenewals: policy.maxRenewals,
            remainingRenewals: Math.max(0, policy.maxRenewals - renewalCount),
            lastRenewalStatus: row.last_renewal_status ? String(row.last_renewal_status) : null,
            lastRenewalDecisionSummary: row.last_renewal_decision_summary ? String(row.last_renewal_decision_summary) : null,
            lastRenewalAt: row.last_renewal_at ?? null,
            lastRenewalDecisionSource: row.last_renewal_decision_source ? String(row.last_renewal_decision_source) : null,
            canRequestRenewal,
          }
        }),
        pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) },
      }
    },

    async preflightCheckout(actorAccountIdValue: unknown, body: unknown) {
      const actorAccountId = positiveCirculationId(actorAccountIdValue, 'actorAccountId')
      const input = validatePreflight(body)
      const connection = await database.getConnection()
      try {
        const borrowedAt = clock()
        const policy = await policyService.resolveActive(connection, borrowedAt)
        const context = await loadCheckoutEvaluationContext(connection, input, input.flow, borrowedAt, false)
        const evaluation = evaluateCheckoutRules(context, policy)
        const payload = {
          decision: evaluation.decision,
          expiresAt: null as string | null,
          borrower: context.borrower.found ? {
            userId: context.borrower.userId,
            schoolId: context.borrower.schoolId,
            name: context.borrower.name,
            role: context.borrower.role,
          } : null,
          copy: context.copy.found ? {
            physicalCopyId: context.copy.physicalCopyId,
            barcode: context.copy.barcode,
            accessionNumber: context.copy.accessionNumber,
            title: context.copy.title,
            condition: context.copy.condition,
            availability: context.copy.availability,
          } : null,
          dueAt: evaluation.dueAt,
          policyVersionId: policy.versionId,
          policyDisplayName: `Policy ${policy.versionId}`,
          policyEffectiveOn: policy.effectiveOn,
          dueCutoffLabel: formatDueCutoffLabel(policy.dueTimeCutoff),
          blockers: evaluation.blockers.map(({ code, message }) => ({ code, message })),
          warnings: evaluation.warnings.map(({ code, message }) => ({ code, message })),
          alerts: evaluation.alerts.map(({ code, message }) => ({ code, message })),
          preflightToken: null as string | null,
        }
        if (evaluation.decision !== 'blocked' && context.borrower.userId && context.copy.physicalCopyId) {
          const signed = signPreflightToken({
            accountId: actorAccountId,
            borrowerUserId: context.borrower.userId,
            physicalCopyId: context.copy.physicalCopyId,
            reservationId: evaluation.fulfilledReservationId,
            flow: input.flow,
            warningCodes: sortedWarningCodes(evaluation.warnings),
            policyVersionId: policy.versionId,
          })
          payload.preflightToken = signed.token
          payload.expiresAt = signed.expiresAt.toISOString()
        }
        return payload
      } finally {
        connection.release()
      }
    },

    async confirmCheckout(actorAccountIdValue: unknown, body: unknown, requirePendingDeskClaim = false) {
      const actorAccountId = positiveCirculationId(actorAccountIdValue, 'actorAccountId')
      const input = validateCheckout(body)
      const flow: CheckoutFlow = requirePendingDeskClaim ? 'claim' : 'walk_in'
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const processedByUserId = await actorUserId(connection, actorAccountId)
        const borrowedAt = clock()
        const policy = await policyService.resolveActive(connection, borrowedAt)
        const context = await loadCheckoutEvaluationContext(connection, input, flow, borrowedAt, true)
        const evaluation = evaluateCheckoutRules(context, policy)
        if (evaluation.decision === 'blocked') throwFirstBlocker(evaluation, roleBookLimit(policy, context.borrower.role))
        if (!context.borrower.userId || !context.copy.physicalCopyId || !context.copy.materialId || !context.copy.titleId) {
          throw new HttpError(422, 'CIRCULATION_VALIDATION_FAILED', 'Checkout context is incomplete.')
        }
        const confirmation = assertTokenMatchesEvaluation({
          token: input.preflightToken,
          overrideReason: input.overrideReason,
          accountId: actorAccountId,
          borrowerUserId: context.borrower.userId,
          physicalCopyId: context.copy.physicalCopyId,
          reservationId: evaluation.fulfilledReservationId,
          flow,
          evaluation,
          activePolicyVersionId: policy.versionId,
        })
        const dueAt = evaluation.dueAt
        const pendingClaim = evaluation.pendingClaim
        let transactionId: number
        if (pendingClaim) {
          transactionId = pendingClaim.transactionId
          await connection.execute(
            `UPDATE borrow_transactions
                SET processed_by_user_id = ?, borrowed_at = ?, due_at = ?, initial_due_at = ?,
                    borrowing_policy_version_id = ?,
                    transaction_status = 'Borrowed', updated_at = NOW()
              WHERE transaction_id = ?`,
            [processedByUserId, borrowedAt, dueAt, dueAt, policy.versionId, transactionId],
          )
        } else {
          const [insert] = await connection.execute<ResultSetHeader>(
            `INSERT INTO borrow_transactions
               (user_id, material_id, physical_copy_id, borrowing_policy_version_id, processed_by_user_id,
                borrowed_at, due_at, initial_due_at, transaction_status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Borrowed', NOW())`,
            [context.borrower.userId, context.copy.materialId, context.copy.physicalCopyId, policy.versionId, processedByUserId, borrowedAt, dueAt, dueAt],
          )
          transactionId = Number(insert.insertId)
        }
        if (evaluation.fulfilledReservationId && context.queueHead) {
          const [queueRows] = await connection.execute<RowDataPacket[]>(
            `SELECT queue_position FROM reservations WHERE reservation_id = ? LIMIT 1`,
            [evaluation.fulfilledReservationId],
          )
          const queuePosition = Number(queueRows[0]?.queue_position ?? 1)
          await connection.execute(
            `UPDATE reservations SET reservation_status = 'claimed', accession_id = ?, assigned_physical_copy_id = ?, pickup_deadline = NULL, updated_at = NOW() WHERE reservation_id = ?`,
            [context.copy.materialId, context.copy.physicalCopyId, evaluation.fulfilledReservationId],
          )
          await compactQueue(connection, context.copy.titleId, queuePosition)
        }
        await connection.execute("UPDATE physical_copies SET availability_status = 'Borrowed', row_version = row_version + 1, updated_at = NOW() WHERE physical_copy_id = ?", [context.copy.physicalCopyId])
        await connection.execute("UPDATE materials SET availability_status = 'Borrowed', updated_at = NOW() WHERE material_id = ?", [context.copy.materialId])
        await connection.execute(
          `INSERT INTO notifications (user_id, message_title, message_body, trigger_type, is_read) VALUES (?, 'Borrow confirmed', ?, 'Due Date', 0)`,
          [context.borrower.userId, `${context.copy.title} is due at 8:59 AM on ${dueAt.toLocaleDateString('en-CA')}.`],
        )
        await connection.execute(
          `INSERT INTO admin_notifications (event_type, actor_user_id, reservation_id, borrow_transaction_id, book_title_id, message_title, message_body) VALUES ('checkout_confirmed', ?, ?, ?, ?, 'Checkout confirmed', ?)`,
          [context.borrower.userId, evaluation.fulfilledReservationId, transactionId, context.copy.titleId, `${context.borrower.name} borrowed ${context.copy.title}.`],
        )
        if (confirmation.overrideReason && confirmation.decisionId && confirmation.warningCodes.length > 0 && processedByUserId) {
          await connection.execute(
            `INSERT INTO circulation_override_events
              (borrow_transaction_id, borrower_user_id, physical_copy_id, approved_by_user_id, warning_codes, override_reason, preflight_decision_id, approved_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              transactionId,
              context.borrower.userId,
              context.copy.physicalCopyId,
              processedByUserId,
              JSON.stringify(confirmation.warningCodes),
              confirmation.overrideReason,
              confirmation.decisionId,
              borrowedAt,
            ],
          )
        }
        await connection.commit()
        return {
          transactionId,
          requestGroupId: pendingClaim?.requestGroupId ?? null,
          borrower: {
            userId: context.borrower.userId,
            name: context.borrower.name,
            schoolId: context.borrower.schoolId,
            role: context.borrower.role,
          },
          copy: {
            physicalCopyId: context.copy.physicalCopyId,
            title: context.copy.title,
            accessionNumber: context.copy.accessionNumber,
            barcode: context.copy.barcode,
          },
          status: 'Borrowed' as const,
          borrowedAt,
          dueAt,
          dueCutoff: '8:59 AM',
          alerts: evaluation.alerts.map(({ code, message }) => ({ code, message })),
        }
      } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
    },

    async fulfillClaim(actorValue: unknown, body: unknown) {
      const actor = actorValue && typeof actorValue === 'object' ? actorValue as { accountId?: unknown; role?: unknown } : {}
      if (String(actor.role ?? '') !== 'Admin') {
        throw new HttpError(403, 'CIRCULATION_FORBIDDEN', 'Only an Admin may fulfill a counter claim.')
      }
      const actorAccountId = positiveCirculationId(actor.accountId, 'actorAccountId')
      return createCirculationService(database, clock).confirmCheckout(actorAccountId, body, true)
    },

    async preflightRenewal(actor: RenewalActor, transactionIdValue: unknown) {
      return renewalService.preflight(transactionIdValue, actor)
    },

    async submitRenewal(actor: RenewalActor, transactionIdValue: unknown, body: unknown) {
      return renewalService.submit(transactionIdValue, actor, body)
    },

    async staffRenewal(actor: RenewalActor, transactionIdValue: unknown, body: unknown) {
      return renewalService.submit(transactionIdValue, actor, body)
    },

    async returnBook(actorAccountIdValue: unknown, transactionIdValue: unknown) {
      const actorAccountId = positiveCirculationId(actorAccountIdValue, 'actorAccountId'); const transactionId = positiveCirculationId(transactionIdValue, 'transactionId')
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction(); await actorUserId(connection, actorAccountId)
        const [rows] = await connection.execute<RowDataPacket[]>(
          `SELECT bt.transaction_id, bt.user_id, bt.material_id, bt.physical_copy_id, bt.due_at, bt.transaction_status,
                  pc.title_id, pc.accession_number, t.title FROM borrow_transactions bt
             INNER JOIN physical_copies pc ON pc.physical_copy_id = bt.physical_copy_id INNER JOIN titles t ON t.title_id = pc.title_id
            WHERE bt.transaction_id = ? LIMIT 1 FOR UPDATE`, [transactionId],
        )
        const loan = rows[0]
        if (!loan) throw new HttpError(404, 'CIRCULATION_TRANSACTION_NOT_FOUND', 'The borrowing transaction was not found.')
        if (!['Borrowed', 'Overdue'].includes(String(loan.transaction_status))) throw new HttpError(422, 'CIRCULATION_RETURN_INVALID', 'Only active or overdue transactions can be returned.')
        const returnedAt = clock()
        await connection.execute("UPDATE borrow_transactions SET transaction_status = 'Returned', returned_at = ?, updated_at = NOW() WHERE transaction_id = ?", [returnedAt, transactionId])
        if(loan.transaction_status==='Overdue'&&loan.due_at){
          const due=new Date(loan.due_at);const context=await loadFineContext(connection,due,returnedAt);const charge=calculateOperatingFine(due,returnedAt,context.policy,context.calendar)
          await connection.execute(
            isPostgres
              ? `INSERT INTO fines(transaction_id,user_id,fine_type,fine_amount,payment_status,calculation_basis,overdue_units,rate_applied,maximum_cap_applied,applied_date,finalized_at,notes,updated_at)
             VALUES (?,?,'Overdue',?,'Unpaid',?,?,?,?,NOW(),?,'Finalized when the book was returned',NOW())
             ON CONFLICT (transaction_id) DO UPDATE SET fine_amount=${excluded('fine_amount')},payment_status=${caseIf("fines.payment_status IN ('Paid','Waived','Voided')", 'fines.payment_status', "'Unpaid'")},calculation_basis=${excluded('calculation_basis')},overdue_units=${excluded('overdue_units')},rate_applied=${excluded('rate_applied')},maximum_cap_applied=${excluded('maximum_cap_applied')},finalized_at=${excluded('finalized_at')},notes=${excluded('notes')},updated_at=NOW()`
              : `INSERT INTO fines(transaction_id,user_id,fine_type,fine_amount,payment_status,calculation_basis,overdue_units,rate_applied,maximum_cap_applied,applied_date,finalized_at,notes,updated_at)
             VALUES (?,?,'Overdue',?,'Unpaid',?,?,?,?,NOW(),?,'Finalized when the book was returned',NOW())
             ON DUPLICATE KEY UPDATE fine_amount=VALUES(fine_amount),payment_status=IF(payment_status IN ('Paid','Waived','Voided'),payment_status,'Unpaid'),calculation_basis=VALUES(calculation_basis),overdue_units=VALUES(overdue_units),rate_applied=VALUES(rate_applied),maximum_cap_applied=VALUES(maximum_cap_applied),finalized_at=VALUES(finalized_at),notes=VALUES(notes),updated_at=NOW()`,
            [transactionId,loan.user_id,charge.amount,charge.basis,charge.units,charge.rate,charge.capApplied?context.policy.maximumPenalty:null,returnedAt],
          )
        }
        const [waitRows] = await connection.execute<RowDataPacket[]>(
          `SELECT reservation_id, user_id, queue_position FROM reservations WHERE book_title_id = ? AND reservation_status IN ('pending','approved') ORDER BY queue_position ASC, reserved_at ASC, reservation_id ASC LIMIT 1 FOR UPDATE`, [loan.title_id],
        )
        const nextReservation = waitRows[0]
        if (nextReservation) {
          const pickupDeadline = new Date(returnedAt.getTime() + 24 * 60 * 60 * 1000)
          await connection.execute(`UPDATE reservations SET reservation_status = 'ready_for_pickup', accession_id = ?, assigned_physical_copy_id = ?, pickup_deadline = ?, updated_at = NOW() WHERE reservation_id = ?`, [loan.material_id, loan.physical_copy_id, pickupDeadline, nextReservation.reservation_id])
          await connection.execute(
            isPostgres
              ? `INSERT INTO borrow_transactions
               (user_id, material_id, physical_copy_id, reservation_id, request_group_id, transaction_status, created_at)
             VALUES (?, ?, ?, ?, ?, 'Pending', NOW())
             ON CONFLICT (reservation_id) DO UPDATE SET material_id = ${excluded('material_id')}, physical_copy_id = ${excluded('physical_copy_id')},
               transaction_status = 'Pending', cancelled_at = NULL, cancelled_by_user_id = NULL,
               cancellation_reason = NULL, updated_at = NOW()`
              : `INSERT INTO borrow_transactions
               (user_id, material_id, physical_copy_id, reservation_id, request_group_id, transaction_status, created_at)
             VALUES (?, ?, ?, ?, ?, 'Pending', NOW())
             ON DUPLICATE KEY UPDATE material_id = VALUES(material_id), physical_copy_id = VALUES(physical_copy_id),
               transaction_status = 'Pending', cancelled_at = NULL, cancelled_by_user_id = NULL,
               cancellation_reason = NULL, updated_at = NOW()`,
            [nextReservation.user_id, loan.material_id, loan.physical_copy_id, nextReservation.reservation_id, randomUUID()],
          )
          await connection.execute("UPDATE physical_copies SET availability_status = 'Reserved', row_version = row_version + 1, updated_at = NOW() WHERE physical_copy_id = ?", [loan.physical_copy_id])
          await connection.execute("UPDATE materials SET availability_status = 'Reserved', updated_at = NOW() WHERE material_id = ?", [loan.material_id])
          await connection.execute(`INSERT INTO notifications (user_id, message_title, message_body, trigger_type, is_read) VALUES (?, 'Reservation ready for pickup', ?, 'Reservation Arrival', 0)`, [nextReservation.user_id, `${loan.title} is ready for pickup. Claim it before the pickup deadline.`])
        } else {
          await connection.execute("UPDATE physical_copies SET availability_status = 'Available', row_version = row_version + 1, updated_at = NOW() WHERE physical_copy_id = ?", [loan.physical_copy_id])
          await connection.execute("UPDATE materials SET availability_status = 'Available', updated_at = NOW() WHERE material_id = ?", [loan.material_id])
        }
        await connection.execute(`INSERT INTO admin_notifications (event_type, actor_user_id, borrow_transaction_id, book_title_id, message_title, message_body) VALUES ('return_completed', ?, ?, ?, 'Return completed', ?)`, [loan.user_id, transactionId, loan.title_id, `${loan.title} was returned${nextReservation ? ' and assigned to the next reservation' : ''}.`])
        await connection.commit()
        return { transactionId, status: 'Returned', returnedAt, nextReservationId: nextReservation ? Number(nextReservation.reservation_id) : null, copyAvailability: nextReservation ? 'Reserved' : 'Available' }
      } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
    },

    async calculatePenalty(transactionIdValue: unknown) {
      const transactionId = positiveCirculationId(transactionIdValue, 'transactionId'); const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const [rows] = await connection.execute<RowDataPacket[]>('SELECT transaction_id, user_id, due_at, returned_at FROM borrow_transactions WHERE transaction_id = ? LIMIT 1 FOR UPDATE', [transactionId])
        const loan = rows[0]
        if (!loan) throw new HttpError(404, 'CIRCULATION_TRANSACTION_NOT_FOUND', 'The borrowing transaction was not found.')
        const due = new Date(loan.due_at); const ended = loan.returned_at ? new Date(loan.returned_at) : clock(); const context=await loadFineContext(connection,due,ended);const charge=calculateOperatingFine(due,ended,context.policy,context.calendar);const status=loan.returned_at?'Unpaid':'Accruing'
        await connection.execute(
          isPostgres
            ? `INSERT INTO fines (transaction_id,user_id,fine_type,fine_amount,payment_status,calculation_basis,overdue_units,rate_applied,maximum_cap_applied,applied_date,finalized_at,notes,updated_at) VALUES (?,?,'Overdue',?,?,?,?,?,?,NOW(),?,'Calculated from the operating calendar and 8:59 AM cutoff',NOW()) ON CONFLICT (transaction_id) DO UPDATE SET fine_amount=${excluded('fine_amount')},payment_status=${caseIf("fines.payment_status IN ('Paid','Waived','Voided')", 'fines.payment_status', excluded('payment_status'))},calculation_basis=${excluded('calculation_basis')},overdue_units=${excluded('overdue_units')},rate_applied=${excluded('rate_applied')},maximum_cap_applied=${excluded('maximum_cap_applied')},finalized_at=${excluded('finalized_at')},notes=${excluded('notes')},updated_at=NOW()`
            : `INSERT INTO fines (transaction_id,user_id,fine_type,fine_amount,payment_status,calculation_basis,overdue_units,rate_applied,maximum_cap_applied,applied_date,finalized_at,notes,updated_at) VALUES (?,?,'Overdue',?,?,?,?,?,?,NOW(),?,'Calculated from the operating calendar and 8:59 AM cutoff',NOW()) ON DUPLICATE KEY UPDATE fine_amount=VALUES(fine_amount),payment_status=IF(payment_status IN ('Paid','Waived','Voided'),payment_status,VALUES(payment_status)),calculation_basis=VALUES(calculation_basis),overdue_units=VALUES(overdue_units),rate_applied=VALUES(rate_applied),maximum_cap_applied=VALUES(maximum_cap_applied),finalized_at=VALUES(finalized_at),notes=VALUES(notes),updated_at=NOW()`,
          [transactionId,loan.user_id,charge.amount,status,charge.basis,charge.units,charge.rate,charge.capApplied?context.policy.maximumPenalty:null,loan.returned_at??null],
        )
        await connection.commit(); return { transactionId, amount:charge.amount, currency: 'PHP', basis:charge.basis, units:charge.units, rate:charge.rate,maximumPenalty:context.policy.maximumPenalty,capApplied:charge.capApplied }
      } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
    },

    async adminNotifications(limitValue: unknown = 20) {
      const limit = Math.min(Number.isFinite(Number(limitValue)) ? Math.max(Math.trunc(Number(limitValue)), 1) : 20, 100)
      const [rows] = await database.execute<RowDataPacket[]>(`SELECT admin_notification_id, event_type, message_title, message_body, created_at FROM admin_notifications ORDER BY created_at DESC, admin_notification_id DESC LIMIT ${limit}`)
      return rows.map((row) => ({ id: Number(row.admin_notification_id), eventType: row.event_type, title: row.message_title, message: row.message_body, createdAt: row.created_at }))
    },
  }
}

export const circulationService = createCirculationService()
export const circulationQueue = { compactQueue }
