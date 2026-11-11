import type { Pool, ResultSetHeader, RowDataPacket } from '../../config/db.js'
import type { JobOutcome } from './job-runner.rules.ts'

// Columns are `timestamp` without zone holding UTC; write and read them as UTC so the process zone never matters.
const DB_NOW = "(NOW() AT TIME ZONE 'UTC')"
const utc = (column: string) => `${column} AT TIME ZONE 'UTC' AS ${column}`
const LEASE_SECONDS = 90
const RETENTION_DAYS = 30
const PRUNE_BATCH = 1000
const RUNS_PER_JOB = 20

export type JobClaim = { cursor: string | null; previousOutcome: JobOutcome | null; previousErrorCode: string | null }
export type JobResult = Record<string, unknown>
export type JobFinish =
  | { outcome: 'succeeded'; result: JobResult; cursor?: { set: boolean; value: string | null } }
  | { outcome: 'failed'; errorCode: string; errorMessage: string; alert: boolean }
export type JobStateRow = {
  jobName: string; lastOutcome: JobOutcome | null; lastStartedAt: Date | null; lastSuccessAt: Date | null; lastFailureAt: Date | null
  lastErrorCode: string | null; lastErrorMessage: string | null; leaseExpiresAt: Date | null
}
export type JobRunRow = { jobName: string; startedAt: Date; finishedAt: Date; outcome: JobOutcome; result: JobResult | null; errorCode: string | null; errorMessage: string | null }

function parseResult(value: unknown): JobResult | null {
  if (typeof value !== 'string') return null
  try { return JSON.parse(value) as JobResult } catch { return null }
}

