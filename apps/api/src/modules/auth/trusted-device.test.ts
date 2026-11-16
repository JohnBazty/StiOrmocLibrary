import assert from 'node:assert/strict'
import test from 'node:test'
import { createAuthTestDatabase } from './auth-pglite.test.helper.ts'
import { HttpError } from '../../core/http-error.ts'
import { createLoginSecurityService, trustedPhone, type VerifiedLogin } from './login-security.service.ts'
import { deviceTokenHash, makeDeviceToken } from './login-device-policy.ts'
import { createMobileRefreshService } from './mobile-refresh.service.ts'

// Synthetic identities only. The injected clock drives the service and the refresh service; PGlite NOW() stays real.
async function setup(schoolId = 'TEST0001') {
  const { pg, pool, connection } = await createAuthTestDatabase()
  const { rows: [user] } = await pg.query<{ user_id: number }>("INSERT INTO users(email,full_name) VALUES ('test.person@ormoc.sti.edu.ph','Test Person') RETURNING user_id")
  const { rows: [account] } = await pg.query<{ account_id: number }>("INSERT INTO accounts(user_id,school_id,role,auth_version) VALUES ($1,$2,'Student',3) RETURNING account_id", [user.user_id, schoolId])
  const accountId = Number(account.account_id), clock = { now: Date.now() }, mail: string[] = [], password = { right: true }
  const verified = async (): Promise<VerifiedLogin> => {
    if (!password.right) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Wrong credentials.')
    const { rows: [a] } = await pg.query<{ auth_version: number }>('SELECT auth_version FROM accounts WHERE account_id=$1', [accountId])
    return { accountId, userId: Number(user.user_id), schoolId, role: 'Student', authVersion: Number(a.auth_version), fullName: 'Test Person', email: 'test.person@ormoc.sti.edu.ph' }
  }
  const service = createLoginSecurityService(pool, verified, async (_to, code) => { mail.push(code) }, () => clock.now, () => '123456', () => true)
  const refresh = createMobileRefreshService(pool, () => clock.now)
  const count = async (table: string) => Number((await pg.query<{ n: string }>(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n)
  const row = async (sessionId: string) => (await pg.query<Record<string, any>>('SELECT * FROM library_login_sessions WHERE session_id=$1', [sessionId])).rows[0]
  /** Password then emailed code, like a new phone. */
  async function codeSignIn(extra: Record<string, unknown> = { client: 'mobile' }, cookie?: string) {
    clock.now += 61_000 // past the one-minute code-resend wait
    const step: any = await service.login({ school_id: schoolId, password: 'x', portal: 'user', ...extra }, cookie)
    return service.verify({ challenge_id: step.challengeId, code: '123456', ...(extra.client ? { client: extra.client } : {}) }, cookie) as Promise<any>
  }
  /** Password only, as the phone sends it. */
  const phoneLogin = (cookie?: string, extra: Record<string, unknown> = { client: 'mobile' }) =>
    service.login({ school_id: schoolId, password: 'x', portal: 'user', ...extra }, cookie) as Promise<any>
  return { pg, pool, connection, service, refresh, clock, mail, password, accountId, count, row, codeSignIn, phoneLogin }
}

async function withFlags<T>(flags: Record<string, string | undefined>, work: () => Promise<T>) {
  const saved = Object.fromEntries(Object.keys(flags).map(key => [key, process.env[key]]))
  for (const [key, value] of Object.entries(flags)) value === undefined ? delete process.env[key] : (process.env[key] = value)
  try { return await work() } finally { for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : (process.env[key] = value) }
}
const ON = { MOBILE_REFRESH_ENABLED: 'true', LOGIN_DEVICES_ENABLED: 'true' }

test('a known phone signs in with the password only: no code email, no challenge row (D-11)', () => withFlags(ON, async () => {
  const t = await setup()
  const first = await t.codeSignIn()
  assert.equal(t.mail.length, 1)
  const challenges = await t.count('login_otp_challenges')
  const again = await t.phoneLogin(first.deviceCookie.token)
  assert.equal(again.otpRequired, undefined)
  assert.ok(again.token && again.refreshToken?.length === 43 && again.deviceCookie.token)
  assert.equal(t.mail.length, 1)
  assert.equal(await t.count('login_otp_challenges'), challenges)
  assert.ok((await t.row(first.deviceCookie.sessionId)).revoked_at) // same phone, earlier session ended
}))

test('no cookie, an unknown cookie or no mobile client all get the emailed code (D-12)', () => withFlags(ON, async () => {
  const t = await setup()
  const first = await t.codeSignIn()
  t.clock.now += 61_000
  assert.equal((await t.phoneLogin()).otpRequired, true)
  t.clock.now += 61_000
  assert.equal((await t.phoneLogin(makeDeviceToken())).otpRequired, true)
  t.clock.now += 61_000
  assert.equal((await t.phoneLogin(first.deviceCookie.token, {})).otpRequired, true) // the web path never skips the code
  assert.equal(t.mail.length, 4)
}))

test('a password reset ends the trust (D-13)', () => withFlags(ON, async () => {
  const t = await setup()
  const first = await t.codeSignIn()
  await t.pg.query('UPDATE accounts SET auth_version=auth_version+1 WHERE account_id=$1', [t.accountId])
  t.clock.now += 61_000
  assert.equal((await t.phoneLogin(first.deviceCookie.token)).otpRequired, true)
}))

test('only the most recent phone skips the code, before and after sign-out and past its 30 days (D-16)', () => withFlags(ON, async () => {
  const t = await setup()
  const phoneA = await t.codeSignIn()
  const phoneB = await t.codeSignIn()
  const mailBefore = t.mail.length, challenges = await t.count('login_otp_challenges')

  t.clock.now += 61_000
  const asked: any = await t.phoneLogin(phoneA.deviceCookie.token)
  assert.equal(asked.otpRequired, true)
  assert.equal(await t.count('login_otp_challenges'), challenges + 1)
  assert.equal(t.mail.length, mailBefore + 1)

  const b: any = await t.phoneLogin(phoneB.deviceCookie.token)
  assert.ok(b.token && b.refreshToken)
  assert.equal(t.mail.length, mailBefore + 1)

  assert.equal(await t.refresh.revoke(b.refreshToken), true) // B signs out, no phone session is live
  t.clock.now += 61_000
  assert.equal((await t.phoneLogin(phoneA.deviceCookie.token)).otpRequired, true)
  const bAgain: any = await t.phoneLogin(b.deviceCookie.token)
  assert.ok(bAgain.token)

  t.clock.now += 31 * 24 * 60 * 60_000 // past the family deadline
  const bLate: any = await t.phoneLogin(bAgain.deviceCookie.token)
  assert.ok(bLate.token && bLate.refreshToken)
}))

test('a web cookie or another account\'s phone cookie never skips the code', () => withFlags(ON, async () => {
  const t = await setup()
  const web: any = await t.codeSignIn({})
  assert.ok(web.deviceCookie.token)
  t.clock.now += 61_000
  assert.equal((await t.phoneLogin(web.deviceCookie.token)).otpRequired, true)
  const { rows: [other] } = await t.pg.query<{ account_id: number }>("INSERT INTO accounts(school_id,role,auth_version) VALUES ('TEST0002','Student',3) RETURNING account_id")
  const stranger = makeDeviceToken()
  await t.pg.query("INSERT INTO library_login_sessions(session_id,account_id,auth_version,device_token_hash,client,trusted_since) VALUES (gen_random_uuid(),$1,3,$2,'mobile',NOW())", [other.account_id, deviceTokenHash('browser', stranger)])
  t.clock.now += 61_000
  assert.equal((await t.phoneLogin(stranger)).otpRequired, true)
}))

test('a wrong password on a known phone counts toward the lock and never gets a token', () => withFlags(ON, async () => {
  const t = await setup()
  const first = await t.codeSignIn()
  t.password.right = false
  await assert.rejects(t.phoneLogin(first.deviceCookie.token), { status: 401, code: 'INVALID_CREDENTIALS' })
  const { rows: [window] } = await t.pg.query<{ failed_count: number }>('SELECT failed_count FROM login_attempt_windows')
  assert.equal(Number(window.failed_count), 1)
}))

test('an inactive account never takes the trusted path', () => withFlags(ON, async () => {
  const t = await setup()
  const first = await t.codeSignIn()
  await t.pg.query("UPDATE accounts SET account_status='Inactive' WHERE account_id=$1", [t.accountId])
  t.clock.now += 61_000
  const step = await t.phoneLogin(first.deviceCookie.token)
  assert.equal(step.token, undefined)
  await assert.rejects(t.service.verify({ challenge_id: step.challengeId, code: '123456', client: 'mobile' }), { code: 'LOGIN_CHANGED' })
}))

test('flag unset: a matching cookie still gets the code', () => withFlags(ON, async () => {
  const t = await setup()
  const first = await t.codeSignIn()
  await withFlags({ MOBILE_REFRESH_ENABLED: undefined }, async () => {
    t.clock.now += 61_000
    assert.equal((await t.phoneLogin(first.deviceCookie.token)).otpRequired, true)
  })
}))

test('trust does not renew itself: a password-only sign-in keeps the first trusted_since', () => withFlags(ON, async () => {
  const t = await setup()
  const first = await t.codeSignIn()
  const trusted = (await t.row(first.deviceCookie.sessionId)).trusted_since
  t.clock.now += 5 * 24 * 60 * 60_000
  const second = await t.phoneLogin(first.deviceCookie.token)
  const third = await t.phoneLogin(second.deviceCookie.token)
  assert.equal(new Date((await t.row(third.deviceCookie.sessionId)).trusted_since).getTime(), new Date(trusted).getTime())
}))

test('trustedPhone applies a cap when one is set, and none when it is null', () => withFlags(ON, async () => {
  const t = await setup()
  const first = await t.codeSignIn()
  const verified = { accountId: t.accountId, authVersion: 3 } as VerifiedLogin
  const age = (days: number) => t.clock.now + days * 24 * 60 * 60_000
  assert.ok(await trustedPhone(t.connection, verified, first.deviceCookie.token, age(400), null))
  assert.ok(await trustedPhone(t.connection, verified, first.deviceCookie.token, age(1), 30 * 24 * 60 * 60_000))
  assert.equal(await trustedPhone(t.connection, verified, first.deviceCookie.token, age(31), 30 * 24 * 60 * 60_000), null)
}))

async function wrongPasswords(t: Awaited<ReturnType<typeof setup>>, times: number, send: () => Promise<unknown>) {
  t.password.right = false
  const codes: string[] = []
  for (let i = 0; i < times; i++) await send().catch(error => codes.push(`${error.status} ${error.code}`))
  t.password.right = true
  return codes
}

test('8 wrong passwords lock the account on the web path; the right one then answers LOGIN_PAUSED (SRV-03)', () => withFlags(ON, async () => {
  const t = await setup()
  const codes = await wrongPasswords(t, 8, () => t.phoneLogin(undefined, {}))
  assert.deepEqual(codes, [...Array(7).fill('401 INVALID_CREDENTIALS'), '429 LOGIN_PAUSED'])
  await assert.rejects(t.phoneLogin(undefined, {}), { status: 429, code: 'LOGIN_PAUSED' })
}))

test('the lock holds against the trusted phone\'s cookie and never reaches the trusted path (SRV-03)', () => withFlags(ON, async () => {
  const t = await setup('TEST0002')
  const first = await t.codeSignIn()
  const codes = await wrongPasswords(t, 8, () => t.phoneLogin(first.deviceCookie.token))
  assert.equal(codes[7], '429 LOGIN_PAUSED')
  const sessions = await t.count('library_login_sessions')
  await assert.rejects(t.phoneLogin(first.deviceCookie.token), { status: 429, code: 'LOGIN_PAUSED' })
  assert.equal(await t.count('library_login_sessions'), sessions)
}))

test('web and phone wrong passwords share one per-account budget (SRV-03)', () => withFlags(ON, async () => {
  const t = await setup('TEST0003')
  const first = await t.codeSignIn()
  t.password.right = false
  const codes: string[] = []
  for (let i = 0; i < 8; i++) await t.phoneLogin(i % 2 ? first.deviceCookie.token : undefined, i % 2 ? { client: 'mobile' } : {}).catch(error => codes.push(`${error.status} ${error.code}`))
  assert.equal(codes[7], '429 LOGIN_PAUSED')
  const { rows } = await t.pg.query<Record<string, any>>('SELECT * FROM login_attempt_windows')
  assert.equal(rows.length, 1)
  assert.ok(rows[0].locked_until)
}))
