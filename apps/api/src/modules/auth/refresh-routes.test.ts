import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { HttpError } from '../../core/http-error.ts'
import { createAuthTestDatabase, seedMobileSession } from './auth-pglite.test.helper.ts'
import { createRefreshHandler, createRevokeHandler } from './jwt-auth.routes.ts'
import { MOBILE_REFRESH_MS } from './login-device-policy.ts'
import { createMobileRefreshService } from './mobile-refresh.service.ts'

const t0 = Date.parse('2026-01-05T00:00:00Z')

async function setup() {
  process.env.MOBILE_REFRESH_ENABLED = 'true'
  const { pg, pool, connection } = await createAuthTestDatabase()
  const service = createMobileRefreshService(pool, () => t0, undefined, 0)
  const app = express()
  app.use(express.json())
  app.post('/refresh', createRefreshHandler(service))
  app.post('/refresh/revoke', createRevokeHandler(service))
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) return void res.status(error.status).json({ success: false, code: error.code, message: error.message })
    res.status(500).json({ success: false })
  })
  const session = await seedMobileSession(pg)
  const first = (await service.issue(connection, { ...session, expiresAt: new Date(t0 + MOBILE_REFRESH_MS) })).refreshToken
  const revokedAt = async () => (await pg.query<{ revoked_at: unknown }>('SELECT revoked_at FROM library_login_sessions WHERE session_id=$1', [session.sessionId])).rows[0].revoked_at
  return { app, first, revokedAt }
}

test('revoke with the current token signs the session out and the next refresh answers 401', async () => {
  const { app, first, revokedAt } = await setup()
  const rotated = (await request(app).post('/refresh').send({ refresh_token: first })).body.data.refreshToken
  const res = await request(app).post('/refresh/revoke').send({ refresh_token: rotated })
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { success: true, data: { signedOut: true } })
  assert.notEqual(await revokedAt(), null)
  assert.equal((await request(app).post('/refresh').send({ refresh_token: rotated })).status, 401)
})

test('revoke with an older rotated token of the family also signs the family out', async () => {
  const { app, first, revokedAt } = await setup()
  const rotated = (await request(app).post('/refresh').send({ refresh_token: first })).body.data.refreshToken
  assert.equal((await request(app).post('/refresh/revoke').send({ refresh_token: first })).status, 200)
  assert.notEqual(await revokedAt(), null)
  assert.equal((await request(app).post('/refresh').send({ refresh_token: rotated })).status, 401)
})

test('unknown, malformed and missing tokens answer the same 200 and revoke nothing', async () => {
  const { app, revokedAt } = await setup()
  for (const body of [{ refresh_token: 'x'.repeat(43) }, { refresh_token: 'short' }, undefined]) {
    const res = await request(app).post('/refresh/revoke').send(body)
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { success: true, data: { signedOut: true } })
  }
  assert.equal(await revokedAt(), null)
})

test('an expired Authorization header does not stop the revoke', async () => {
  const { app, first, revokedAt } = await setup()
  const res = await request(app).post('/refresh/revoke').set('Authorization', 'Bearer expired.jwt.value').send({ refresh_token: first })
  assert.equal(res.status, 200)
  assert.notEqual(await revokedAt(), null)
})
