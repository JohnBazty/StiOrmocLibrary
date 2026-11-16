import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'
import express from 'express'
import type { RequestHandler } from 'express'
import request from 'supertest'
import { loginLimiters, otpLimiters, refreshLimiters } from './jwt-auth.routes.ts'

const previous = process.env.MOBILE_REFRESH_ENABLED
afterEach(() => { if (previous === undefined) delete process.env.MOBILE_REFRESH_ENABLED; else process.env.MOBILE_REFRESH_ENABLED = previous })

/** Mounts the chain on each path; ?fail=1 makes the handler answer 401, otherwise 200. */
function appWith(limiters: RequestHandler[], ...paths: string[]) {
  const app = express()
  for (const path of paths) app.post(path, ...limiters, (req, res) => void res.status(req.query.fail ? 401 : 200).json({}))
  return app
}
const hit = (app: express.Express, path: string, fail: boolean) => request(app).post(path + (fail ? '?fail=1' : ''))
async function repeat(app: express.Express, path: string, count: number, fail: boolean) {
  for (let i = 0; i < count; i++) assert.notEqual((await hit(app, path, fail)).status, 429, `request ${i + 1} should pass`)
}

test('refresh: the 21st failure from one IP answers 429 REFRESH_RATE_LIMITED, successes never count', async () => {
  const app = appWith(refreshLimiters(), '/r')
  await repeat(app, '/r', 50, false)
  await repeat(app, '/r', 20, true)
  const res = await hit(app, '/r', true)
  assert.equal(res.status, 429)
  assert.equal(res.body.code, 'REFRESH_RATE_LIMITED')
})

test('flag on: sign-in allows 60 failures, the 61st answers 429 TOO_MANY_LOGIN_ATTEMPTS, successes do not count', async () => {
  process.env.MOBILE_REFRESH_ENABLED = 'true'
  const app = appWith(loginLimiters(), '/login')
  await repeat(app, '/login', 61, false)
  await repeat(app, '/login', 60, true)
  const res = await hit(app, '/login', true)
  assert.equal(res.status, 429)
  assert.equal(res.body.code, 'TOO_MANY_LOGIN_ATTEMPTS')
})

test('flag on: verify and resend allow 30 failures, the 31st answers 429 TOO_MANY_LOGIN_ATTEMPTS', async () => {
  process.env.MOBILE_REFRESH_ENABLED = 'true'
  const app = appWith(otpLimiters(), '/login/verify')
  await repeat(app, '/login/verify', 30, true)
  const res = await hit(app, '/login/verify', true)
  assert.equal(res.status, 429)
  assert.equal(res.body.code, 'TOO_MANY_LOGIN_ATTEMPTS')
})

test('flag unset: /login keeps origin/main (60 requests, successes count, default 429 reply)', async () => {
  delete process.env.MOBILE_REFRESH_ENABLED
  const app = appWith(loginLimiters(), '/login')
  await repeat(app, '/login', 60, false)
  const res = await hit(app, '/login', false)
  assert.equal(res.status, 429)
  assert.equal(res.body.code, undefined)
})

test('flag unset: one otpLimiters() chain on two paths shares one 30-request counter', async () => {
  delete process.env.MOBILE_REFRESH_ENABLED
  const app = appWith(otpLimiters(), '/login/verify', '/login/resend')
  await repeat(app, '/login/verify', 15, false)
  await repeat(app, '/login/resend', 15, false)
  assert.equal((await hit(app, '/login/verify', false)).status, 429)
  assert.equal((await hit(app, '/login/resend', false)).status, 429)
})

test('the flag is read per request, so one chain follows it live', async () => {
  const app = appWith(otpLimiters(), '/login/verify')
  delete process.env.MOBILE_REFRESH_ENABLED
  await repeat(app, '/login/verify', 30, false)
  assert.equal((await hit(app, '/login/verify', false)).status, 429)
  process.env.MOBILE_REFRESH_ENABLED = 'true'
  assert.equal((await hit(app, '/login/verify', false)).status, 200)
})
