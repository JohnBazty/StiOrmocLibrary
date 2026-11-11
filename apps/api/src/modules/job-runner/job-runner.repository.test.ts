import assert from 'node:assert/strict'
import test from 'node:test'
import { createJobRunnerRepository } from './job-runner.repository.ts'
import { createJobTestDatabase } from './pglite-pool.test.helper.ts'

const tokenA = '11111111-1111-4111-8111-111111111111'
const tokenB = '22222222-2222-4222-8222-222222222222'

test('two claims at once: only one gets the lease, and a job row is created on first claim', async () => {
  const { pg, pool } = await createJobTestDatabase()
  const repository = createJobRunnerRepository(pool)
  const claims = await Promise.all([repository.claim('book-request-emails', tokenA), repository.claim('book-request-emails', tokenB)])
  assert.equal(claims.filter(Boolean).length, 1)
  const row = (await pg.query<{ lease_token: string; seconds: number }>(
    "SELECT lease_token, EXTRACT(EPOCH FROM lease_expires_at - last_started_at)::int AS seconds FROM scheduled_job_state WHERE job_name='book-request-emails'")).rows[0]
  assert.ok([tokenA, tokenB].includes(row.lease_token))
  assert.equal(row.seconds, 90)
})

test('an expired lease can be reclaimed, and the stale token can no longer write', async () => {
  const { pg, pool } = await createJobTestDatabase()
  const repository = createJobRunnerRepository(pool)
  assert.ok(await repository.claim('circulation-overdue', tokenA))
  assert.equal(await repository.claim('circulation-overdue', tokenB), null, 'lease still held')
  await pg.exec("UPDATE scheduled_job_state SET lease_expires_at = lease_expires_at - INTERVAL '91 seconds' WHERE job_name='circulation-overdue'")
  assert.ok(await repository.claim('circulation-overdue', tokenB))
  const stale = await repository.finish('circulation-overdue', tokenA, { outcome: 'succeeded', result: { evaluatedCount: 1 }, cursor: { set: true, value: '{"dueAt":"2026-11-10 08:59:00","transactionId":1}' } })
  assert.equal(stale, false)
  const state = (await pg.query<{ lease_token: string; progress_cursor: string | null; last_outcome: string | null }>(
    "SELECT lease_token, progress_cursor, last_outcome FROM scheduled_job_state WHERE job_name='circulation-overdue'")).rows[0]
  assert.deepEqual(state, { lease_token: tokenB, progress_cursor: null, last_outcome: null })
  assert.equal((await pg.query("SELECT 1 FROM scheduled_job_runs")).rows.length, 0)
})

test('success records the run, clears the lease, stores counts and the cursor', async () => {
  const { pg, pool } = await createJobTestDatabase()
  const repository = createJobRunnerRepository(pool)
  await repository.claim('circulation-overdue', tokenA)
  const cursor = '{"dueAt":"2026-11-10 08:59:00","transactionId":7}'
  assert.equal(await repository.finish('circulation-overdue', tokenA, { outcome: 'succeeded', result: { evaluatedCount: 100 }, cursor: { set: true, value: cursor } }), true)
  const state = (await pg.query<Record<string, unknown>>("SELECT lease_token, lease_expires_at, last_outcome, last_result_json, progress_cursor, last_success_at IS NOT NULL AS succeeded FROM scheduled_job_state WHERE job_name='circulation-overdue'")).rows[0]
  assert.deepEqual(state, { lease_token: null, lease_expires_at: null, last_outcome: 'succeeded', last_result_json: '{"evaluatedCount":100}', progress_cursor: cursor, succeeded: true })
  const run = (await pg.query<Record<string, unknown>>("SELECT job_name, outcome, result_json, lease_token, finished_at >= started_at AS ordered FROM scheduled_job_runs")).rows
  assert.deepEqual(run, [{ job_name: 'circulation-overdue', outcome: 'succeeded', result_json: '{"evaluatedCount":100}', lease_token: tokenA, ordered: true }])
  await repository.claim('circulation-overdue', tokenB)
  await repository.finish('circulation-overdue', tokenB, { outcome: 'succeeded', result: {} })
  assert.equal((await pg.query<{ progress_cursor: string }>("SELECT progress_cursor FROM scheduled_job_state WHERE job_name='circulation-overdue'")).rows[0].progress_cursor, cursor, 'cursor kept when not set')
})

