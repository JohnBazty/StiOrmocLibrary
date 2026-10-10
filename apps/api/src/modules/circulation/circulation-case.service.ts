import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { lockInventoryCopy, recordInventoryAudit } from '../inventory/inventory.repository.ts'
import {
  appendCaseEvent,
  findCaseById,
  findCaseByTransactionType,
  insertCase,
  insertUserCaseNotification,
  listCaseEvents,
  updateCaseStatus,
  type CaseRow,
} from './circulation-case.repository.ts'
import {
  TERMINAL_CASE_STATUSES,
  type CaseStatus,
  type CaseType,
  type DamageDisposition,
  type PublicCaseSummary,
} from './circulation-case.types.ts'
import {
  validateAssignCase,
  validateCaseListQuery,
  validateCaseNote,
  validateCaseReason,
  validateContactAttempt,
  validateDisposition,
  validateInspection,
  validateOpenDamageCase,
  validateReportDamage,
} from './circulation-case.validation.ts'

type Actor = { accountId: number; userId: number | null }

function positiveId(value: unknown, field: string) {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(422, 'CASE_ID_INVALID', `A valid ${field} is required.`)
  return id
}

function publicInstruction(caseType: CaseType, status: CaseStatus) {
  if (TERMINAL_CASE_STATUSES.includes(status)) {
    return caseType === 'Damage'
      ? 'This damage review is closed. Contact the library desk if you have questions.'
      : 'This long-overdue case is closed. Return any remaining materials and settle fines at the desk.'
  }
  return caseType === 'Damage'
    ? 'Library staff are reviewing reported damage. Please follow any desk instructions.'
    : 'This loan is long overdue. Please return the material or contact the library desk.'
}

function mapCase(row: CaseRow) {
  return {
    caseId: Number(row.case_id),
    caseType: row.case_type as CaseType,
    transactionId: Number(row.transaction_id),
    physicalCopyId: Number(row.physical_copy_id),
    borrowerUserId: Number(row.borrower_user_id),
    status: row.status as CaseStatus,
    assignedToUserId: row.assigned_to_user_id === null ? null : Number(row.assigned_to_user_id),
    summary: row.summary,
    openedAt: row.opened_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at,
    openedByUserId: row.opened_by_user_id === null ? null : Number(row.opened_by_user_id),
    resolvedByUserId: row.resolved_by_user_id === null ? null : Number(row.resolved_by_user_id),
    policyVersionId: row.policy_version_id === null ? null : Number(row.policy_version_id),
    thresholdDaysSnapshot: row.threshold_days_snapshot === null ? null : Number(row.threshold_days_snapshot),
    thresholdReachedAt: row.threshold_reached_at,
    baselineConditionStatus: row.baseline_condition_status,
    observedConditionStatus: row.observed_condition_status,
    lostBookReportId: row.lost_book_report_id === null ? null : Number(row.lost_book_report_id),
  }
}

async function resolveActorUserId(connection: PoolConnection, accountId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    'SELECT user_id FROM accounts WHERE account_id = ? AND user_id IS NOT NULL LIMIT 1',
    [accountId],
  )
  return rows[0]?.user_id ? Number(rows[0].user_id) : null
}

export async function openLongOverdueCaseInTransaction(
  connection: PoolConnection,
  input: {
    transactionId: number
    physicalCopyId: number
    borrowerUserId: number
    policyVersionId: number | null
    thresholdDays: number
    thresholdReachedAt: Date
    title: string
  },
) {
  const existing = await findCaseByTransactionType(connection, input.transactionId, 'Long Overdue', true)
  if (existing) return { case: mapCase(existing), created: false }

  const openedAt = input.thresholdReachedAt
  const summary = `${input.title} exceeded the long-overdue threshold of ${input.thresholdDays} operating days.`
  const caseId = await insertCase(connection, {
    caseType: 'Long Overdue',
    transactionId: input.transactionId,
    physicalCopyId: input.physicalCopyId,
    borrowerUserId: input.borrowerUserId,
    status: 'Open',
    summary,
    openedAt,
    openedByUserId: null,
    policyVersionId: input.policyVersionId,
    thresholdDaysSnapshot: input.thresholdDays,
    thresholdReachedAt: input.thresholdReachedAt,
    baselineCondition: null,
    observedCondition: null,
  })
  await appendCaseEvent(connection, {
    caseId, eventType: 'Opened', actorUserId: null, fromStatus: null, toStatus: 'Open',
    reason: null, notes: summary,
  })
  await connection.execute(
    `INSERT INTO admin_notifications
       (event_type, actor_user_id, borrow_transaction_id, message_title, message_body)
     VALUES ('long_overdue_case_opened', ?, ?, 'Long-overdue case opened', ?)`,
    [input.borrowerUserId, input.transactionId, summary],
  )
  await insertUserCaseNotification(
    connection,
    input.borrowerUserId,
    'Long-overdue loan',
    `${input.title} is long overdue. Please return it or contact the library desk.`,
    `case:${caseId}:opened`,
  )
  const created = await findCaseById(connection, caseId)
  if (!created) throw new HttpError(500, 'CASE_CREATE_FAILED', 'The long-overdue case could not be loaded after insert.')
  return { case: mapCase(created), created: true }
}

