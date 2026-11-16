import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { HttpError } from '../../core/http-error.ts'
import { createAuthTestDatabase, seedMobileSession } from './auth-pglite.test.helper.ts'
import { verifyAccessToken } from './jwt-auth.middleware.ts'
import { createRefreshHandler } from './jwt-auth.routes.ts'
import { MOBILE_REFRESH_MS, deviceTokenHash } from './login-device-policy.ts'
import { createMobileRefreshService } from './mobile-refresh.service.ts'

const t0 = Date.parse('2026-01-05T00:00:00Z') // months before the database clock: SQL NOW() use would break the assertions

const DAY = 24 * 60 * 60_000

async function setup(options: { graceMs?: number; semesterEnded?: () => Promise<boolean> } = {}) {
  const { pg, pool, connection } = await createAuthTestDatabase()
  const clock = { now: t0 }
  let queries = 0
  const counting = new Proxy(pool, { get: (target, key) => (key === 'getConnection' || key === 'execute' || key === 'query' ? (...args: unknown[]) => { queries++; return (target as any)[key](...args) } : (target as any)[key]) }) as typeof pool
  const service = createMobileRefreshService(counting, () => clock.now, options.semesterEnded, options.graceMs)
  const app = express()
  app.use(express.json())
  app.post('/refresh', createRefreshHandler(service))
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) return void res.status(error.status).json({ success: false, code: error.code, message: error.message })
    res.status(500).json({ success: false })
  })
  return { pg, connection, service, app, clock, queryCount: () => queries }
}

test('refresh rotates one token, keeps the family deadline and mints a working access token', async () => {
  process.env.MOBILE_REFRESH_ENABLED = 'true'
  const { pg, connection, service, app } = await setup()
  const session = await seedMobileSession(pg)
  const deadline = new Date(t0 + MOBILE_REFRESH_MS)
  const first = await service.issue(connection, { accountId: session.accountId, authVersion: session.authVersion, sessionId: session.sessionId, expiresAt: deadline })

  const res = await request(app).post('/refresh').send({ refresh_token: first.refreshToken })
  assert.equal(res.status, 200)
  const data = res.body.data
  assert.equal(data.tokenType, 'Bearer')
  assert.ok(data.expiresIn > 0 && data.expiresIn <= 900)
  assert.equal(data.refreshToken.length, 43)
  assert.notEqual(data.refreshToken, first.refreshToken)
  assert.equal(data.refreshExpiresAt, deadline.toISOString())

  const claims = verifyAccessToken(data.token)
  assert.deepEqual([claims.accountId, claims.role, claims.authVersion, claims.sessionId], [session.accountId, 'Student', session.authVersion, session.sessionId])

  const { rows } = await pg.query<Record<string, unknown>>('SELECT * FROM mobile_refresh_tokens ORDER BY issued_at, token_hash')
  assert.equal(rows.length, 2)
  const oldRow = rows.find(r => r.token_hash === deviceTokenHash('refresh', first.refreshToken))!
  const newRow = rows.find(r => r.token_hash === deviceTokenHash('refresh', data.refreshToken))!
  assert.equal(new Date(oldRow.rotated_at as string).getTime(), t0)
  assert.equal(oldRow.replaced_by, newRow.token_hash)
  assert.equal(new Date(oldRow.expires_at as string).getTime(), deadline.getTime())
  assert.equal(new Date(newRow.expires_at as string).getTime(), deadline.getTime())
  assert.equal(newRow.rotated_at, null)
  for (const token of [first.refreshToken, data.refreshToken]) {
    for (const value of rows.flatMap(r => Object.values(r))) assert.notEqual(value, token)
  }
})

test('with the flag unset the route answers 404 REFRESH_DISABLED and touches no table', async () => {
  delete process.env.MOBILE_REFRESH_ENABLED
  const { pg, app } = await setup()
  const res = await request(app).post('/refresh').send({ refresh_token: 'x'.repeat(43) })
  assert.equal(res.status, 404)
  assert.equal(res.body.code, 'REFRESH_DISABLED')
  const { rows } = await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM mobile_refresh_tokens')
  assert.equal(rows[0].n, 0)
})

async function signedIn(options: Parameters<typeof setup>[0] = {}) {
  process.env.MOBILE_REFRESH_ENABLED = 'true'
  const ctx = await setup(options)
  const session = await seedMobileSession(ctx.pg)
  const deadline = new Date(t0 + MOBILE_REFRESH_MS)
  const first = await ctx.service.issue(ctx.connection, { accountId: session.accountId, authVersion: session.authVersion, sessionId: session.sessionId, expiresAt: deadline })
  return { ...ctx, session, deadline, first: first.refreshToken }
}
const code = (expected: string) => (error: unknown) => error instanceof HttpError && error.status === 401 && error.code === expected
const revokedAt = async (pg: Awaited<ReturnType<typeof setup>>['pg'], sessionId: string) =>
  (await pg.query<{ revoked_at: unknown }>('SELECT revoked_at FROM library_login_sessions WHERE session_id=$1', [sessionId])).rows[0].revoked_at

