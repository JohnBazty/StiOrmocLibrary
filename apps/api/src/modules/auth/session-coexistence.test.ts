import assert from 'node:assert/strict'
import test from 'node:test'
import type { NextFunction, Request, Response } from 'express'
import { createAuthTestDatabase } from './auth-pglite.test.helper.ts'
import { createActiveJwtAccountGuard, verifyAccessToken } from './jwt-auth.middleware.ts'
import { createLoginSecurityService, type VerifiedLogin } from './login-security.service.ts'
import { createMobileRefreshService } from './mobile-refresh.service.ts'

// Anchored on the real time: the guard's origin/main predicates and jsonwebtoken's exp check run on the database and process clocks.
async function setup({ role = 'Student', mobileMigration = true } = {}) {
  const { pg, pool } = await createAuthTestDatabase({ mobileMigration })
  const { rows: [user] } = await pg.query<{ user_id: number }>("INSERT INTO users(email,full_name) VALUES ('test.person@ormoc.sti.edu.ph','Test Person') RETURNING user_id")
  const { rows: [account] } = await pg.query<{ account_id: number }>("INSERT INTO accounts(user_id,school_id,role,auth_version) VALUES ($1,'TEST0001',$2,3) RETURNING account_id", [user.user_id, role])
  const accountId = Number(account.account_id), clock = { now: Date.now() }
  const verified = async (): Promise<VerifiedLogin> => {
    const { rows: [a] } = await pg.query<{ auth_version: number }>('SELECT auth_version FROM accounts WHERE account_id=$1', [accountId])
    return { accountId, userId: Number(user.user_id), schoolId: 'TEST0001', role: role as VerifiedLogin['role'], authVersion: Number(a.auth_version), fullName: 'Test Person', email: 'test.person@ormoc.sti.edu.ph' }
  }
  const service = createLoginSecurityService(pool, verified, async () => {}, () => clock.now, () => '123456', () => true)
  const refresh = createMobileRefreshService(pool, () => clock.now)
  const version = async () => Number((await pg.query<{ auth_version: number }>('SELECT auth_version FROM accounts WHERE account_id=$1', [accountId])).rows[0].auth_version)
  const row = async (sessionId: string) => (await pg.query<Record<string, any>>('SELECT * FROM library_login_sessions WHERE session_id=$1', [sessionId])).rows[0]
  /** Password step, then the emailed code. Cookie token replaces that browser's own session without the switch gate. */
  async function signIn(extra: Record<string, unknown> = {}, browserToken?: string) {
    clock.now += 61_000 // past the one-minute code-resend wait
    const step: any = await service.login({ school_id: 'TEST0001', password: 'x', portal: 'user', ...extra }, browserToken)
    if (!step.otpRequired) return step
    return service.verify({ challenge_id: step.challengeId, code: '123456', ...(extra.client ? { client: extra.client } : {}) }, browserToken) as Promise<any>
  }
  return { pg, pool, service, refresh, clock, accountId, version, row, signIn }
}

async function guard(pool: any, token: string) {
  const user = verifyAccessToken(token)
  return new Promise<{ passed: boolean; status?: number; code?: string }>((resolve, reject) => {
    let status: number | undefined
    const response = { locals: { authenticatedUser: user }, status(s: number) { status = s; return this }, json(body: { code: string }) { resolve({ passed: false, status, code: body.code }) } }
    createActiveJwtAccountGuard(pool)({} as Request, response as unknown as Response, ((error?: unknown) => error ? reject(error) : resolve({ passed: true })) as NextFunction)
  })
}

async function withFlags<T>(flags: Record<string, string | undefined>, work: () => Promise<T>) {
  const saved = Object.fromEntries(Object.keys(flags).map(key => [key, process.env[key]]))
  for (const [key, value] of Object.entries(flags)) value === undefined ? delete process.env[key] : (process.env[key] = value)
  try { return await work() } finally { for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : (process.env[key] = value) }
}
const ON = { MOBILE_REFRESH_ENABLED: 'true', LOGIN_DEVICES_ENABLED: 'true' }

test('a phone sign-in issues a refresh token and a later web sign-in leaves the phone alive (D-14)', () => withFlags(ON, async () => {
  const { pool, pg, refresh, signIn, row, version } = await setup()
  const phone = await signIn({ client: 'mobile' })
  assert.equal(phone.otpRequired, undefined)
  assert.ok(phone.refreshToken?.length === 43 && phone.deviceCookie.token)
  assert.ok(phone.expiresIn > 0 && phone.expiresIn <= 900)
  assert.equal(verifyAccessToken(phone.token).deviceSession, undefined)
  const phoneRow = await row(phone.deviceCookie.sessionId)
  assert.equal(phoneRow.client, 'mobile')
  const { rows: [family] } = await pg.query<{ expires_at: string }>('SELECT expires_at FROM mobile_refresh_tokens WHERE session_id=$1', [phone.deviceCookie.sessionId])
  // One deadline instant: remembered_until, the first token row and the reply agree.
  assert.equal(new Date(phoneRow.remembered_until).getTime(), new Date(family.expires_at).getTime())
  assert.equal(new Date(phoneRow.remembered_until).getTime(), Date.parse(phone.refreshExpiresAt))
  assert.equal(await version(), 3)

  const web = await signIn()
  assert.equal(web.deviceCookie && (await row(web.deviceCookie.sessionId)).client, 'web')
  assert.equal(await version(), 3)
  assert.equal((await row(phone.deviceCookie.sessionId)).revoked_at, null)
  assert.deepEqual(await guard(pool, phone.token), { passed: true })
  const refreshed = await refresh.refresh(phone.refreshToken)
  assert.ok(refreshed.token)
  assert.deepEqual(await guard(pool, refreshed.token), { passed: true })
}))