async function openDamageCaseLocked(
  connection: PoolConnection,
  input: {
    transactionId: number
    physicalCopyId: number
    borrowerUserId: number
    actorUserId: number | null
    baselineCondition: string | null
    observedCondition: string
    description: string
    openedAt: Date
  },
) {
  const existing = await findCaseByTransactionType(connection, input.transactionId, 'Damage', true)
  if (existing) {
    await appendCaseEvent(connection, {
      caseId: Number(existing.case_id),
      eventType: 'Inspection Recorded',
      actorUserId: input.actorUserId,
      fromStatus: existing.status,
      toStatus: existing.status,
      reason: null,
      notes: input.description,
    })
    if (input.observedCondition) {
      await updateCaseStatus(connection, Number(existing.case_id), {
        status: existing.status as CaseStatus,
        observedCondition: input.observedCondition,
      })
    }
    const refreshed = await findCaseById(connection, Number(existing.case_id))
    return { case: mapCase(refreshed!), created: false }
  }

  const caseId = await insertCase(connection, {
    caseType: 'Damage',
    transactionId: input.transactionId,
    physicalCopyId: input.physicalCopyId,
    borrowerUserId: input.borrowerUserId,
    status: 'Open',
    summary: input.description,
    openedAt: input.openedAt,
    openedByUserId: input.actorUserId,
    policyVersionId: null,
    thresholdDaysSnapshot: null,
    thresholdReachedAt: null,
    baselineCondition: input.baselineCondition,
    observedCondition: input.observedCondition,
  })
  await appendCaseEvent(connection, {
    caseId, eventType: 'Opened', actorUserId: input.actorUserId, fromStatus: null, toStatus: 'Open',
    reason: null, notes: input.description,
  })
  await connection.execute(
    `INSERT INTO admin_notifications
       (event_type, actor_user_id, borrow_transaction_id, message_title, message_body)
     VALUES ('damage_case_opened', ?, ?, 'Damage case opened', ?)`,
    [input.borrowerUserId, input.transactionId, input.description],
  )
  await insertUserCaseNotification(
    connection,
    input.borrowerUserId,
    'Damage report opened',
    'Library staff opened a damage review for a borrowed item. Please follow desk instructions.',
    `case:${caseId}:opened`,
  )
  const created = await findCaseById(connection, caseId)
  if (!created) throw new HttpError(500, 'CASE_CREATE_FAILED', 'The damage case could not be loaded after insert.')
  return { case: mapCase(created), created: true }
}

