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

async function setup() {
  const { pg, pool, connection } = await createAuthTestDatabase()
  const service = createMobileRefreshService(pool, () => t0)
  const app = express()
  app.use(express.json())
  app.post('/refresh', createRefreshHandler(service))
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) return void res.status(error.status).json({ success: false, code: error.code, message: error.message })
    res.status(500).json({ success: false })
  })
  return { pg, connection, service, app }
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
