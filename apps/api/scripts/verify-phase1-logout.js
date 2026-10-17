// P1-02 acceptance: use only this run's disposable identities; never send mail.
// --server checks the already-running local API instead of an isolated app.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import bcrypt from 'bcrypt'
import request from 'supertest'
import { db, dbDriver } from '../src/config/db.js'
import { createApp } from '../src/app.js'
import { createJwtAuthService } from '../src/modules/auth/jwt-auth.service.ts'
import { verifyAccessToken } from '../src/modules/auth/jwt-auth.middleware.ts'
import { createAuthSessionRepository } from '../src/modules/auth/auth-session.repository.ts'

assert.equal(dbDriver, 'postgres')
const marker = `Q1L-${randomBytes(6).toString('hex').toUpperCase()}`
const password = randomBytes(18).toString('hex')
const checks = []
const pass = label => { checks.push(label); console.log(`PASS: ${label}`) }
const status = (response, expected) => assert.equal(response.status, expected, response.body.code ?? 'HTTP status')
const server = process.argv.includes('--server')
const app = server ? 'http://localhost:4000' : createApp()
const auth = createJwtAuthService(db), sessions = createAuthSessionRepository(db)
const bearerGet = token => request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`)
const login = fixture => auth.login({ portal: 'user', school_id: fixture.schoolId, password })
async function seed() {
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const hash = await bcrypt.hash(password, 12), fixtures = []
    for (const role of ['Student', 'Faculty']) {
      const schoolId = `${marker}-${role.toUpperCase()}`, email = `${schoolId.toLowerCase()}@ormoc.sti.edu.ph`
      const [roles] = await connection.execute('SELECT role_id FROM roles WHERE role_name=?', [role])
      assert.equal(roles.length, 1)
      const [user] = await connection.execute(`INSERT INTO users(role_id,user_role,institutional_id,school_id,full_name,email,password_hash,account_status,auth_version)
        VALUES (?,?,?,?,?,?,?,'Active',7)`, [roles[0].role_id, role, schoolId, schoolId, 'Disposable Logout QA', email, hash])
      const [account] = await connection.execute(`INSERT INTO accounts(user_id,school_id,password_hash,role,account_status,auth_version)
        VALUES (?,?,?,?,'Active',1)`, [user.insertId, schoolId, hash, role])
      fixtures.push({ schoolId, email, userId: Number(user.insertId), accountId: Number(account.insertId) })
    }
    await connection.commit()
    return fixtures
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}
async function cleanup() {
  assert.match(marker, /^Q1L-[A-F0-9]{12}$/)
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    const [users] = await connection.execute('SELECT user_id FROM users WHERE school_id LIKE ?', [`${marker}-%`])
    for (const user of users) {
      await connection.execute("DELETE FROM auth_sessions WHERE (session_data::json->'user'->>'id')::int=?", [user.user_id])
    }
    await connection.execute('DELETE FROM accounts WHERE school_id LIKE ?', [`${marker}-%`])
    await connection.execute('DELETE FROM users WHERE school_id LIKE ?', [`${marker}-%`])
    for (const table of ['accounts', 'users']) {
      const [remaining] = await connection.execute(`SELECT COUNT(*) total FROM ${table} WHERE school_id LIKE ?`, [`${marker}-%`])
      assert.equal(Number(remaining[0].total), 0)
    }
    await connection.commit()
    console.log('CLEANUP: this run’s disposable accounts, users and cookie sessions removed.')
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}
try {
  const [student, faculty] = await seed()
  const first = await login(student), agent = request.agent(app)
  const csrf = (await agent.get('/api/auth/csrf')).body.csrfToken
  assert.ok(csrf)
  status(await bearerGet(first.token), 200)
  status(await agent.post('/api/auth/logout').set('Authorization', `Bearer ${first.token}`), 403)
  status(await bearerGet(first.token), 200)
  pass('Missing CSRF denies logout without revoking a valid token')

  status(await agent.post('/api/auth/logout').set('Authorization', `Bearer ${first.token}`).set('x-csrf-token', csrf), 303)
  status(await bearerGet(first.token), 401)
  const replayCsrf = (await agent.get('/api/auth/csrf')).body.csrfToken
  status(await agent.post('/api/auth/logout').set('Authorization', `Bearer ${first.token}`).set('x-csrf-token', replayCsrf), 401)
  pass('Successful logout immediately rejects copied token and repeated logout')

  const current = await login(student)
  status(await bearerGet(current.token), 200)
  const newer = await login(student)
  // Simulate a logout that authenticated before this newer login committed.
  assert.equal(await sessions.revokeCurrentVersion(verifyAccessToken(current.token)), false)
  status(await bearerGet(current.token), 401)
  status(await bearerGet(newer.token), 200)
  pass('Fresh login works; an older in-flight logout preserves the newer token')

  const cookie = request.agent(app)
  const cookieCsrf = (await cookie.get('/api/auth/csrf')).body.csrfToken
  status(await cookie.post('/api/auth/login').set('x-csrf-token', cookieCsrf).send({ email: faculty.email, password }), 200)
  status(await cookie.get('/api/auth/me'), 200)
  const [beforeMixed] = await db.execute('SELECT auth_version FROM accounts WHERE account_id=?', [faculty.accountId])
  const mixedCsrf = (await cookie.get('/api/auth/csrf')).body.csrfToken
  status(await cookie.post('/api/auth/logout').set('Authorization', `Bearer ${newer.token}`).set('x-csrf-token', mixedCsrf), 303)
  status(await bearerGet(newer.token), 401)
  const [afterMixed] = await db.execute('SELECT auth_version FROM accounts WHERE account_id=?', [faculty.accountId])
  assert.equal(afterMixed[0].auth_version, beforeMixed[0].auth_version)
  pass('With both credentials present, logout revokes the supplied bearer identity')

  for (const path of ['/api/auth/logout', '/auth/logout']) {
    const cookieAgent = request.agent(app)
    const initialCsrf = (await cookieAgent.get('/api/auth/csrf')).body.csrfToken
    status(await cookieAgent.post('/api/auth/login').set('x-csrf-token', initialCsrf).send({ email: faculty.email, password }), 200)
    status(await cookieAgent.get('/api/auth/me'), 200)
    const [before] = await db.execute(`SELECT a.auth_version AS account_version,u.auth_version AS user_version FROM accounts a JOIN users u ON u.user_id=a.user_id WHERE a.account_id=?`, [faculty.accountId])
    assert.notEqual(before[0].account_version, before[0].user_version)
    const activeCsrf = (await cookieAgent.get('/api/auth/csrf')).body.csrfToken
    status(await cookieAgent.post(path), 403)
    status(await cookieAgent.get('/api/auth/me'), 200)
    status(await cookieAgent.post(path).set('x-csrf-token', activeCsrf), 303)
    status(await cookieAgent.get('/api/auth/me'), 401)
    const [after] = await db.execute(`SELECT a.auth_version AS account_version,u.auth_version AS user_version FROM accounts a JOIN users u ON u.user_id=a.user_id WHERE a.account_id=?`, [faculty.accountId])
    assert.equal(Number(after[0].account_version), Number(before[0].account_version) + 1)
    assert.equal(Number(after[0].user_version), Number(before[0].user_version) + 1)
    pass(`Cookie-only ${path}: CSRF, linked-version revocation and session removal`)
  }
  await mkdir(new URL('../../../output/', import.meta.url), { recursive: true })
  await writeFile(new URL(`../../../output/phase1-logout-${server ? 'server' : 'live'}-results.json`, import.meta.url), JSON.stringify({ date: new Date().toISOString(), checks }, null, 2))
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Logout verification failed')
  process.exitCode = 1
} finally {
  try { await cleanup() } finally { await db.end() }
}
