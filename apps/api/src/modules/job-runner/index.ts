import { db } from '../../config/db.js'
import { createJobHandlers } from './job-runner.jobs.ts'
import { createJobRunnerRepository } from './job-runner.repository.ts'
import { createJobRunner, type JobRunner } from './job-runner.service.ts'

export const jobRunner = createJobRunner({ repository: createJobRunnerRepository(db), jobs: createJobHandlers(db) })

/** A2: the local timer takes the same path as Supabase Cron (`all`, per-job leases), and only when enabled. */
export function startLocalJobTimer(enabled: boolean, runner: JobRunner = jobRunner, intervalMs = 60_000) {
  if (!enabled) return null
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try { await runner.runAll() } finally { running = false }
  }
  void tick()
  const timer = setInterval(() => void tick(), intervalMs)
  timer.unref()
  return { tick, stop: () => clearInterval(timer) }
}