export function createCirculationCaseService(database: Pool = db, clock: () => Date = () => new Date()) {
  return {
    async listCases(query: Record<string, unknown>) {
      const filters = validateCaseListQuery(query)
      const offset = (filters.page - 1) * filters.limit
      const where: string[] = ['1=1']
      const params: unknown[] = []
      if (filters.caseType) { where.push('cc.case_type = ?'); params.push(filters.caseType) }
      if (filters.status) { where.push('cc.status = ?'); params.push(filters.status) }
      if (filters.assigneeUserId) { where.push('cc.assigned_to_user_id = ?'); params.push(filters.assigneeUserId) }
      if (filters.borrowerQuery) {
        where.push('(u.full_name LIKE ? OR u.school_id LIKE ? OR t.title LIKE ? OR pc.barcode LIKE ?)')
        const like = `%${filters.borrowerQuery}%`
        params.push(like, like, like, like)
      }
      const whereSql = where.join(' AND ')
      const [rows] = await database.execute<RowDataPacket[]>(
        `SELECT cc.*, u.full_name AS borrower_name, u.school_id AS borrower_school_id,
                t.title, pc.barcode, pc.accession_number,
                (SELECT ce.event_type FROM circulation_case_events ce
                  WHERE ce.case_id = cc.case_id ORDER BY ce.created_at DESC, ce.event_id DESC LIMIT 1) AS latest_event_type
           FROM circulation_cases cc
           INNER JOIN users u ON u.user_id = cc.borrower_user_id
           INNER JOIN physical_copies pc ON pc.physical_copy_id = cc.physical_copy_id
           INNER JOIN titles t ON t.title_id = pc.title_id
          WHERE ${whereSql}
          ORDER BY cc.opened_at DESC, cc.case_id DESC
          LIMIT ${filters.limit} OFFSET ${offset}`,
        params,
      )
      const [countRows] = await database.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS total
           FROM circulation_cases cc
           INNER JOIN users u ON u.user_id = cc.borrower_user_id
           INNER JOIN physical_copies pc ON pc.physical_copy_id = cc.physical_copy_id
           INNER JOIN titles t ON t.title_id = pc.title_id
          WHERE ${whereSql}`,
        params,
      )
      const total = Number(countRows[0]?.total ?? 0)
      return {
        items: rows.map((row) => ({
          ...mapCase(row as CaseRow),
          borrowerName: String(row.borrower_name),
          borrowerSchoolId: String(row.borrower_school_id),
          title: String(row.title),
          barcode: String(row.barcode),
          accessionNumber: row.accession_number ? String(row.accession_number) : null,
          latestEventType: row.latest_event_type ? String(row.latest_event_type) : null,
        })),
        pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) || 1 },
      }
    },

    async getCaseDetail(caseIdValue: unknown) {
      const caseId = positiveId(caseIdValue, 'caseId')
      const connection = await database.getConnection()
      try {
        const row = await findCaseById(connection, caseId)
        if (!row) throw new HttpError(404, 'CASE_NOT_FOUND', 'The circulation case was not found.')
        const [loanRows] = await connection.execute<RowDataPacket[]>(
          `SELECT bt.transaction_id, bt.transaction_status, bt.due_at, bt.returned_at, bt.lost_confirmed_at,
                  t.title, pc.barcode, pc.accession_number, pc.condition_status, pc.availability_status,
                  u.full_name AS borrower_name, u.school_id AS borrower_school_id,
                  f.fine_amount, f.payment_status AS fine_payment_status,
                  lbr.lost_book_report_id, lbr.report_status AS lost_report_status
             FROM borrow_transactions bt
             INNER JOIN physical_copies pc ON pc.physical_copy_id = bt.physical_copy_id
             INNER JOIN titles t ON t.title_id = pc.title_id
             INNER JOIN users u ON u.user_id = bt.user_id
             LEFT JOIN fines f ON f.transaction_id = bt.transaction_id
             LEFT JOIN lost_book_reports lbr ON lbr.transaction_id = bt.transaction_id
            WHERE bt.transaction_id = ? LIMIT 1`,
          [row.transaction_id],
        )
        const [overrideRows] = await connection.execute<RowDataPacket[]>(
          `SELECT override_event_id, warning_codes, override_reason, approved_at
             FROM circulation_override_events
            WHERE borrow_transaction_id = ?
            ORDER BY approved_at DESC, override_event_id DESC LIMIT 5`,
          [row.transaction_id],
        )
        const events = await listCaseEvents(connection, caseId)
        const loan = loanRows[0]
        return {
          case: mapCase(row),
          loan: loan ? {
            transactionId: Number(loan.transaction_id),
            status: String(loan.transaction_status),
            dueAt: loan.due_at,
            returnedAt: loan.returned_at,
            lostConfirmedAt: loan.lost_confirmed_at,
            title: String(loan.title),
            barcode: String(loan.barcode),
            accessionNumber: loan.accession_number ? String(loan.accession_number) : null,
            conditionStatus: String(loan.condition_status),
            availabilityStatus: String(loan.availability_status),
            borrowerName: String(loan.borrower_name),
            borrowerSchoolId: String(loan.borrower_school_id),
            fineAmount: loan.fine_amount === null || loan.fine_amount === undefined ? null : Number(loan.fine_amount),
            finePaymentStatus: loan.fine_payment_status ? String(loan.fine_payment_status) : null,
            lostBookReportId: loan.lost_book_report_id === null || loan.lost_book_report_id === undefined ? null : Number(loan.lost_book_report_id),
            lostReportStatus: loan.lost_report_status ? String(loan.lost_report_status) : null,
          } : null,
          checkoutOverrides: overrideRows.map((item) => ({
            overrideEventId: Number(item.override_event_id),
            warningCodes: String(item.warning_codes),
            overrideReason: item.override_reason ? String(item.override_reason) : null,
            approvedAt: item.approved_at,
          })),
          events: events.map((event) => ({
            eventId: Number(event.event_id),
            eventType: String(event.event_type),
            actorUserId: event.actor_user_id === null ? null : Number(event.actor_user_id),
            fromStatus: event.from_status ? String(event.from_status) : null,
            toStatus: event.to_status ? String(event.to_status) : null,
            reason: event.reason ? String(event.reason) : null,
            notes: event.notes ? String(event.notes) : null,
            createdAt: event.created_at,
          })),
        }
      } finally {
        connection.release()
      }
    },

    async openDamageCase(actorAccountId: unknown, body: unknown) {
      const accountId = positiveId(actorAccountId, 'accountId')
      const input = validateOpenDamageCase(body)
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const actorUserId = await resolveActorUserId(connection, accountId)
        const [loanRows] = await connection.execute<RowDataPacket[]>(
          `SELECT bt.transaction_id, bt.user_id, bt.physical_copy_id, bt.transaction_status, pc.condition_status
             FROM borrow_transactions bt
             INNER JOIN physical_copies pc ON pc.physical_copy_id = bt.physical_copy_id
            WHERE bt.transaction_id = ? LIMIT 1 FOR UPDATE`,
          [input.transactionId],
        )
        const loan = loanRows[0]
        if (!loan) throw new HttpError(404, 'CIRCULATION_TRANSACTION_NOT_FOUND', 'The borrowing transaction was not found.')
        if (!['Borrowed', 'Overdue'].includes(String(loan.transaction_status))) {
          throw new HttpError(422, 'CASE_DAMAGE_LOAN_INACTIVE', 'Damage cases against a loan require an active Borrowed or Overdue transaction.')
        }
        const result = await openDamageCaseLocked(connection, {
          transactionId: Number(loan.transaction_id),
          physicalCopyId: Number(loan.physical_copy_id),
          borrowerUserId: Number(loan.user_id),
          actorUserId,
          baselineCondition: loan.condition_status ? String(loan.condition_status) : null,
          observedCondition: input.observedCondition,
          description: input.description,
          openedAt: clock(),
        })
        await connection.commit()
        return result.case
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async assignCase(actorAccountId: unknown, caseIdValue: unknown, body: unknown) {
      const accountId = positiveId(actorAccountId, 'accountId')
      const caseId = positiveId(caseIdValue, 'caseId')
      const input = validateAssignCase(body)
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const actorUserId = await resolveActorUserId(connection, accountId)
        const row = await findCaseById(connection, caseId, true)
        if (!row) throw new HttpError(404, 'CASE_NOT_FOUND', 'The circulation case was not found.')
        if (TERMINAL_CASE_STATUSES.includes(row.status as CaseStatus)) {
          throw new HttpError(422, 'CASE_TERMINAL', 'Resolved or dismissed cases must be reopened before assignment.')
        }
        const nextStatus: CaseStatus = 'Assigned'
        await updateCaseStatus(connection, caseId, { status: nextStatus, assignedToUserId: input.assignedToUserId })
        await appendCaseEvent(connection, {
          caseId, eventType: 'Assigned', actorUserId, fromStatus: row.status, toStatus: nextStatus,
          reason: null, notes: input.notes,
        })
        await connection.commit()
        return (await this.getCaseDetail(caseId)).case
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async addContactAttempt(actorAccountId: unknown, caseIdValue: unknown, body: unknown) {
      return this.appendStaffEvent(actorAccountId, caseIdValue, body, 'Contact Attempted', validateContactAttempt)
    },

    async addNote(actorAccountId: unknown, caseIdValue: unknown, body: unknown) {
      return this.appendStaffEvent(actorAccountId, caseIdValue, body, 'Note Added', validateCaseNote)
    },

    async recordInspection(actorAccountId: unknown, caseIdValue: unknown, body: unknown) {
      const accountId = positiveId(actorAccountId, 'accountId')
      const caseId = positiveId(caseIdValue, 'caseId')
      const input = validateInspection(body)
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const actorUserId = await resolveActorUserId(connection, accountId)
        const row = await findCaseById(connection, caseId, true)
        if (!row) throw new HttpError(404, 'CASE_NOT_FOUND', 'The circulation case was not found.')
        if (TERMINAL_CASE_STATUSES.includes(row.status as CaseStatus)) {
          throw new HttpError(422, 'CASE_TERMINAL', 'Resolved or dismissed cases must be reopened before inspection.')
        }
        const nextStatus: CaseStatus = 'Under Investigation'
        await updateCaseStatus(connection, caseId, {
          status: nextStatus,
          observedCondition: input.observedCondition,
        })
        await appendCaseEvent(connection, {
          caseId, eventType: 'Inspection Recorded', actorUserId, fromStatus: row.status, toStatus: nextStatus,
          reason: null, notes: input.notes,
        })
        await connection.commit()
        return (await this.getCaseDetail(caseId)).case
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async appendStaffEvent(
      actorAccountId: unknown,
      caseIdValue: unknown,
      body: unknown,
      eventType: 'Contact Attempted' | 'Note Added',
      validate: (body: unknown) => { notes: string },
    ) {
      const accountId = positiveId(actorAccountId, 'accountId')
      const caseId = positiveId(caseIdValue, 'caseId')
      const input = validate(body)
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const actorUserId = await resolveActorUserId(connection, accountId)
        const row = await findCaseById(connection, caseId, true)
        if (!row) throw new HttpError(404, 'CASE_NOT_FOUND', 'The circulation case was not found.')
        if (TERMINAL_CASE_STATUSES.includes(row.status as CaseStatus)) {
          throw new HttpError(422, 'CASE_TERMINAL', 'Resolved or dismissed cases must be reopened before new staff actions.')
        }
        const nextStatus: CaseStatus = row.status === 'Open' ? 'Under Investigation' : row.status as CaseStatus
        if (nextStatus !== row.status) await updateCaseStatus(connection, caseId, { status: nextStatus })
        await appendCaseEvent(connection, {
          caseId, eventType, actorUserId, fromStatus: row.status, toStatus: nextStatus,
          reason: null, notes: input.notes,
        })
        await connection.commit()
        return (await this.getCaseDetail(caseId)).case
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async recordDisposition(actorAccountId: unknown, caseIdValue: unknown, body: unknown) {
      const accountId = positiveId(actorAccountId, 'accountId')
      const caseId = positiveId(caseIdValue, 'caseId')
      const input = validateDisposition(body)
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const actorUserId = await resolveActorUserId(connection, accountId)
        const row = await findCaseById(connection, caseId, true)
        if (!row) throw new HttpError(404, 'CASE_NOT_FOUND', 'The circulation case was not found.')
        if (row.case_type !== 'Damage') {
          throw new HttpError(422, 'CASE_DISPOSITION_TYPE', 'Dispositions apply only to damage cases.')
        }
        if (TERMINAL_CASE_STATUSES.includes(row.status as CaseStatus)) {
          throw new HttpError(422, 'CASE_TERMINAL', 'Reopen the case before recording a new disposition.')
        }
        await applyDamageDisposition(connection, row, input.disposition, input.reason, actorUserId, clock())
        await appendCaseEvent(connection, {
          caseId, eventType: 'Disposition Recorded', actorUserId, fromStatus: row.status, toStatus: row.status,
          reason: input.reason, notes: input.disposition,
        })
        await connection.commit()
        return (await this.getCaseDetail(caseId)).case
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async resolveCase(actorAccountId: unknown, caseIdValue: unknown, body: unknown) {
      return this.closeCase(actorAccountId, caseIdValue, body, 'Resolved')
    },

    async dismissCase(actorAccountId: unknown, caseIdValue: unknown, body: unknown) {
      return this.closeCase(actorAccountId, caseIdValue, body, 'Dismissed')
    },

    async closeCase(
      actorAccountId: unknown,
      caseIdValue: unknown,
      body: unknown,
      status: 'Resolved' | 'Dismissed',
    ) {
      const accountId = positiveId(actorAccountId, 'accountId')
      const caseId = positiveId(caseIdValue, 'caseId')
      const input = validateCaseReason(body)
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const actorUserId = await resolveActorUserId(connection, accountId)
        const row = await findCaseById(connection, caseId, true)
        if (!row) throw new HttpError(404, 'CASE_NOT_FOUND', 'The circulation case was not found.')
        if (TERMINAL_CASE_STATUSES.includes(row.status as CaseStatus)) {
          throw new HttpError(422, 'CASE_ALREADY_CLOSED', 'This case is already closed.')
        }
        const resolvedAt = clock()
        await connection.execute(
          `UPDATE circulation_cases
              SET status = ?, resolved_at = ?, resolved_by_user_id = ?, updated_at = NOW()
            WHERE case_id = ?`,
          [status, resolvedAt, actorUserId, caseId],
        )
        await appendCaseEvent(connection, {
          caseId,
          eventType: status === 'Resolved' ? 'Resolved' : 'Dismissed',
          actorUserId,
          fromStatus: row.status,
          toStatus: status,
          reason: input.reason,
          notes: null,
        })
        await insertUserCaseNotification(
          connection,
          Number(row.borrower_user_id),
          status === 'Resolved' ? 'Circulation case resolved' : 'Circulation case dismissed',
          publicInstruction(row.case_type as CaseType, status),
          `case:${caseId}:${status.toLowerCase()}`,
        )
        await connection.commit()
        return (await this.getCaseDetail(caseId)).case
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async reopenCase(actorAccountId: unknown, caseIdValue: unknown, body: unknown) {
      const accountId = positiveId(actorAccountId, 'accountId')
      const caseId = positiveId(caseIdValue, 'caseId')
      const input = validateCaseReason(body)
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const actorUserId = await resolveActorUserId(connection, accountId)
        const row = await findCaseById(connection, caseId, true)
        if (!row) throw new HttpError(404, 'CASE_NOT_FOUND', 'The circulation case was not found.')
        if (!TERMINAL_CASE_STATUSES.includes(row.status as CaseStatus)) {
          throw new HttpError(422, 'CASE_NOT_CLOSED', 'Only resolved or dismissed cases can be reopened.')
        }
        await connection.execute(
          `UPDATE circulation_cases
              SET status = 'Reopened', resolved_at = NULL, resolved_by_user_id = NULL, updated_at = NOW()
            WHERE case_id = ?`,
          [caseId],
        )
        await appendCaseEvent(connection, {
          caseId, eventType: 'Reopened', actorUserId, fromStatus: row.status, toStatus: 'Reopened',
          reason: input.reason, notes: null,
        })
        await connection.commit()
        return (await this.getCaseDetail(caseId)).case
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },

    async publicSummariesForTransactions(userId: number, transactionIds: number[]): Promise<Map<number, PublicCaseSummary>> {
      const map = new Map<number, PublicCaseSummary>()
      if (transactionIds.length === 0) return map
      const placeholders = transactionIds.map(() => '?').join(', ')
      const [rows] = await database.execute<CaseRow[]>(
        `SELECT * FROM circulation_cases
          WHERE borrower_user_id = ? AND transaction_id IN (${placeholders})
          ORDER BY opened_at DESC, case_id DESC`,
        [userId, ...transactionIds],
      )
      for (const row of rows) {
        const transactionId = Number(row.transaction_id)
        if (map.has(transactionId)) continue
        map.set(transactionId, {
          caseId: Number(row.case_id),
          caseType: row.case_type as CaseType,
          status: row.status as CaseStatus,
          openedAt: row.opened_at,
          instruction: publicInstruction(row.case_type as CaseType, row.status as CaseStatus),
        })
      }
      return map
    },

    openDamageCaseLocked,
    validateReportDamage,
  }
}

async function applyDamageDisposition(
  connection: PoolConnection,
  row: CaseRow,
  disposition: DamageDisposition,
  reason: string,
  actorUserId: number | null,
  now: Date,
) {
  const [copyRows] = await connection.execute<RowDataPacket[]>(
    `SELECT pc.physical_copy_id, pc.barcode, pc.condition_status, pc.availability_status, pc.material_id, pc.title_id,
            bt.transaction_status, bt.lost_confirmed_at
       FROM physical_copies pc
       INNER JOIN borrow_transactions bt ON bt.transaction_id = ?
      WHERE pc.physical_copy_id = ?
      LIMIT 1 FOR UPDATE`,
    [row.transaction_id, row.physical_copy_id],
  )
  const copy = copyRows[0]
  if (!copy) throw new HttpError(404, 'CASE_COPY_NOT_FOUND', 'The physical copy for this case was not found.')

  const locked = await lockInventoryCopy(connection, String(copy.barcode))
  if (!locked) throw new HttpError(404, 'CASE_COPY_NOT_FOUND', 'The physical copy for this case was not found.')
  const actor = { userId: actorUserId, label: 'Admin' }

  if (disposition === 'repaired_available') {
    if (['Borrowed', 'Overdue', 'Pending'].includes(String(copy.transaction_status)) && !copy.lost_confirmed_at) {
      throw new HttpError(422, 'CASE_COPY_STILL_ON_LOAN', 'Return or confirm loss before restoring this copy to Available.')
    }
    const previous = { ...locked }
    await connection.execute(
      "UPDATE physical_copies SET condition_status = 'Good', availability_status = 'Available', row_version = row_version + 1, updated_at = NOW() WHERE physical_copy_id = ?",
      [row.physical_copy_id],
    )
    if (copy.material_id) {
      await connection.execute(
        "UPDATE materials SET availability_status = 'Available', updated_at = NOW() WHERE material_id = ?",
        [copy.material_id],
      )
    }
    await recordInventoryAudit(connection, previous, 'Condition Changed', actor, 'Good', previous.availability_status)
    const afterCondition = { ...previous, condition_status: 'Good' }
    await recordInventoryAudit(connection, afterCondition, 'Availability Changed', actor, 'Good', 'Available')
    return
  }

  if (disposition === 'damaged_held') {
    const previous = { ...locked }
    await connection.execute(
      "UPDATE physical_copies SET condition_status = 'Damaged', availability_status = 'Unavailable', row_version = row_version + 1, updated_at = NOW() WHERE physical_copy_id = ?",
      [row.physical_copy_id],
    )
    if (copy.material_id) {
      await connection.execute(
        "UPDATE materials SET availability_status = 'Unavailable', updated_at = NOW() WHERE material_id = ?",
        [copy.material_id],
      )
    }
    await recordInventoryAudit(connection, previous, 'Condition Changed', actor, 'Damaged', previous.availability_status)
    const afterCondition = { ...previous, condition_status: 'Damaged' }
    await recordInventoryAudit(connection, afterCondition, 'Availability Changed', actor, 'Damaged', 'Unavailable')
    return
  }

  // missing_lost
  if (['Borrowed', 'Overdue'].includes(String(copy.transaction_status)) && !copy.lost_confirmed_at) {
    throw new HttpError(
      422,
      'CASE_USE_LOST_WORKFLOW',
      'Confirm loss through the lost-book workflow for an active loan, then link that report to this case.',
    )
  }
  const previous = { ...locked }
  await connection.execute(
    "UPDATE physical_copies SET condition_status = 'Lost', availability_status = 'Unavailable', row_version = row_version + 1, updated_at = NOW() WHERE physical_copy_id = ?",
    [row.physical_copy_id],
  )
  if (copy.material_id) {
    await connection.execute(
      "UPDATE materials SET availability_status = 'Unavailable', updated_at = NOW() WHERE material_id = ?",
      [copy.material_id],
    )
  }
  await recordInventoryAudit(connection, previous, 'Lost Override', actor, 'Lost', 'Unavailable')
  void reason
  void now
}

export const circulationCaseService = createCirculationCaseService()

export type CirculationCaseService = ReturnType<typeof createCirculationCaseService>
export type { Actor }
