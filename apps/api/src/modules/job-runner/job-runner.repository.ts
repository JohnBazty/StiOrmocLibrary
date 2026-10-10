import { randomUUID } from 'node:crypto'
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { isPostgres } from '../../config/sql-dialect.js'
import {
  ERROR_MESSAGE_MAX,
  LEASE_SECONDS,
  RUN_RETENTION_DAYS,
  type JobName,
  type JobOutcome,
  type JobResultCounts,
  type OverdueProgressCursor,
} from './job-runner.types.ts'

function asJson(value: unknown) {
  if (value == null) return null
  if (typeof value === 'string') {
    try { return JSON.parse(value) as JobResultCounts } catch { return null }
  }
  if (typeof value === 'object') return value as JobResultCounts
  return null
}

function parseCursor(value: unknown): OverdueProgressCursor | null {
  const parsed = asJson(value)
  if (!parsed) return null
  const dueAt = parsed.dueAt
  const transactionId = parsed.transactionId
  if (typeof dueAt !== 'string' || !dueAt) return null
  if (typeof transactionId !== 'number' || !Number.isSafeInteger(transactionId)) return null
  return { dueAt, transactionId }
}

export function sanitizeErrorMessage(message: string) {
  const cleaned = message.replace(/\s+/g, ' ').trim().slice(0, ERROR_MESSAGE_MAX)
  return cleaned || 'Job failed.'
}