export function createJobRunnerRepository(database: Pool) {
  return {
    /** D2: one atomic upsert; creates the job's row on first claim and takes the lease only when it is free or expired. */
    async claim(jobName: string, token: string): Promise<JobClaim | null> {
      const [header] = await database.execute<ResultSetHeader>(
        `INSERT INTO scheduled_job_state (job_name, lease_token, lease_expires_at, last_started_at, updated_at)
         VALUES (?, ?, ${DB_NOW} + INTERVAL '${LEASE_SECONDS} seconds', ${DB_NOW}, ${DB_NOW})
         ON CONFLICT (job_name) DO UPDATE SET lease_token = EXCLUDED.lease_token, lease_expires_at = EXCLUDED.lease_expires_at,
           last_started_at = EXCLUDED.last_started_at, updated_at = EXCLUDED.updated_at
         WHERE scheduled_job_state.lease_token IS NULL OR scheduled_job_state.lease_expires_at < ${DB_NOW}
         RETURNING progress_cursor, last_outcome, last_error_code`,
        [jobName, token],
      )
      const row = (header as ResultSetHeader & { rows?: RowDataPacket[] }).rows?.[0]
      if (!header.affectedRows || !row) return null
      return { cursor: row.progress_cursor ?? null, previousOutcome: row.last_outcome ?? null, previousErrorCode: row.last_error_code ?? null }
    },

    /** Records the run and releases the lease. Returns false when `token` no longer holds the lease; nothing is written then. */
    async finish(jobName: string, token: string, detail: JobFinish): Promise<boolean> {
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const succeeded = detail.outcome === 'succeeded'
        const resultJson = succeeded ? JSON.stringify(detail.result) : null
        const [run] = await connection.execute<ResultSetHeader>(
          `INSERT INTO scheduled_job_runs (job_name, started_at, finished_at, outcome, result_json, error_code, error_message, lease_token)
           SELECT job_name, COALESCE(last_started_at, ${DB_NOW}), ${DB_NOW}, ?, ?, ?, ?, lease_token
             FROM scheduled_job_state WHERE job_name = ? AND lease_token = ?
             FOR UPDATE
           RETURNING run_id`,
          [detail.outcome, resultJson, succeeded ? null : detail.errorCode, succeeded ? null : detail.errorMessage, jobName, token],
        )
        if (!run.affectedRows) { await connection.rollback(); return false }
        let released: ResultSetHeader
        if (succeeded) {
          ;[released] = await connection.execute<ResultSetHeader>(
            `UPDATE scheduled_job_state SET lease_token = NULL, lease_expires_at = NULL, last_outcome = 'succeeded', last_success_at = ${DB_NOW},
               last_error_code = NULL, last_error_message = NULL, last_result_json = ?,
               progress_cursor = CASE WHEN ?::boolean THEN ?::text ELSE progress_cursor END, updated_at = ${DB_NOW}
             WHERE job_name = ? AND lease_token = ?`,
            [resultJson, Boolean(detail.cursor?.set), detail.cursor?.value ?? null, jobName, token],
          )
        } else {
          ;[released] = await connection.execute<ResultSetHeader>(
            `UPDATE scheduled_job_state SET lease_token = NULL, lease_expires_at = NULL, last_outcome = 'failed', last_failure_at = ${DB_NOW},
               last_error_code = ?, last_error_message = ?, updated_at = ${DB_NOW}
             WHERE job_name = ? AND lease_token = ?`,
            [detail.errorCode, detail.errorMessage, jobName, token],
          )
        }
        // The row lock above makes this unreachable in Postgres; checked anyway so a lost lease can never commit.
        if (!released.affectedRows) { await connection.rollback(); return false }
        if (!succeeded && detail.alert) {
          await connection.execute(
            "INSERT INTO admin_notifications (event_type, message_title, message_body) VALUES ('scheduled_job_failed', 'Scheduled library job failed', ?)",
            [`${jobName} failed (${detail.errorCode}): ${detail.errorMessage}`.slice(0, 500)],
          )
        }
        await connection.commit()
        return true
      } catch (error) {
        await connection.rollback().catch(() => {})
        throw error
      } finally {
        connection.release()
      }
    },

    /** D2: a run that found the lease held. The job's state belongs to the lease holder, so only history is written. */
    async recordSkipped(jobName: string) {
      await database.execute(
        `INSERT INTO scheduled_job_runs (job_name, started_at, finished_at, outcome) VALUES (?, ${DB_NOW}, ${DB_NOW}, 'skipped')`,
        [jobName],
      )
    },

    async prune(jobName: string): Promise<number> {
      const [header] = await database.execute<ResultSetHeader>(
        `DELETE FROM scheduled_job_runs WHERE run_id IN (
           SELECT run_id FROM scheduled_job_runs WHERE job_name = ? AND started_at < ${DB_NOW} - INTERVAL '${RETENTION_DAYS} days'
           ORDER BY run_id LIMIT ${PRUNE_BATCH} FOR UPDATE SKIP LOCKED)`,
        [jobName],
      )
      return header.affectedRows
    },

    async status(jobNames: readonly string[]) {
      const names = [...jobNames]
      const [[clock], [states], [runs]] = await Promise.all([
        database.execute<RowDataPacket[]>('SELECT NOW() AS now', []),
        database.execute<RowDataPacket[]>(
          `SELECT job_name, last_outcome, last_error_code, last_error_message,
             ${['last_started_at', 'last_success_at', 'last_failure_at', 'lease_expires_at'].map(utc).join(', ')}
             FROM scheduled_job_state WHERE job_name = ANY(?::text[])`, [names]),
        database.execute<RowDataPacket[]>(
          // One index range per job (job_name, started_at DESC); skipped runs would crowd real ones out of the window.
          `SELECT recent.job_name, outcome, result_json, error_code, error_message, ${utc('started_at')}, ${utc('finished_at')}
             FROM unnest(?::text[]) AS wanted(job_name)
             CROSS JOIN LATERAL (
               SELECT run_id, job_name, outcome, result_json, error_code, error_message, started_at, finished_at FROM scheduled_job_runs
                WHERE job_name = wanted.job_name AND outcome <> 'skipped'
                ORDER BY started_at DESC, run_id DESC LIMIT ${RUNS_PER_JOB}) recent
            ORDER BY started_at DESC, run_id DESC`, [names]),
      ])
      const byName = new Map(states.map((row) => [row.job_name as string, row]))
      const jobs: JobStateRow[] = names.map((jobName) => {
        const row = byName.get(jobName)
        return {
          jobName, lastOutcome: row?.last_outcome ?? null, lastStartedAt: row?.last_started_at ?? null, lastSuccessAt: row?.last_success_at ?? null,
          lastFailureAt: row?.last_failure_at ?? null, lastErrorCode: row?.last_error_code ?? null, lastErrorMessage: row?.last_error_message ?? null,
          leaseExpiresAt: row?.lease_expires_at ?? null,
        }
      })
      const recent: JobRunRow[] = runs.map((row) => ({
        jobName: row.job_name, startedAt: row.started_at, finishedAt: row.finished_at, outcome: row.outcome,
        result: parseResult(row.result_json), errorCode: row.error_code ?? null, errorMessage: row.error_message ?? null,
      }))
      return { now: clock[0].now as Date, jobs, runs: recent }
    },
  }
}

export type JobRunnerRepository = ReturnType<typeof createJobRunnerRepository>
