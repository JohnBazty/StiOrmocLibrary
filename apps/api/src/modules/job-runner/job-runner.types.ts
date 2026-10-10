export const JOB_NAMES = ['reservation-expiration', 'circulation-overdue', 'notifications'] as const

export type JobName = (typeof JOB_NAMES)[number]

export type JobOutcome = 'succeeded' | 'failed' | 'skipped'

export type JobHealth = 'healthy' | 'failed' | 'stale'

export type OverdueProgressCursor = {
  dueAt: string
  transactionId: number
}

export type JobResultCounts = Record<string, number | string | boolean | null>

export type JobRunResult = {
  jobName: JobName
  outcome: JobOutcome
  runId: number | null
  counts: JobResultCounts | null
  errorCode?: string
  errorMessage?: string
}

export type ScheduledJobStatus = {
  jobName: JobName
  health: JobHealth
  lastSuccessAt: string | null
  lastFailureAt: string | null
  lastStartedAt: string | null
  lastOutcome: JobOutcome | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  lastResult: JobResultCounts | null
  leaseHeld: boolean
}

export const STALE_AFTER_MS = 3 * 60 * 1000
export const LEASE_SECONDS = 90
export const ERROR_MESSAGE_MAX = 500
export const RUN_RETENTION_DAYS = 30

export function isJobName(value: string): value is JobName {
  return (JOB_NAMES as readonly string[]).includes(value)
}
