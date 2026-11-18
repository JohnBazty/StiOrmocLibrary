import assert from 'node:assert/strict'
import test from 'node:test'
import { createJobRunner, type JobHandlers } from './job-runner.service.ts'
import { JOB_NAMES } from './job-runner.jobs.ts'
import { createJobRunnerRepository } from './job-runner.repository.ts'
import { createJobTestDatabase } from './pglite-pool.test.helper.ts'

function handlers(overrides: Partial<JobHandlers> = {}): JobHandlers {
  const ok = async () => ({ result: { done: 1 } })
  return { ...Object.fromEntries(JOB_NAMES.map((name) => [name, ok])), ...overrides } as JobHandlers
}

test('a job run records succeeded with its counts', async () => {
  const { pool } = await createJobTestDatabase()
  const runner = createJobRunner({ repository: createJobRunnerRepository(pool), jobs: handlers({ notifications: async () => ({ result: { inserted: 3 } }) }) })
  assert.deepEqual(await runner.run('notifications'), { job: 'notifications', outcome: 'succeeded', result: { inserted: 3 } })
})

test('a held lease records skipped and does not run the job', async () => {
  const { pool } = await createJobTestDatabase()
  const repository = createJobRunnerRepository(pool)
  await repository.claim('notifications', '99999999-9999-4999-8999-999999999999')
  let ran = false
  const runner = createJobRunner({ repository, jobs: handlers({ notifications: async () => { ran = true; return { result: {} } } }) })
  assert.deepEqual(await runner.run('notifications'), { job: 'notifications', outcome: 'skipped' })
  assert.equal(ran, false)
})

test('a failing job records failed with a cleaned error, and all continues with the next job', async () => {
  const { pg, pool } = await createJobTestDatabase()
  const order: string[] = []
  const jobs = handlers(Object.fromEntries(JOB_NAMES.map((name) => [name, async () => {
    order.push(name)
    if (name === 'enrollment-close') throw Object.assign(new Error('fail at postgresql://u:secret@h/db\nstack'), { code: 'ECONNRESET' })
    return { result: { done: 1 } }
  }])) as Partial<JobHandlers>)
  const runner = createJobRunner({ repository: createJobRunnerRepository(pool), jobs })
  const reports = await runner.runAll()
  assert.deepEqual(order, [...JOB_NAMES])
  assert.deepEqual(reports[0], { job: 'enrollment-close', outcome: 'failed', error: { code: 'ECONNRESET', message: 'fail at [redacted]' } })
  assert.ok(reports.slice(1).every((report) => report.outcome === 'succeeded'))
  assert.equal((await pg.query("SELECT 1 FROM admin_notifications")).rows.length, 1)
  await runner.run('enrollment-close')
  assert.equal((await pg.query("SELECT 1 FROM admin_notifications")).rows.length, 1, 'repeat failure with the same code is not re-alerted')
})

test('the overdue job receives the stored cursor and its next cursor is stored', async () => {
  const { pg, pool } = await createJobTestDatabase()
  const seen: Array<string | null> = []
  const runner = createJobRunner({ repository: createJobRunnerRepository(pool), jobs: handlers({
    'circulation-overdue': async ({ cursor }) => { seen.push(cursor); return { result: { evaluatedCount: 100 }, cursor: seen.length === 1 ? '{"dueAt":"2026-11-10 08:59:00","transactionId":5}' : null } },
  }) })
  await runner.run('circulation-overdue')
  await runner.run('circulation-overdue')
  assert.deepEqual(seen, [null, '{"dueAt":"2026-11-10 08:59:00","transactionId":5}'])
  assert.equal((await pg.query<{ progress_cursor: string | null }>("SELECT progress_cursor FROM scheduled_job_state WHERE job_name='circulation-overdue'")).rows[0].progress_cursor, null)
})

test('a run whose lease was taken over reports that its result was not recorded', async () => {
  const { pg, pool } = await createJobTestDatabase()
  const runner = createJobRunner({ repository: createJobRunnerRepository(pool), jobs: handlers({
    notifications: async () => { await pg.exec("UPDATE scheduled_job_state SET lease_token='33333333-3333-4333-8333-333333333333' WHERE job_name='notifications'"); return { result: { inserted: 1 } } },
  }) })
  assert.deepEqual(await runner.run('notifications'), { job: 'notifications', outcome: 'succeeded', result: { inserted: 1 }, recorded: false })
})

test('status derives health per job and attaches each job\'s runs', async () => {
  const { pg, pool } = await createJobTestDatabase()
  const runner = createJobRunner({ repository: createJobRunnerRepository(pool), jobs: handlers({ 'book-request-emails': async () => { throw new Error('SMTP down') } }) })
  await runner.run('notifications')
  await runner.run('book-request-emails')
  await pg.exec("UPDATE scheduled_job_state SET last_success_at = last_success_at - INTERVAL '10 minutes' WHERE job_name='notifications'")
  const status = await runner.status()
  assert.deepEqual(status.jobs.map((job) => job.jobName), [...JOB_NAMES])
  const byName = Object.fromEntries(status.jobs.map((job) => [job.jobName, job]))
  assert.equal(byName.notifications.health, 'stale')
  assert.equal(byName['book-request-emails'].health, 'failed')
  assert.equal(byName['book-request-emails'].lastErrorMessage, 'SMTP down')
  assert.equal(byName['reservation-expiration'].health, 'stale')
  assert.equal(byName.notifications.runs.length, 1)
  assert.equal(typeof byName.notifications.lastSuccessAt, 'string')
})

test('all records a job as failed and moves on when the runner itself cannot reach the database', async () => {
  const { pool } = await createJobTestDatabase()
  const repository = createJobRunnerRepository(pool)
  const broken = { ...repository, claim: async (job: string, token: string) => { if (job === 'enrollment-close') throw Object.assign(new Error('db down'), { code: 'ECONNREFUSED' }); return repository.claim(job, token) } }
  const runner = createJobRunner({ repository: broken, jobs: handlers() })
  const reports = await runner.runAll()
  assert.deepEqual(reports[0], { job: 'enrollment-close', outcome: 'failed', error: { code: 'ECONNREFUSED', message: 'db down' }, recorded: false })
  assert.equal(reports.filter((report) => report.outcome === 'succeeded').length, JOB_NAMES.length - 1)
})

test('all stops starting jobs after its deadline and reports the rest as deferred, without touching them', async () => {
  const { pg, pool } = await createJobTestDatabase()
  let clock = 0
  const jobs = handlers(Object.fromEntries(JOB_NAMES.map((name) => [name, async () => { clock += 25_000; return { result: { done: 1 } } }])) as Partial<JobHandlers>)
  const runner = createJobRunner({ repository: createJobRunnerRepository(pool), jobs, now: () => clock })
  const reports = await runner.runAll()
  assert.deepEqual(reports.map((report) => report.outcome), ['succeeded', 'succeeded', ...Array(JOB_NAMES.length - 2).fill('deferred')])
  assert.equal((await pg.query("SELECT 1 FROM scheduled_job_runs")).rows.length, 2)
})
