import { db } from '../../config/db.js'
import { createJobHandlers } from './job-runner.jobs.ts'
import { createJobRunnerRepository } from './job-runner.repository.ts'
import { createJobRunner, type JobRunner } from './job-runner.service.ts'

export const jobRunner = createJobRunner({ repository: createJobRunnerRepository(db), jobs: createJobHandlers(db) })

/** A2: the local timer takes the same path as Supabase Cron (`all`, per-job leases), and only when enabled. */
export function startLocalJobTimer(enabled: boolean, runner: JobRunner = jobRunner, intervalMs = 60_000) {
  if (!enabled) return null
  let inFlight: Promise<void> | null = null, stopped = false
  const tick = (): Promise<void> => {
    if (stopped || inFlight) return Promise.resolve()
    inFlight = runner.runAll().then(() => undefined)
      .catch(() => { console.error('[Job runner] Local run could not complete.') })
      .finally(() => { inFlight = null })
    return inFlight
  }
  void tick()
  const timer = setInterval(() => void tick(), intervalMs)
  timer.unref()
  return { tick, stop: () => { stopped = true; clearInterval(timer); return inFlight ?? Promise.resolve() } }
}