test('for each client a sign-in revokes only that client\'s earlier row (D-14, D-15)', () => withFlags(ON, async () => {
  const { pool, signIn, row, refresh } = await setup()
  const phoneA = await signIn({ client: 'mobile' })
  const web1 = await signIn()
  const web2 = await signIn({}, web1.deviceCookie.token)
  assert.ok((await row(web1.deviceCookie.sessionId)).revoked_at)
  assert.equal((await row(web2.deviceCookie.sessionId)).revoked_at, null)
  assert.equal((await row(phoneA.deviceCookie.sessionId)).revoked_at, null)

  const phoneB = await signIn({ client: 'mobile' })
  assert.ok((await row(phoneA.deviceCookie.sessionId)).revoked_at)
  assert.equal((await row(web2.deviceCookie.sessionId)).revoked_at, null)
  assert.deepEqual(await guard(pool, web2.token), { passed: true })
  await assert.rejects(refresh.refresh(phoneA.refreshToken), { code: 'REFRESH_TOKEN_INVALID' })
  assert.ok((await refresh.refresh(phoneB.refreshToken)).token)
}))

test('a replaced phone loses trust, also when it had signed out first (D-16)', () => withFlags(ON, async () => {
  const { pg, signIn, row, refresh } = await setup()
  const phoneA = await signIn({ client: 'mobile' })
  const web = await signIn()
  const webBefore = await row(web.deviceCookie.sessionId)
  assert.ok((await row(phoneA.deviceCookie.sessionId)).trusted_since)
  const phoneB = await signIn({ client: 'mobile' })
  const a = await row(phoneA.deviceCookie.sessionId), b = await row(phoneB.deviceCookie.sessionId)
  assert.ok(a.revoked_at); assert.equal(a.trusted_since, null); assert.ok(b.trusted_since)
  assert.deepEqual(await row(web.deviceCookie.sessionId), webBefore)

  assert.equal(await refresh.revoke(phoneB.refreshToken), true) // B signs out, so no phone session is live
  const phoneC = await signIn({ client: 'mobile' })
  const { rows } = await pg.query('SELECT session_id FROM library_login_sessions WHERE client=\'mobile\' AND trusted_since IS NOT NULL')
  assert.deepEqual(rows.map((r: any) => r.session_id), [phoneC.deviceCookie.sessionId])
  assert.equal((await row(phoneB.deviceCookie.sessionId)).trusted_since, null)
}))

test('the guard has no idle end for a phone but still ends an idle web session at 10 minutes (D-02)', () => withFlags(ON, async () => {
  const { pool, pg, signIn } = await setup()
  const phone = await signIn({ client: 'mobile' })
  const web = await signIn()
  await pg.query("UPDATE library_login_sessions SET last_activity_at=NOW()-INTERVAL '1 hour' WHERE client='mobile'")
  assert.deepEqual(await guard(pool, phone.token), { passed: true })
  await pg.query("UPDATE library_login_sessions SET last_activity_at=NOW()-INTERVAL '11 minutes' WHERE client='web'")
  assert.deepEqual(await guard(pool, web.token), { passed: false, status: 401, code: 'SESSION_EXPIRED' })
}))

test('a phone device cookie cannot resume a session (T-07-25)', () => withFlags(ON, async () => {
  const { service, signIn } = await setup()
  const phone = await signIn({ client: 'mobile' })
  await assert.rejects(service.resumeDevice(phone.deviceCookie.token, phone.deviceCookie.sessionId), { code: 'DEVICE_EXPIRED' })
  const web = await signIn()
  assert.ok((await service.resumeDevice(web.deviceCookie.token, web.deviceCookie.sessionId)).token)
}))

test('staff keep today\'s rule: the sign-in bump stays and no refresh token is issued (T-07-28)', () => withFlags(ON, async () => {
  const { service, version, row } = await setup({ role: 'Librarian' })
  const reply: any = await service.login({ school_id: 'TEST0001', password: 'x', portal: 'staff', client: 'mobile' })
  assert.equal(reply.refreshToken, undefined)
  assert.equal(await version(), 4)
  assert.equal((await row(reply.deviceCookie.sessionId)).client, 'web')
}))

test('flag off on a database without migration 039: sign-in, guard and sign-out never name the client column (dark deploy)', () => withFlags({ MOBILE_REFRESH_ENABLED: undefined, LOGIN_DEVICES_ENABLED: 'true' }, async () => {
  const { pool, service, signIn, version } = await setup({ mobileMigration: false })
  const reply = await signIn({ client: 'mobile' })
  assert.equal(reply.refreshToken, undefined)
  assert.equal(await version(), 4) // origin/main still bumps
  assert.deepEqual(await guard(pool, reply.token), { passed: true })
  assert.equal(await service.revokeDevice(reply.deviceCookie.token), true)
}))
