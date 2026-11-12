import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { isJobName } from './job-runner.jobs.ts'
import { cleanJobError, validJobSecret } from './job-runner.rules.ts'
import type { JobRunner } from './job-runner.service.ts'

/**
 * D1: Supabase Cron calls this with `X-Job-Runner-Secret`. Mount it before the session, JWT and CSRF middleware;
 * no other credential is accepted, and the secret is checked before the job name so names are not revealed.
 */
export function createInternalJobRouter(runner: JobRunner, configuredSecret: () => string | undefined, log: (line: string) => void = console.warn) {
  const router = Router()
  // Cron calls once a minute; this only blunts guessing and floods.
  router.use(rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }))
  router.post('/:jobName', async (request, response) => {
    if (!validJobSecret(request.get('x-job-runner-secret'), configuredSecret())) {
      log('[Job runner] Refused an internal job call without a valid job secret.')
      return response.status(401).json({ success: false, code: 'JOB_RUNNER_UNAUTHORIZED', message: 'Scheduled job authorization failed.' })
    }
    const { jobName } = request.params
    if (jobName !== 'all' && !isJobName(jobName)) return response.status(404).json({ success: false, code: 'JOB_NOT_FOUND', message: 'Unknown scheduled job.' })
    try {
      const data = jobName === 'all' ? await runner.runAll() : await runner.run(jobName)
      return response.set('Cache-Control', 'no-store').json({ success: true, data })
    } catch (error) {
      const cleaned = cleanJobError(error)
      log(`[Job runner] ${jobName} could not run (${cleaned.code}).`)
      return response.status(500).json({ success: false, code: 'JOB_RUNNER_FAILED', message: 'The scheduled job could not be recorded.' })
    }
  })
  return router
}

/** D4: read-only status for the Admin dashboard. The caller mounts it behind the Admin permission check. */
export function createAdminJobRouter(runner: JobRunner) {
  const router = Router()
  router.get('/', async (_request, response, next) => {
    try {
      response.set('Cache-Control', 'private, no-store').json({ success: true, data: await runner.status() })
    } catch (error) {
      next(error)
    }
  })
  return router
}
