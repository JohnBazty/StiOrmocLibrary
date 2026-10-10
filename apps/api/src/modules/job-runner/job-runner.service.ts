import type { Pool } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { escalateOverdueTransactions } from '../circulation/circulation-overdue.service.ts'
import { generateNotifications } from '../notifications/notification.worker.ts'
import { expireReadyReservations } from '../reservations/reservation-expiration.service.ts'
import {
  claimJobLease,
  finishJobRun,
  listJobStates,
  listRecentRuns,
  recordSkippedRun,
  sanitizeErrorMessage,
} from './job-runner.repository.ts'
import {
  STALE_AFTER_MS,
  type JobHealth,
  type JobName,
  type JobResultCounts,
  type JobRunResult,
  type OverdueProgressCursor,
  type ScheduledJobStatus,
  isJobName,
} from './job-runner.types.ts'

function toIso(value: unknown) {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function parseResult(value: unknown): JobResultCounts | null {
  if (value == null) return null
  if (typeof value === 'string') {
    try { return JSON.parse(value) as JobResultCounts } catch { return null }
  }
  if (typeof value === 'object') return value as JobResultCounts
  return null
}

export function deriveJobHealth(input: {
  lastSuccessAt: Date | null
  lastOutcome: string | null
  now?: Date
}): JobHealth {
  const now = input.now ?? new Date()
  if (input.lastOutcome === 'failed') return 'failed'
  if (!input.lastSuccessAt || now.getTime() - input.lastSuccessAt.getTime() > STALE_AFTER_MS) return 'stale'
  return 'healthy'
}

async function executeJob(
  jobName: JobName,
  progressCursor: OverdueProgressCursor | null,
  database: Pool,
  now: Date,
) {
  if (jobName === 'reservation-expiration') {
    const result = await expireReadyReservations(database, now)
    return {
      counts: { expiredCount: result.expiredCount, releasedAccessions: result.releasedAccessions.length },
      progressCursor: undefined as OverdueProgressCursor | null | undefined,
    }
  }
  if (jobName === 'circulation-overdue') {
    const result = await escalateOverdueTransactions(database, now, 100, progressCursor)
    return {
      counts: {
        evaluatedCount: result.evaluatedCount,
        newlyOverdue: result.newlyOverdue,
        longOverdueCasesOpened: result.longOverdueCasesOpened,
      },
      progressCursor: result.nextCursor,
    }
  }
  const result = await generateNotifications(database, now)
  return {
    counts: { inserted: result.inserted, publishedAnnouncements: result.publishedAnnouncements },
    progressCursor: undefined as OverdueProgressCursor | null | undefined,
  }
}

export async function runScheduledJob(jobNameInput: string, database: Pool = db, now: Date = new Date()): Promise<JobRunResult> {
  if (!isJobName(jobNameInput)) {
    throw new HttpError(404, 'JOB_NOT_FOUND', 'Unknown scheduled job.')
  }
  const jobName = jobNameInput
  const startedAt = now
  const lease = await claimJobLease(jobName, database)
  if (!lease) {
    const runId = await recordSkippedRun(jobName, startedAt, database)
    return { jobName, outcome: 'skipped', runId, counts: null }
  }

  try {
    const executed = await executeJob(jobName, lease.progressCursor, database, now)
    const runId = await finishJobRun({
      jobName,
      leaseToken: lease.leaseToken,
      startedAt,
      outcome: 'succeeded',
      counts: executed.counts,
      progressCursor: executed.progressCursor,
    }, database)
    return { jobName, outcome: 'succeeded', runId, counts: executed.counts }
  } catch (error) {
    const errorCode = error instanceof HttpError ? error.code : 'SERVICE_ERROR'
    const errorMessage = sanitizeErrorMessage(error instanceof Error ? error.message : 'Job failed.')
    const runId = await finishJobRun({
      jobName,
      leaseToken: lease.leaseToken,
      startedAt,
      outcome: 'failed',
      counts: null,
      errorCode,
      errorMessage,
    }, database)
    throw Object.assign(
      new HttpError(500, errorCode, errorMessage, { jobName, runId, outcome: 'failed' }),
      { jobRunResult: { jobName, outcome: 'failed' as const, runId, counts: null, errorCode, errorMessage } },
    )
  }
}

export async function getScheduledJobStatuses(database: Pool = db, now: Date = new Date()): Promise<ScheduledJobStatus[]> {
  const rows = await listJobStates(database)
  return rows.map((row) => {
    const jobName = String(row.job_name) as JobName
    const lastSuccessAt = row.last_success_at ? new Date(row.last_success_at) : null
    const lastOutcome = row.last_outcome == null ? null : String(row.last_outcome) as ScheduledJobStatus['lastOutcome']
    const leaseExpiresAt = row.lease_expires_at ? new Date(row.lease_expires_at) : null
    const leaseHeld = Boolean(row.lease_token && leaseExpiresAt && leaseExpiresAt.getTime() > now.getTime())
    return {
      jobName,
      health: deriveJobHealth({ lastSuccessAt, lastOutcome, now }),
      lastSuccessAt: toIso(row.last_success_at),
      lastFailureAt: toIso(row.last_failure_at),
      lastStartedAt: toIso(row.last_started_at),
      lastOutcome,
      lastErrorCode: row.last_error_code == null ? null : String(row.last_error_code),
      lastErrorMessage: row.last_error_message == null ? null : String(row.last_error_message),
      lastResult: parseResult(row.last_result_json),
      leaseHeld,
    }
  })
}

export async function getRecentJobRuns(jobNameInput: string, limit = 20, database: Pool = db) {
  if (!isJobName(jobNameInput)) {
    throw new HttpError(404, 'JOB_NOT_FOUND', 'Unknown scheduled job.')
  }
  return listRecentRuns(jobNameInput, limit, database)
}