test('failure keeps the cursor and alerts the Admin only when a failure starts or its code changes', async () => {
  const { pg, pool } = await createJobTestDatabase()
  const repository = createJobRunnerRepository(pool)
  await pg.exec(`UPDATE scheduled_job_state SET progress_cursor='{"dueAt":"2026-11-10 08:59:00","transactionId":7}' WHERE job_name='circulation-overdue'`)
  const fail = async (token: string, code: string) => {
    const claim = await repository.claim('circulation-overdue', token)
    assert.ok(claim)
    const alert = claim.previousOutcome !== 'failed' || claim.previousErrorCode !== code
    return repository.finish('circulation-overdue', token, { outcome: 'failed', errorCode: code, errorMessage: 'Scan failed.', alert })
  }
  await fail(tokenA, 'SERVICE_ERROR')
  await fail(tokenB, 'SERVICE_ERROR')
  await fail(tokenA, 'ECONNREFUSED')
  const state = (await pg.query<Record<string, unknown>>("SELECT last_outcome, last_error_code, last_error_message, progress_cursor, last_failure_at IS NOT NULL AS failed, last_success_at FROM scheduled_job_state WHERE job_name='circulation-overdue'")).rows[0]
  assert.deepEqual(state, { last_outcome: 'failed', last_error_code: 'ECONNREFUSED', last_error_message: 'Scan failed.', progress_cursor: '{"dueAt":"2026-11-10 08:59:00","transactionId":7}', failed: true, last_success_at: null })
  const alerts = (await pg.query<{ event_type: string; message_body: string }>('SELECT event_type, message_body FROM admin_notifications ORDER BY admin_notification_id')).rows
  assert.equal(alerts.length, 2)
  assert.equal(alerts[0].event_type, 'scheduled_job_failed')
  assert.match(alerts[0].message_body, /circulation-overdue.*SERVICE_ERROR/)
  assert.equal((await pg.query("SELECT 1 FROM scheduled_job_runs WHERE outcome='failed'")).rows.length, 3)
})

test('a skipped run is recorded without touching the job state', async () => {
  const { pg, pool } = await createJobTestDatabase()
  const repository = createJobRunnerRepository(pool)
  await repository.claim('notifications', tokenA)
  await repository.finish('notifications', tokenA, { outcome: 'failed', errorCode: 'SERVICE_ERROR', errorMessage: 'x', alert: false })
  await repository.claim('notifications', tokenB)
  await repository.recordSkipped('notifications')
  assert.equal((await pg.query<{ last_outcome: string }>("SELECT last_outcome FROM scheduled_job_state WHERE job_name='notifications'")).rows[0].last_outcome, 'failed')
  assert.deepEqual((await pg.query("SELECT outcome, lease_token FROM scheduled_job_runs ORDER BY run_id")).rows.map((row) => (row as { outcome: string }).outcome), ['failed', 'skipped'])
})

test('prune deletes only this job\'s runs older than 30 days, at most 1000 at a time', async () => {
  const { pg, pool } = await createJobTestDatabase()
  await pg.exec(`INSERT INTO scheduled_job_runs (job_name, started_at, finished_at, outcome)
    SELECT 'notifications', NOW() - INTERVAL '31 days', NOW() - INTERVAL '31 days', 'succeeded' FROM generate_series(1, 1002);
    INSERT INTO scheduled_job_runs (job_name, started_at, finished_at, outcome) VALUES
      ('notifications', NOW() - INTERVAL '29 days', NOW(), 'succeeded'), ('circulation-overdue', NOW() - INTERVAL '40 days', NOW(), 'succeeded')`)
  const repository = createJobRunnerRepository(pool)
  assert.equal(await repository.prune('notifications'), 1000)
  assert.equal(await repository.prune('notifications'), 2)
  const left = (await pg.query<{ job_name: string; n: number }>('SELECT job_name, COUNT(*)::int AS n FROM scheduled_job_runs GROUP BY job_name ORDER BY job_name')).rows
  assert.deepEqual(left, [{ job_name: 'circulation-overdue', n: 1 }, { job_name: 'notifications', n: 1 }])
})

