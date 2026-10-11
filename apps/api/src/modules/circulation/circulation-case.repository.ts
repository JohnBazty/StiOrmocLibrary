import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { isPostgres } from '../../config/sql-dialect.js'
import type { CaseEventType, CaseStatus, CaseType } from './circulation-case.types.ts'

export type CaseRow = RowDataPacket & {
  case_id: number
  case_type: CaseType
  transaction_id: number
  physical_copy_id: number
  borrower_user_id: number
  status: CaseStatus
  assigned_to_user_id: number | null
  summary: string | null
  opened_at: Date | string
  updated_at: Date | string
  resolved_at: Date | string | null
  opened_by_user_id: number | null
  resolved_by_user_id: number | null
  policy_version_id: number | null
  threshold_days_snapshot: number | null
  threshold_reached_at: Date | string | null
  baseline_condition_status: string | null
  observed_condition_status: string | null
  lost_book_report_id: number | null
}

export async function findCaseById(connection: PoolConnection, caseId: number, forUpdate = false) {
  const [rows] = await connection.execute<CaseRow[]>(
    `SELECT * FROM circulation_cases WHERE case_id = ? LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [caseId],
  )
  return rows[0] ?? null
}

export async function findCaseByTransactionType(
  connection: PoolConnection,
  transactionId: number,
  caseType: CaseType,
  forUpdate = false,
) {
  const [rows] = await connection.execute<CaseRow[]>(
    `SELECT * FROM circulation_cases WHERE transaction_id = ? AND case_type = ? LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [transactionId, caseType],
  )
  return rows[0] ?? null
}

export async function insertCase(
  connection: PoolConnection,
  input: {
    caseType: CaseType
    transactionId: number
    physicalCopyId: number
    borrowerUserId: number
    status: CaseStatus
    summary: string | null
    openedAt: Date
    openedByUserId: number | null
    policyVersionId: number | null
    thresholdDaysSnapshot: number | null
    thresholdReachedAt: Date | null
    baselineCondition: string | null
    observedCondition: string | null
  },
) {
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO circulation_cases
       (case_type, transaction_id, physical_copy_id, borrower_user_id, status, summary, opened_at, opened_by_user_id,
        policy_version_id, threshold_days_snapshot, threshold_reached_at, baseline_condition_status, observed_condition_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.caseType, input.transactionId, input.physicalCopyId, input.borrowerUserId, input.status, input.summary,
      input.openedAt, input.openedByUserId, input.policyVersionId, input.thresholdDaysSnapshot, input.thresholdReachedAt,
      input.baselineCondition, input.observedCondition,
    ],
  )
  return Number(result.insertId)
}

export async function appendCaseEvent(
  connection: PoolConnection,
  input: {
    caseId: number
    eventType: CaseEventType
    actorUserId: number | null
    fromStatus: string | null
    toStatus: string | null
    reason: string | null
    notes: string | null
  },
) {
  await connection.execute(
    `INSERT INTO circulation_case_events
       (case_id, event_type, actor_user_id, from_status, to_status, reason, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [input.caseId, input.eventType, input.actorUserId, input.fromStatus, input.toStatus, input.reason, input.notes],
  )
}

export async function updateCaseStatus(
  connection: PoolConnection,
  caseId: number,
  patch: {
    status: CaseStatus
    assignedToUserId?: number | null
    resolvedAt?: Date | null
    resolvedByUserId?: number | null
    observedCondition?: string | null
    lostBookReportId?: number | null
    summary?: string | null
  },
) {
  await connection.execute(
    `UPDATE circulation_cases
        SET status = ?,
            assigned_to_user_id = COALESCE(?, assigned_to_user_id),
            resolved_at = COALESCE(?, resolved_at),
            resolved_by_user_id = COALESCE(?, resolved_by_user_id),
            observed_condition_status = COALESCE(?, observed_condition_status),
            lost_book_report_id = COALESCE(?, lost_book_report_id),
            summary = COALESCE(?, summary),
            updated_at = NOW()
      WHERE case_id = ?`,
    [
      patch.status,
      patch.assignedToUserId ?? null,
      patch.resolvedAt ?? null,
      patch.resolvedByUserId ?? null,
      patch.observedCondition ?? null,
      patch.lostBookReportId ?? null,
      patch.summary ?? null,
      caseId,
    ],
  )
}

export async function listCaseEvents(connection: PoolConnection, caseId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT event_id, event_type, actor_user_id, from_status, to_status, reason, notes, created_at
       FROM circulation_case_events
      WHERE case_id = ?
      ORDER BY created_at ASC, event_id ASC`,
    [caseId],
  )
  return rows
}

export async function insertUserCaseNotification(
  connection: PoolConnection,
  userId: number,
  title: string,
  body: string,
  dedupeKey: string,
) {
  await connection.execute(
    isPostgres
      ? `INSERT INTO notifications
           (user_id, message_title, message_body, trigger_type, source_type, source_id, dedupe_key, is_read, delivered_at)
         VALUES (?, ?, ?, 'Circulation Case', 'circulation_case', NULL, ?, 0, NOW())
         ON CONFLICT (user_id, dedupe_key) DO NOTHING`
      : `INSERT IGNORE INTO notifications
           (user_id, message_title, message_body, trigger_type, source_type, source_id, dedupe_key, is_read, delivered_at)
         VALUES (?, ?, ?, 'Circulation Case', 'circulation_case', NULL, ?, 0, NOW())`,
    [userId, title, body, dedupeKey],
  )
}
