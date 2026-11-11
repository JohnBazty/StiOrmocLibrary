import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { HttpError } from '../../core/http-error.ts'
import { ACCESS_COOKIE, csrfTokenFor } from './jwt-auth.middleware.ts'
import { jwtAuthRouter, sendLogin } from './jwt-auth.routes.ts'
import { signSessionToken } from './login-security.service.ts'
import { createPasswordChangeService } from './password-change.service.ts'
import { adminUsersV1Router } from '../users/users.routes.ts'
import { usersRepository } from '../users/users.repository.ts'

const sessionId = '11111111-2222-4333-8444-555555555555'

test('sign-in puts the JWT in an httpOnly cookie and returns only public claims and the CSRF token', async () => {
  const token = signSessionToken({ accountId: 6, schoolId: 'FAC-0006', role: 'Faculty', authVersion: 2, sessionId }, 600)
  const app = express()
  app.post('/login', (req, res) => sendLogin(req, res, { token, tokenType: 'Bearer', expiresIn: 600, redirect: '/faculty/dashboard', user: { id: 6 }, mustChangePassword: true }))
  const response = await request(app).post('/login')
  const cookie = String(response.headers['set-cookie'])
  assert.match(cookie, new RegExp(`^${ACCESS_COOKIE}=${token.replace(/\./g, '\\.')};`))
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Lax/)
  assert.match(cookie, /Path=\//)
  assert.match(cookie, /Max-Age=600/)
  assert.equal(JSON.stringify(response.body).includes(token), false)
  assert.equal(response.body.data.token, undefined)
  assert.equal(response.body.data.tokenType, undefined)
  assert.equal(response.body.data.session.sessionId, sessionId)
  assert.equal(response.body.data.session.role, 'Faculty')
  assert.equal(response.body.data.csrfToken, csrfTokenFor(sessionId))
  assert.equal(response.body.data.mustChangePassword, true)
})

test('a code or device-switch reply without a token sets no cookie', async () => {
  const app = express()
  app.post('/login', (req, res) => sendLogin(req, res, { otpRequired: true, challengeId: 'x' }))
  const response = await request(app).post('/login')
  assert.equal(response.headers['set-cookie'], undefined)
  assert.equal(response.body.data.otpRequired, true)
})

test('sign-in refuses a cross-site form post, whose reply would set the cookie (login CSRF)', async () => {
  const app = express()
  app.use(express.json(), express.urlencoded({ extended: false }))
  app.use('/api/v1/auth', jwtAuthRouter)
  app.use((error: HttpError, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(error.status ?? 500).json({ code: error.code }) })
  for (const path of ['/api/v1/auth/login', '/api/v1/auth/login/verify']) {
    const response = await request(app).post(path).set('Origin', 'https://attacker.example').set('Sec-Fetch-Site', 'cross-site').type('form').send({ school_id: 'X', password: 'y' })
    assert.equal(response.status, 403, path)
    assert.equal(response.body.code, 'DEVICE_ORIGIN')
  }
})

function adminApp(role: string) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => { res.locals.authenticatedUser = { accountId: 2, role }; next() })
  app.use('/api/v1/admin/users', adminUsersV1Router)
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = error instanceof HttpError ? error.status : 500
    res.status(status).json({ success: false, code: (error as HttpError).code })
  })
  return app
}

test('Admin unlock and temporary-password routes pass the actor and reason, and the password reply is not cached', async t => {
  const calls: unknown[][] = []
  t.mock.method(usersRepository, 'unlockSignIn', async (...args: unknown[]) => { calls.push(['unlock', ...args]); return { id: 9, unlocked: true } })
  t.mock.method(usersRepository, 'setTemporaryPassword', async (...args: unknown[]) => { calls.push(['temporary', ...args]); return { id: 9, temporary_password: 'Abcdefgh23456789' } })
  const app = adminApp('Admin')
  const unlock = await request(app).post('/api/v1/admin/users/9/unlock').send({ reason: 'Locked out at the desk' })
  assert.equal(unlock.status, 200)
  assert.deepEqual(calls[0], ['unlock', '9', 2, { reason: 'Locked out at the desk' }])
  const temporary = await request(app).post('/api/v1/admin/users/9/temporary-password').send({ reason: 'No school email' })
  assert.equal(temporary.status, 200)
  assert.equal(temporary.body.data.temporary_password, 'Abcdefgh23456789')
  assert.equal(temporary.headers['cache-control'], 'no-store')
})

test('Admin sign-in actions are refused without accounts.manage', async () => {
  const app = adminApp('Staff')
  assert.equal((await request(app).post('/api/v1/admin/users/9/unlock').send({ reason: 'Locked out at the desk' })).status, 403)
  assert.equal((await request(app).post('/api/v1/admin/users/9/temporary-password').send({ reason: 'No school email' })).status, 403)
})

