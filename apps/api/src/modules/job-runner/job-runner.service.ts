import { randomUUID } from 'node:crypto'
import { JOB_NAMES, type JobHandlers, type JobName } from './job-runner.jobs.ts'
import type { JobRunnerRepository, JobRunRow, JobStateRow } from './job-runner.repository.ts'
import { cleanJobError, jobHealth } from './job-runner.rules.ts'

export type { JobHandlers } from './job-runner.jobs.ts'
export type JobRunReport =
  | { job: JobName; outcome: 'skipped' }
  | { job: JobName; outcome: 'deferred' }
  | { job: JobName; outcome: 'succeeded'; result: Record<string, unknown>; recorded?: false }
  | { job: JobName; outcome: 'failed'; error: { code: string; message: string }; recorded?: false }

const iso = (value: Date | null) => (value ? value.toISOString() : null)
const lost = (recorded: boolean) => (recorded ? {} : { recorded: false as const })
// Vercel stops the function at 60 s; jobs not started by 40 s wait for the next minute instead of being cut off mid-run.
const ALL_DEADLINE_MS = 40_000

export function createJobRunner({ repository, jobs, newToken = randomUUID, now = Date.now }: { repository: JobRunnerRepository; jobs: JobHandlers; newToken?: () => string; now?: () => number }) {
  async function run(job: JobName): Promise<JobRunReport> {
    const token = newToken()
    const claim = await repository.claim(job, token)
    if (!claim) {
      await repository.recordSkipped(job)
      return { job, outcome: 'skipped' }
    }
    let output
    try {
      output = await jobs[job]({ cursor: claim.cursor })
    } catch (error) {
      const cleaned = cleanJobError(error)
      // D3: alert when a failure starts or its code changes, not every minute.
      const alert = claim.previousOutcome !== 'failed' || claim.previousErrorCode !== cleaned.code
      const recorded = await repository.finish(job, token, { outcome: 'failed', errorCode: cleaned.code, errorMessage: cleaned.message, alert })
      return { job, outcome: 'failed', error: cleaned, ...lost(recorded) }
    }
    const cursor = 'cursor' in output ? { set: true, value: output.cursor ?? null } : undefined
    const recorded = await repository.finish(job, token, { outcome: 'succeeded', result: output.result, cursor })
    if (recorded) await repository.prune(job)
    return { job, outcome: 'succeeded', result: output.result, ...lost(recorded) }
  }

  /**
   * A1: one call runs every job in order; one job failing, even in the runner itself, never stops the next.
   * A single job cannot outlive its 90 s lease on Vercel, whose 60 s limit ends the function first (D2).
   */
  async function runAll(): Promise<JobRunReport[]> {
    const reports: JobRunReport[] = []
    const started = now()
    for (const job of JOB_NAMES) {
      if (now() - started >= ALL_DEADLINE_MS) { reports.push({ job, outcome: 'deferred' }); continue }
      try {
        reports.push(await run(job))
      } catch (error) {
        const cleaned = cleanJobError(error)
        console.error(`[Job runner] ${job} could not be recorded (${cleaned.code}).`)
        reports.push({ job, outcome: 'failed', error: cleaned, recorded: false })
      }
    }
    return reports
  }

  async function status() {
    const { now, jobs: states, runs } = await repository.status(JOB_NAMES)
    const runView = (run: JobRunRow) => ({ ...run, startedAt: iso(run.startedAt), finishedAt: iso(run.finishedAt) })
    const jobView = (state: JobStateRow) => ({
      jobName: state.jobName,
      health: jobHealth(state, now),
      lastOutcome: state.lastOutcome,
      lastStartedAt: iso(state.lastStartedAt),
      lastSuccessAt: iso(state.lastSuccessAt),
      lastFailureAt: iso(state.lastFailureAt),
      lastErrorCode: state.lastErrorCode,
      lastErrorMessage: state.lastErrorMessage,
      runs: runs.filter((item) => item.jobName === state.jobName).map(runView),
    })
    return { generatedAt: now.toISOString(), jobs: states.map(jobView) }
  }

  return { run, runAll, status }
}

export type JobRunner = ReturnType<typeof createJobRunner>