test('reusing a rotated token answers REUSED, the revoke commits, and the newest token dies too', async () => {
  const { pg, service, session, first } = await signedIn({ graceMs: 0 })
  const second = await service.refresh(first)
  await assert.rejects(service.refresh(first), code('REFRESH_TOKEN_REUSED'))
  assert.notEqual(await revokedAt(pg, session.sessionId), null) // read outside the failed call: the revoke survived the error
  await assert.rejects(service.refresh(second.refreshToken), code('REFRESH_TOKEN_INVALID'))
})

test('with grace 0 a predecessor re-presented 1 s later is still reuse', async () => {
  const { service, clock, first } = await signedIn({ graceMs: 0 })
  await service.refresh(first)
  clock.now += 1000
  await assert.rejects(service.refresh(first), code('REFRESH_TOKEN_REUSED'))
})

test('inside the grace window the predecessor mints a fresh pair and the unused successor dies', async () => {
  const { pg, service, clock, session, first } = await signedIn({ graceMs: 10_000 })
  const lost = await service.refresh(first) // reply never reached the phone
  clock.now += 5000
  const retry = await service.refresh(first)
  assert.equal(retry.refreshToken.length, 43)
  assert.equal(await revokedAt(pg, session.sessionId), null)
  await service.refresh(retry.refreshToken) // the phone's pair works
  await assert.rejects(service.refresh(lost.refreshToken), code('REFRESH_TOKEN_REUSED'))
})

test('grace does not apply after the window or once the successor was used', async () => {
  const late = await signedIn({ graceMs: 10_000 })
  await late.service.refresh(late.first)
  late.clock.now += 10_000
  await assert.rejects(late.service.refresh(late.first), code('REFRESH_TOKEN_REUSED'))

  const used = await signedIn({ graceMs: 10_000 })
  const second = await used.service.refresh(used.first)
  await used.service.refresh(second.refreshToken)
  used.clock.now += 1000
  await assert.rejects(used.service.refresh(used.first), code('REFRESH_TOKEN_REUSED'))
})

test('the family deadline never slides over 29 days of rotations and expires at 30 days', async () => {
  const { pg, service, clock, deadline, first } = await signedIn()
  let token = first
  for (const at of [DAY, 29 * DAY]) {
    clock.now = t0 + at
    token = (await service.refresh(token)).refreshToken
  }
  const { rows } = await pg.query<{ expires_at: string }>('SELECT expires_at FROM mobile_refresh_tokens')
  assert.equal(rows.length, 3)
  for (const r of rows) assert.equal(new Date(r.expires_at).getTime(), deadline.getTime())

  clock.now = t0 + 30 * DAY - 1000
  const last = await service.refresh(token)
  assert.equal(last.expiresIn, 1)
  clock.now = t0 + 30 * DAY + 1000
  await assert.rejects(service.refresh(last.refreshToken), code('REFRESH_TOKEN_EXPIRED'))
})

test('an auth_version bump, an inactive account or user, or an ended semester stops refresh', async () => {
  const bumped = await signedIn()
  await bumped.pg.query('UPDATE accounts SET auth_version=auth_version+1 WHERE account_id=$1', [bumped.session.accountId])
  await assert.rejects(bumped.service.refresh(bumped.first), code('ACCOUNT_ACCESS_REVOKED'))

  const inactive = await signedIn()
  await inactive.pg.query("UPDATE accounts SET account_status='Inactive' WHERE account_id=$1", [inactive.session.accountId])
  await assert.rejects(inactive.service.refresh(inactive.first), code('ACCOUNT_ACCESS_REVOKED'))

  const linked = await signedIn()
  await linked.pg.query("INSERT INTO users(account_status) VALUES ('Deactivated')")
  await linked.pg.query('UPDATE accounts SET user_id=(SELECT max(user_id) FROM users) WHERE account_id=$1', [linked.session.accountId])
  await assert.rejects(linked.service.refresh(linked.first), code('ACCOUNT_ACCESS_REVOKED'))

  const ended = await signedIn({ semesterEnded: async () => true })
  await assert.rejects(ended.service.refresh(ended.first), code('ACCOUNT_ACCESS_REVOKED'))
})

test('a revoked or web session, and unknown tokens, answer REFRESH_TOKEN_INVALID', async () => {
  const revoked = await signedIn()
  await revoked.pg.query('UPDATE library_login_sessions SET revoked_at=$2 WHERE session_id=$1', [revoked.session.sessionId, new Date(t0)])
  await assert.rejects(revoked.service.refresh(revoked.first), code('REFRESH_TOKEN_INVALID'))

  const web = await signedIn()
  await web.pg.query("UPDATE library_login_sessions SET client='web' WHERE session_id=$1", [web.session.sessionId])
  await assert.rejects(web.service.refresh(web.first), code('REFRESH_TOKEN_INVALID'))

  await assert.rejects(web.service.refresh('A'.repeat(43)), code('REFRESH_TOKEN_INVALID'))
})

test('a malformed refresh token is rejected without touching the database', async () => {
  const { service, queryCount } = await signedIn()
  const before = queryCount()
  for (const bad of ['short', undefined, `${'a'.repeat(42)}.`]) await assert.rejects(service.refresh(bad), code('REFRESH_TOKEN_INVALID'))
  assert.equal(queryCount(), before)
})