export async function claimJobLease(jobName: JobName, database: Pool = db) {
  const leaseToken = randomUUID()
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    if (isPostgres) {
      const [rows] = await connection.execute<RowDataPacket[]>(
        `UPDATE scheduled_job_state
            SET lease_token = ?,
                lease_expires_at = NOW() + (${LEASE_SECONDS} * INTERVAL '1 second'),
                last_started_at = NOW(),
                updated_at = NOW()
          WHERE job_name = ?
            AND (lease_token IS NULL OR lease_expires_at < NOW())
          RETURNING job_name, progress_cursor`,
        [leaseToken, jobName],
      )
      if (!rows.length) {
        await connection.rollback()
        return null
      }
      await connection.commit()
      return { leaseToken, progressCursor: parseCursor(rows[0].progress_cursor) }
    }

    const [locked] = await connection.execute<RowDataPacket[]>(
      `SELECT job_name, lease_token, lease_expires_at, progress_cursor
         FROM scheduled_job_state
        WHERE job_name = ?
        FOR UPDATE`,
      [jobName],
    )
    const row = locked[0]
    if (!row) {
      await connection.rollback()
      return null
    }
    const held = row.lease_token && row.lease_expires_at && new Date(row.lease_expires_at).getTime() > Date.now()
    if (held) {
      await connection.rollback()
      return null
    }
    await connection.execute(
      `UPDATE scheduled_job_state
          SET lease_token = ?,
              lease_expires_at = DATE_ADD(NOW(), INTERVAL ${LEASE_SECONDS} SECOND),
              last_started_at = NOW(),
              updated_at = NOW()
        WHERE job_name = ?`,
      [leaseToken, jobName],
    )
    await connection.commit()
    return { leaseToken, progressCursor: parseCursor(row.progress_cursor) }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export async function finishJobRun(input: {
  jobName: JobName
  leaseToken: string
  startedAt: Date
  outcome: JobOutcome
  counts: JobResultCounts | null
  progressCursor?: OverdueProgressCursor | null
  errorCode?: string | null
  errorMessage?: string | null
}, database: Pool = db) {
  const resultJson = input.counts ? JSON.stringify(input.counts) : null
  const cursorJson = input.progressCursor === undefined
    ? undefined
    : input.progressCursor === null
      ? null
      : JSON.stringify(input.progressCursor)
  const errorCode = input.errorCode ?? null
  const errorMessage = input.errorMessage ? sanitizeErrorMessage(input.errorMessage) : null
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const successPatch = input.outcome === 'succeeded'
      ? `, last_success_at = NOW(), last_error_code = NULL, last_error_message = NULL`
      : input.outcome === 'failed'
        ? `, last_failure_at = NOW(), last_error_code = ?, last_error_message = ?`
        : ''
    const cursorPatch = cursorJson !== undefined ? ', progress_cursor = ?' : ''
    const params: unknown[] = [null, null, input.outcome, resultJson]
    if (input.outcome === 'failed') params.push(errorCode, errorMessage)
    if (cursorJson !== undefined) params.push(cursorJson)
    params.push(input.jobName, input.leaseToken)

    const [updated] = await connection.execute<ResultSetHeader>(
      `UPDATE scheduled_job_state
          SET lease_token = ?,
              lease_expires_at = ?,
              last_outcome = ?,
              last_result_json = ?
              ${successPatch}
              ${cursorPatch},
              updated_at = NOW()
        WHERE job_name = ? AND lease_token = ?`,
      params,
    )
    if (!updated.affectedRows) {
      await connection.rollback()
      return null
    }

    let runId: number | null = null
    if (isPostgres) {
      const [inserted] = await connection.execute<RowDataPacket[]>(
        `INSERT INTO scheduled_job_runs
           (job_name, started_at, finished_at, outcome, result_json, error_code, error_message, lease_token)
         VALUES (?, ?, NOW(), ?, ?, ?, ?, ?)
         RETURNING run_id`,
        [input.jobName, input.startedAt, input.outcome, resultJson, errorCode, errorMessage, input.leaseToken],
      )
      runId = inserted[0] ? Number(inserted[0].run_id) : null
    } else {
      const [inserted] = await connection.execute<ResultSetHeader>(
        `INSERT INTO scheduled_job_runs
           (job_name, started_at, finished_at, outcome, result_json, error_code, error_message, lease_token)
         VALUES (?, ?, NOW(), ?, ?, ?, ?, ?)`,
        [input.jobName, input.startedAt, input.outcome, resultJson, errorCode, errorMessage, input.leaseToken],
      )
      runId = Number(inserted.insertId) || null
    }

    await connection.execute(
      isPostgres
        ? `DELETE FROM scheduled_job_runs
            WHERE started_at < NOW() - (? * INTERVAL '1 day')`
        : `DELETE FROM scheduled_job_runs
            WHERE started_at < DATE_SUB(NOW(), INTERVAL ? DAY)
            ORDER BY started_at ASC
            LIMIT 500`,
      [RUN_RETENTION_DAYS],
    )

    await connection.commit()
    return runId
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export async function recordSkippedRun(jobName: JobName, startedAt: Date, database: Pool = db) {
  if (isPostgres) {
    const [inserted] = await database.execute<RowDataPacket[]>(
      `INSERT INTO scheduled_job_runs
         (job_name, started_at, finished_at, outcome, result_json, error_code, error_message, lease_token)
       VALUES (?, ?, NOW(), 'skipped', NULL, NULL, NULL, NULL)
       RETURNING run_id`,
      [jobName, startedAt],
    )
    return inserted[0] ? Number(inserted[0].run_id) : null
  }
  const [inserted] = await database.execute<ResultSetHeader>(
    `INSERT INTO scheduled_job_runs
       (job_name, started_at, finished_at, outcome, result_json, error_code, error_message, lease_token)
     VALUES (?, ?, NOW(), 'skipped', NULL, NULL, NULL, NULL)`,
    [jobName, startedAt],
  )
  return Number(inserted.insertId) || null
}

export async function listJobStates(database: Pool = db) {
  const [rows] = await database.execute<RowDataPacket[]>(
    `SELECT job_name, lease_token, lease_expires_at, last_started_at, last_success_at, last_failure_at,
            last_outcome, last_error_code, last_error_message, last_result_json
       FROM scheduled_job_state
      ORDER BY job_name`,
  )
  return rows
}

export async function listRecentRuns(jobName: JobName, limit = 20, database: Pool = db) {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100)
  const [rows] = await database.execute<RowDataPacket[]>(
    `SELECT run_id, job_name, started_at, finished_at, outcome, result_json, error_code, error_message
       FROM scheduled_job_runs
      WHERE job_name = ?
      ORDER BY started_at DESC
      LIMIT ${safeLimit}`,
    [jobName],
  )
  return rows.map((row) => ({
    runId: Number(row.run_id),
    jobName: String(row.job_name),
    startedAt: new Date(row.started_at).toISOString(),
    finishedAt: new Date(row.finished_at).toISOString(),
    outcome: String(row.outcome) as JobOutcome,
    result: asJson(row.result_json),
    errorCode: row.error_code == null ? null : String(row.error_code),
    errorMessage: row.error_message == null ? null : String(row.error_message),
  }))
}
