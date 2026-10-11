// Local integration gate: use a disposable fixture, never deliver email or change real accounts.
import assert from 'node:assert/strict'
import { randomUUID, randomBytes } from 'node:crypto'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { db, dbDriver } from '../src/config/db.js'
import { env } from '../src/config/env.js'
import { createApp } from '../src/app.js'
import { createPasswordRecoveryService } from '../src/modules/auth/password-recovery.service.ts'
import { createJwtAuthService } from '../src/modules/auth/jwt-auth.service.ts'
import { listAdminNotifications } from '../src/modules/users/admin-notifications.routes.ts'

assert.equal(dbDriver, 'postgres', 'This gate requires the configured Supabase connection.')
const marker = randomUUID()
const schoolId = `REV1-${marker}`.toUpperCase()
const email = `revision-fixture-${marker}@ormoc.sti.edu.ph`
const oldPassword = randomBytes(16).toString('hex')
const newPassword = randomBytes(16).toString('hex')
let accountId = 0
let userId = 0
const isCode = expected => error => error?.code === expected
try {
  const [before] = await db.execute("SELECT COUNT(*) AS total FROM accounts WHERE school_id NOT LIKE 'REV1-%'", [])
  const [roles] = await db.execute("SELECT role_id FROM roles WHERE role_name='Student'", [])
  assert.ok(roles[0])
  const hash = await bcrypt.hash(oldPassword, 12)
  const [account] = await db.execute("INSERT INTO accounts(school_id,password_hash,role,account_status) VALUES (?,?,'Student','Active')", [schoolId, hash])
  accountId = Number(account.insertId)
  const [user] = await db.execute(`INSERT INTO users(role_id,user_role,institutional_id,school_id,full_name,email,password_hash,account_status)
    VALUES (?,'Student',?,?,'Revision integration fixture',?,?,'Active')`, [roles[0].role_id, schoolId, schoolId, email, hash])
  userId = Number(user.insertId)
  await db.execute('UPDATE accounts SET user_id=? WHERE account_id=?', [userId, accountId])
  let clock = Date.now()
  let deliveredCode = ''
  const service = createPasswordRecoveryService(db, async (_recipient, code) => { deliveredCode = code }, bcrypt, () => clock)
  const auth = createJwtAuthService(db)
  const oldLogin = await auth.login({ portal: 'user', school_id: schoolId, password: oldPassword })
  let challenge = await service.request({ identifier: email.toUpperCase() })
  assert.ok(deliveredCode)
  const wrongCode = deliveredCode === '000000' ? '111111' : '000000'
  await assert.rejects(service.verify({ challenge_id: challenge.challengeId, code: wrongCode }), isCode('RECOVERY_CODE_INVALID'))
  clock += 61_000
  challenge = await service.request({ identifier: schoolId })
  const [attempts] = await db.execute('SELECT code_attempts FROM account_recovery_challenges WHERE account_id=?', [accountId])
  assert.equal(Number(attempts[0].code_attempts), 1)
  await assert.rejects(service.verify({ challenge_id: challenge.challengeId, code: wrongCode }), isCode('RECOVERY_CODE_INVALID'))
  await assert.rejects(service.verify({ challenge_id: challenge.challengeId, code: wrongCode }), isCode('RECOVERY_LOCKED'))
  clock += 16 * 60_000
  challenge = await service.request({ identifier: schoolId })
  const verified = await service.verify({ challenge_id: challenge.challengeId, code: deliveredCode })
  const reset = { challenge_id: challenge.challengeId, reset_token: verified.resetToken, password: newPassword, confirm_password: newPassword }
  await assert.rejects(service.reset({ ...reset, password: oldPassword, confirm_password: oldPassword }), isCode('PASSWORD_UNCHANGED'))
  await service.reset(reset)
  await assert.rejects(service.reset(reset), isCode('RECOVERY_TOKEN_INVALID'))
  await assert.rejects(auth.login({ portal: 'user', school_id: schoolId, password: oldPassword }), isCode('INVALID_CREDENTIALS'))
  const newLogin = await auth.login({ portal: 'user', school_id: schoolId, password: newPassword })
  const app = createApp()
  assert.equal((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${oldLogin.token}`)).status, 401)
  assert.equal((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${newLogin.token}`)).status, 200)
  const [identities] = await db.execute("SELECT account_id,school_id,role,auth_version FROM accounts WHERE account_status='Active' AND role IN ('Librarian','Staff','Admin')", [])
  const tokenFor = identity => jwt.sign({ accountId: Number(identity.account_id), userId: Number(identity.account_id), schoolId: identity.school_id, role: identity.role, authVersion: Number(identity.auth_version) }, env.jwt.secret, { algorithm: 'HS256', expiresIn: 60, issuer: env.jwt.issuer, audience: env.jwt.audience, subject: String(identity.account_id) })
  for (const role of ['Librarian', 'Staff', 'Admin']) {
    const identity = identities.find(row => row.role === role)
    assert.ok(identity, `Missing active ${role} for permission gate`)
    const token = tokenFor(identity)
    for (const path of ['/api/v1/auth/registration-requests', '/api/v1/admin/notifications', '/api/v1/admin/users/directory', '/api/v1/profile/avatar/submissions', '/api/v1/admin/account-dashboard']) {
      const response = await request(app).get(path).set('Authorization', `Bearer ${token}`)
      assert.equal(response.status, role === 'Staff' ? 403 : 200, `${role}: ${path}: ${response.body.code ?? ''}`)
    }
    if (role === 'Staff') {
      assert.equal((await request(app).post(`/api/v1/admin/users/${accountId}/status`).set('Authorization', `Bearer ${token}`).send({ status: 'Deactivated', reason: 'Must be denied' })).status, 403)
      assert.equal((await request(app).post('/api/v1/auth/registration-requests/999999/review').set('Authorization', `Bearer ${token}`).send({ decision: 'approve' })).status, 403)
      assert.equal((await request(app).get('/api/v1/admin/printing/queue').set('Authorization', `Bearer ${token}`)).status, 200)
    }
  }
  const inbox = await listAdminNotifications(db, '/librarian')
  assert.ok([...inbox.pending, ...inbox.activity].every(item => item.actionPath.startsWith('/librarian/')))
  const [rls] = await db.execute("SELECT relrowsecurity FROM pg_class WHERE oid='public.account_recovery_challenges'::regclass", [])
  assert.equal(rls[0].relrowsecurity, true)
  const [grants] = await db.execute("SELECT COUNT(*) AS total FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='account_recovery_challenges' AND grantee IN ('anon','authenticated','PUBLIC')", [])
  assert.equal(Number(grants[0].total), 0)
  const [after] = await db.execute("SELECT COUNT(*) AS total FROM accounts WHERE school_id NOT LIKE 'REV1-%'", [])
  assert.equal(Number(before[0].total), Number(after[0].total))
  console.log('PASS: real Postgres recovery, resend lock, password/token reuse prevention, old credential/session revocation, Librarian authority, Staff denial, notification links, and private RLS/grants. No emails sent.')
} finally {
  if (accountId) await db.execute('DELETE FROM accounts WHERE account_id=? AND school_id=?', [accountId, schoolId])
  if (userId) await db.execute('DELETE FROM users WHERE user_id=? AND email=?', [userId, email])
  await db.end()
  console.log('Disposable integration fixture cleaned up.')
}