function passwordDatabase(attempt = { failed_count: 0, window_started_at: new Date(), locked_until: null as Date | null }) {
  const writes: Array<{ sql: string; values: unknown[] }> = []
  let committed = false, rolledBack = false
  const execute = async (sql: string, values: unknown[] = []) => {
    writes.push({ sql, values })
    if (sql.includes('password_hash') && sql.startsWith('SELECT')) return [[{ account_id: 6, user_id: 16, password_hash: 'hash:Temporary1234567', account_status: 'Active' }]]
    if (sql.startsWith('SELECT') && sql.includes('login_attempt_windows')) return [[{ ...attempt }]]
    if (sql.startsWith('UPDATE login_attempt_windows')) Object.assign(attempt, { failed_count: values[0], locked_until: values[1], window_started_at: values[2] })
    return [{ affectedRows: 1 }]
  }
  const connection = {
    beginTransaction: async () => undefined, execute,
    commit: async () => { committed = true }, rollback: async () => { rolledBack = true }, release: () => undefined,
  }
  let compares = 0
  const hasher = { compare: async (value: string, hash: string) => { compares++; return hash === `hash:${value}` }, hash: async (value: string) => `hash:${value}` }
  return { service: createPasswordChangeService({ execute, getConnection: async () => connection } as never, hasher as never), writes, attempt, compares: () => compares, state: () => ({ committed, rolledBack }) }
}
const code = (expected: string) => (error: unknown) => error instanceof HttpError && error.code === expected

test('changing the password clears the forced change, ends every sign-in and is audited', async () => {
  const fixture = passwordDatabase()
  const result = await fixture.service.change(6, { current_password: 'Temporary1234567', new_password: 'a-new-password', confirm_password: 'a-new-password' })
  assert.equal(result.signedOut, true)
  assert.equal(fixture.state().committed, true)
  const account = fixture.writes.find(row => row.sql.startsWith('UPDATE accounts'))!
  assert.match(account.sql, /must_change_password=FALSE/)
  assert.match(account.sql, /auth_version=auth_version\+1/)
  assert.ok(account.values.includes('hash:a-new-password'))
  assert.ok(fixture.writes.some(row => row.sql.startsWith('UPDATE users SET password_hash=?,auth_version=auth_version+1')))
  assert.ok(fixture.writes.some(row => row.sql.startsWith('UPDATE library_login_sessions SET revoked_at')))
  assert.ok(fixture.writes.some(row => row.sql.includes("'PasswordChanged'")))
  assert.ok(fixture.writes.every(row => !row.values.includes('a-new-password')))
})

test('changing the password checks the current password, the rule and that it is new', async () => {
  await assert.rejects(passwordDatabase().service.change(6, { current_password: 'wrong', new_password: 'a-new-password', confirm_password: 'a-new-password' }), code('CURRENT_PASSWORD_INCORRECT'))
  await assert.rejects(passwordDatabase().service.change(6, { current_password: 'Temporary1234567', new_password: 'Temporary1234567', confirm_password: 'Temporary1234567' }), code('PASSWORD_UNCHANGED'))
  await assert.rejects(passwordDatabase().service.change(6, { current_password: 'Temporary1234567', new_password: 'short', confirm_password: 'short' }), code('AUTH_VALIDATION_FAILED'))
  await assert.rejects(passwordDatabase().service.change(6, { current_password: 'Temporary1234567', new_password: 'a-new-password', confirm_password: 'different' }), code('AUTH_VALIDATION_FAILED'))
  await assert.rejects(passwordDatabase().service.change(6, { new_password: 'a-new-password', confirm_password: 'a-new-password' }), code('AUTH_VALIDATION_FAILED'))
  const wrong = passwordDatabase()
  await assert.rejects(wrong.service.change(6, { current_password: 'wrong', new_password: 'a-new-password', confirm_password: 'a-new-password' }))
  assert.equal(wrong.state().committed, true)
  assert.equal(wrong.attempt.failed_count, 1)
  assert.equal(wrong.writes.some(row => row.sql.startsWith('UPDATE accounts')), false)
})

test('five wrong current passwords pause password changes for 15 minutes', async () => {
  const fixture = passwordDatabase()
  const wrong = { current_password: 'wrong', new_password: 'a-new-password', confirm_password: 'a-new-password' }
  for (let index = 0; index < 4; index++) await assert.rejects(fixture.service.change(6, wrong), code('CURRENT_PASSWORD_INCORRECT'))
  await assert.rejects(fixture.service.change(6, wrong), code('PASSWORD_CHANGE_PAUSED'))
  assert.ok(new Date(fixture.attempt.locked_until!).getTime() > Date.now() + 14 * 60_000)
  const before = fixture.compares()
  await assert.rejects(fixture.service.change(6, { ...wrong, current_password: 'Temporary1234567' }), code('PASSWORD_CHANGE_PAUSED'))
  assert.equal(fixture.compares(), before)
})

test('the password row is locked after the attempt row, and bcrypt runs before either lock', async () => {
  const fixture = passwordDatabase()
  await fixture.service.change(6, { current_password: 'Temporary1234567', new_password: 'a-new-password', confirm_password: 'a-new-password' })
  const order = fixture.writes.map(row => row.sql)
  const attempt = order.findIndex(sql => sql.includes('login_attempt_windows') && sql.includes('FOR UPDATE'))
  const account = order.findIndex(sql => sql.includes('FROM accounts') && sql.includes('FOR UPDATE'))
  assert.ok(attempt >= 0 && attempt < account)
  assert.ok(fixture.writes.some(row => row.sql.startsWith('DELETE FROM login_attempt_windows')))
})
