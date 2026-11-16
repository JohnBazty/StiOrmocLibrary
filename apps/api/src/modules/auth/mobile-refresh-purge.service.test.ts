import assert from 'node:assert/strict'
import test from 'node:test'
import { createJobHandlers } from '../job-runner/job-runner.jobs.ts'
import { createAuthTestDatabase, seedMobileSession } from './auth-pglite.test.helper.ts'
import { MOBILE_REFRESH_MS } from './login-device-policy.ts'
import { createMobileRefreshService } from './mobile-refresh.service.ts'
import { purgeMobileRefreshTokens, REVOKED_FAMILY_KEEP_MS } from './mobile-refresh-purge.service.ts'

const DAY = 24 * 60 * 60_000
const now = new Date('2026-03-01T00:00:00Z')
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs)

let counter = 0
/** One token row; the hash is a stand-in, the purge never looks at it. */
async function row(pg: Awaited<ReturnType<typeof createAuthTestDatabase>>['pg'], session: { sessionId: string; accountId: number; authVersion: number }, expiresAt: Date, rotated = false) {
  const hash = `purge-test-${++counter}`
  await pg.query('INSERT INTO mobile_refresh_tokens(token_hash,session_id,account_id,auth_version,expires_at,rotated_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [hash, session.sessionId, session.accountId, session.authVersion, expiresAt, rotated ? now : null])
  return hash
}
const remaining = async (pg: Awaited<ReturnType<typeof createAuthTestDatabase>>['pg']) =>
  new Set((await pg.query<{ token_hash: string }>('SELECT token_hash FROM mobile_refresh_tokens')).rows.map(r => r.token_hash))

test('deletes expired families and long-revoked sessions, keeps every row of a live family including rotated ones', async () => {
  const { pg, pool } = await createAuthTestDatabase()
  const live = await seedMobileSession(pg), expired = await seedMobileSession(pg)
  const revokedOld = await seedMobileSession(pg), revokedRecent = await seedMobileSession(pg)
  await pg.query('UPDATE library_login_sessions SET revoked_at=$1 WHERE session_id=$2', [at(-REVOKED_FAMILY_KEEP_MS - DAY), revokedOld.sessionId])
  await pg.query('UPDATE library_login_sessions SET revoked_at=$1 WHERE session_id=$2', [at(-DAY), revokedRecent.sessionId])
  const alive = at(MOBILE_REFRESH_MS)

  const keep = [await row(pg, live, alive, true), await row(pg, live, alive), await row(pg, revokedRecent, alive, true)]
  const gone = [await row(pg, expired, at(-1), true), await row(pg, expired, at(-1)), await row(pg, revokedOld, alive, true), await row(pg, revokedOld, alive)]

  assert.deepEqual(await purgeMobileRefreshTokens(pool, now), { deleted: gone.length })
  assert.deepEqual([...await remaining(pg)].sort(), keep.sort())
  assert.deepEqual(await purgeMobileRefreshTokens(pool, now), { deleted: 0 }, 'a second run finds nothing')
})

test('one run deletes in small batches and stops at the batch cap, the next run continues', async () => {
  const { pg, pool } = await createAuthTestDatabase()
  const session = await seedMobileSession(pg)
  for (let i = 0; i < 5; i++) await row(pg, session, at(-DAY))
  assert.deepEqual(await purgeMobileRefreshTokens(pool, now, { batchSize: 2, maxBatches: 2 }), { deleted: 4 })
  assert.equal((await remaining(pg)).size, 1)
  assert.deepEqual(await purgeMobileRefreshTokens(pool, now, { batchSize: 2, maxBatches: 2 }), { deleted: 1 })
})

test('purging does not turn reuse detection off: a rotated token of a live family is still reuse', async () => {
  process.env.MOBILE_REFRESH_ENABLED = 'true'
  const { pg, pool, connection } = await createAuthTestDatabase()
  const clock = { now: now.getTime() }
  const service = createMobileRefreshService(pool, () => clock.now, undefined, 0)
  const session = await seedMobileSession(pg)
  const first = await service.issue(connection, { ...session, expiresAt: at(MOBILE_REFRESH_MS) })
  await service.refresh(first.refreshToken)
  clock.now += DAY
  await purgeMobileRefreshTokens(pool, new Date(clock.now))
  assert.equal((await remaining(pg)).size, 2, 'both rows of the live family survive the purge')
  await assert.rejects(service.refresh(first.refreshToken), { code: 'REFRESH_TOKEN_REUSED' })
})

test('the job handler purges with the passed-in clock when MOBILE_REFRESH_ENABLED is on', async () => {
  process.env.MOBILE_REFRESH_ENABLED = 'true'
  const { pg, pool } = await createAuthTestDatabase()
  const session = await seedMobileSession(pg)
  await row(pg, session, at(-1))
  const output = await createJobHandlers(pool, () => now)['mobile-refresh-purge']({ cursor: null })
  assert.deepEqual(output, { result: { deleted: 1 } })
})

test('the job is a no-op, and never touches the database, when MOBILE_REFRESH_ENABLED is off', async () => {
  process.env.MOBILE_REFRESH_ENABLED = 'false'
  const { pg, pool } = await createAuthTestDatabase()
  const session = await seedMobileSession(pg)
  await row(pg, session, at(-1))
  const output = await createJobHandlers(pool, () => now)['mobile-refresh-purge']({ cursor: null })
  assert.deepEqual(output, { result: { deleted: 0, enabled: false } })
  assert.equal((await remaining(pg)).size, 1)
})

test('with the flag on but migration 039 missing, the job reports no table and deletes nothing', async () => {
  process.env.MOBILE_REFRESH_ENABLED = 'true'
  const { pool } = await createAuthTestDatabase({ mobileMigration: false })
  const output = await createJobHandlers(pool, () => now)['mobile-refresh-purge']({ cursor: null })
  assert.deepEqual(output, { result: { deleted: 0, tableMissing: true } })
})