test('status lists every allowlisted job with health inputs and its last 20 runs', async () => {
  const { pg, pool } = await createJobTestDatabase()
  const repository = createJobRunnerRepository(pool)
  for (let i = 0; i < 22; i += 1) {
    const token = `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`
    await repository.claim('notifications', token)
    await repository.finish('notifications', token, { outcome: 'succeeded', result: { inserted: i } })
  }
  const { now, jobs, runs } = await repository.status(['notifications', 'book-request-emails'])
  assert.ok(now instanceof Date)
  assert.deepEqual(jobs.map((job) => job.jobName), ['notifications', 'book-request-emails'])
  assert.ok(jobs[0].lastSuccessAt instanceof Date)
  assert.ok(Math.abs(jobs[0].lastSuccessAt!.getTime() - now.getTime()) < 60_000, 'timestamps read back as UTC instants')
  assert.equal(jobs[1].lastOutcome, null, 'a job that never ran still appears')
  assert.equal(runs.filter((run) => run.jobName === 'notifications').length, 20)
  assert.equal(runs[0].result?.inserted, 21)
  await pg.close()
})

test('a lease taken over between the history insert and the state update writes nothing', async () => {
  const { pg, pool } = await createJobTestDatabase()
  const connection = await pool.getConnection()
  const racing = {
    ...pool,
    getConnection: async () => ({
      ...connection,
      async execute(sql: string, values: unknown[]) {
        const result = await connection.execute(sql, values)
        // Simulates another runner reclaiming the lease right after the run row is inserted.
        if (sql.includes('INSERT INTO scheduled_job_runs')) await pg.query("UPDATE scheduled_job_state SET lease_token = $1 WHERE job_name = 'notifications'", [tokenB])
        return result
      },
    }),
  } as typeof pool
  const repository = createJobRunnerRepository(racing)
  await repository.claim('notifications', tokenA)
  assert.equal(await repository.finish('notifications', tokenA, { outcome: 'failed', errorCode: 'SERVICE_ERROR', errorMessage: 'x', alert: true }), false)
  assert.equal((await pg.query('SELECT 1 FROM scheduled_job_runs')).rows.length, 0)
  assert.equal((await pg.query('SELECT 1 FROM admin_notifications')).rows.length, 0)
})

test('the run history locks the job row it reads, so a concurrent claim waits', async () => {
  const statements: string[] = []
  const connection = { beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {}, async execute(sql: string) { statements.push(sql); return [{ affectedRows: 1 }] } }
  const repository = createJobRunnerRepository({ getConnection: async () => connection } as never)
  await repository.finish('notifications', tokenA, { outcome: 'succeeded', result: {} })
  assert.match(statements[0], /FROM scheduled_job_state WHERE job_name = \? AND lease_token = \?\s+FOR UPDATE/)
})

test('the status window keeps 20 real runs even after many skipped ones', async () => {
  const { pg, pool } = await createJobTestDatabase()
  const repository = createJobRunnerRepository(pool)
  await repository.claim('notifications', tokenA)
  await repository.finish('notifications', tokenA, { outcome: 'succeeded', result: { inserted: 1 } })
  for (let i = 0; i < 25; i += 1) await repository.recordSkipped('notifications')
  const { runs } = await repository.status(['notifications'])
  assert.deepEqual(runs.map((run) => run.outcome), ['succeeded'])
  await pg.close()
})

test('a real timestamp column round-trips through the overdue cursor', async () => {
  const { pg } = await createJobTestDatabase()
  const { rows } = await pg.query<{ key: string }>("SELECT '2026-11-10 08:59:00.123456'::timestamp::text AS key")
  const { parseOverdueCursor } = await import('./job-runner.rules.ts')
  assert.deepEqual(parseOverdueCursor(JSON.stringify({ dueAt: rows[0].key, transactionId: 4 })), { dueAt: '2026-11-10 08:59:00.123456', transactionId: 4 })
  await pg.close()
})
