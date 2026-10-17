// Live acceptance fixtures only. No email delivery or existing account mutations.
// Default removes fixtures; --keep-for-browser retains them in ignored output until --cleanup.
import assert from 'node:assert/strict'
import { randomBytes, createHmac } from 'node:crypto'
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcrypt'
import request from 'supertest'
import { createClient } from '@supabase/supabase-js'
import { db, dbDriver } from '../src/config/db.js'
import { env } from '../src/config/env.js'
import { createApp } from '../src/app.js'
import { createJwtAuthService } from '../src/modules/auth/jwt-auth.service.ts'

assert.equal(dbDriver, 'postgres')
const statePath = fileURLToPath(new URL('../../../output/phase1-acceptance-fixtures.json', import.meta.url))
const storage = createClient(env.supabase.url, env.supabase.secretKey, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from('profile-avatars')
let state
const save = () => writeFile(statePath, JSON.stringify(state), { mode: 0o600 })
const app = createApp(), auth = createJwtAuthService(db)
const checks = []
const pass = label => { checks.push(label); console.log(`PASS: ${label}`) }
const responseIs = (response, status, label) => assert.equal(response.status, status, `${label}: ${response.body.code ?? response.body.message ?? ''}`)
async function cleanup() {
  assert.match(state.marker, /^Q1-[A-F0-9]{12}$/)
  const [accounts] = await db.execute('SELECT account_id,user_id FROM accounts WHERE school_id LIKE ?', [`${state.marker}-%`])
  for (const account of accounts) {
    const [photos] = await db.execute('SELECT storage_path FROM profile_avatar_submissions WHERE account_id=?', [account.account_id])
    if (photos.length) {
      assert.ok(photos.every(row => row.storage_path.startsWith(`${account.account_id}/`)))
      const removed = await storage.remove(photos.map(row => row.storage_path))
      assert.ifError(removed.error)
    }
  }
  const connection = await db.getConnection()
  try {
    await connection.beginTransaction()
    await connection.execute('DELETE FROM registration_requests WHERE school_id LIKE ?', [`${state.marker}-%`])
    for (const { account_id: accountId, user_id: userId } of accounts) {
      await connection.execute('DELETE FROM profile_avatar_submissions WHERE account_id=?', [accountId])
      await connection.execute('DELETE FROM account_management_events WHERE account_id=? OR actor_account_id=?', [accountId, accountId])
      await connection.execute('DELETE FROM student_profiles WHERE account_id=?', [accountId])
      if (userId) {
        await connection.execute("DELETE FROM auth_sessions WHERE (session_data::json->'user'->>'id')::int=?", [userId])
        await connection.execute('DELETE FROM attendance_qr_credentials WHERE user_id=?', [userId])
        await connection.execute('DELETE FROM clearance_statuses WHERE user_id=?', [userId])
      }
      await connection.execute('DELETE FROM accounts WHERE account_id=? AND school_id LIKE ?', [accountId, `${state.marker}-%`])
      if (userId) await connection.execute('DELETE FROM users WHERE user_id=? AND school_id LIKE ?', [userId, `${state.marker}-%`])
    }
    // A failed seed can leave its operational profile before linking the account.
    await connection.execute('DELETE FROM users WHERE school_id LIKE ?', [`${state.marker}-%`])
    await connection.commit()
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
  for (const table of ['accounts', 'users', 'registration_requests']) {
    const [remaining] = await db.execute(`SELECT COUNT(*) total FROM ${table} WHERE school_id LIKE ?`, [`${state.marker}-%`])
    assert.equal(Number(remaining[0].total), 0, `Disposable ${table} cleanup`)
  }
  await unlink(statePath)
  console.log('CLEANUP: only this run’s disposable accounts, sessions, requests, pictures and history removed.')
}
try {
  if (process.argv.includes('--cleanup')) {
    state = JSON.parse(await readFile(statePath, 'utf8'))
    await cleanup()
  } else {
    await assert.rejects(readFile(statePath), { code: 'ENOENT' }, 'Clean up the preceding fixture run first.')
    state = { marker: `Q1-${randomBytes(6).toString('hex').toUpperCase()}`, password: randomBytes(18).toString('hex'), fixtures: [] }
    await mkdir(new URL('../../../output/', import.meta.url), { recursive: true })
    await save()
    const hash = await bcrypt.hash(state.password, 12)
    async function linked(role, roleName) {
      const schoolId = `${state.marker}-${role.toUpperCase()}`
      const email = `${schoolId.toLowerCase()}@ormoc.sti.edu.ph`
      const [roles] = await db.execute('SELECT role_id FROM roles WHERE role_name=?', [roleName])
      assert.equal(roles.length, 1)
      const [account] = await db.execute("INSERT INTO accounts(school_id,password_hash,role,account_status) VALUES (?,?,?,'Active')", [schoolId, hash, role])
      const [user] = await db.execute(`INSERT INTO users(role_id,user_role,institutional_id,school_id,full_name,email,password_hash,account_status)
        VALUES (?,?,?,?,?,?,?,'Active')`, [roles[0].role_id, role, schoolId, schoolId, `QA ${role} Fixture`, email, hash])
      await db.execute('UPDATE accounts SET user_id=? WHERE account_id=?', [user.insertId, account.insertId])
      const fixture = { role, schoolId, email, accountId: Number(account.insertId), userId: Number(user.insertId) }
      state.fixtures.push(fixture); await save(); return fixture
    }
    const librarian = await linked('Librarian', 'Librarian'), staff = await linked('Staff', 'Library Staff')
    const login = fixture => auth.login({ portal: ['Librarian', 'Staff'].includes(fixture.role) ? 'staff' : 'user', school_id: fixture.schoolId, password: state.password })
    const librarianLogin = await login(librarian), staffLogin = await login(staff)
    const as = (method, path, token) => request(app)[method](path).set('Authorization', `Bearer ${token}`)
    for (const [role, decision] of [['Student', 'approve'], ['Faculty', 'approve'], ['Student', 'reject']]) {
      const schoolId = `${state.marker}-${decision === 'reject' ? 'REJECTED' : role.toUpperCase()}`
      const email = `${schoolId.toLowerCase()}@ormoc.sti.edu.ph`
      // Seed only the request, avoiding register()'s global expired-request cleanup and real email sender.
      const [seed] = await db.execute(`INSERT INTO registration_requests(school_id,email,first_name,last_name,program_strand,year_grade_level,requested_role,password_hash)
        VALUES (?,?,'QA',?,'BSIT','4th Year',?,?)`, [schoolId, email, `${role} Fixture`, role, hash])
      const requestId = Number(seed.insertId), code = '123456'
      const digest = createHmac('sha256', env.jwt.secret).update(`${requestId}:${code}`).digest('hex')
      await db.execute('UPDATE registration_requests SET code_hash=?,code_expires_at=?,code_sent_at=NOW() WHERE request_id=?', [digest, new Date(Date.now() + 600_000), requestId])
      await assert.rejects(auth.login({ portal: 'user', school_id: schoolId, password: state.password }), error => error.code === 'EMAIL_VERIFICATION_REQUIRED')
      responseIs(await request(app).post('/api/v1/auth/register/verify').send({ school_id: schoolId, code }), 200, 'verify school email')
      await assert.rejects(auth.login({ portal: 'user', school_id: schoolId, password: state.password }), error => error.code === 'ACCOUNT_APPROVAL_PENDING')
      const path = `/api/v1/auth/registration-requests/${requestId}/review`
      responseIs(await as('post', path, staffLogin.token).send({ decision }), 403, 'Staff approval denied')
      responseIs(await as('post', path, librarianLogin.token).send({ decision }), 200, 'Librarian review')
      responseIs(await as('post', path, librarianLogin.token).send({ decision }), 422, 'Repeated review denied')
      const [reviewed] = await db.execute('SELECT status,password_hash,reviewed_by_account_id FROM registration_requests WHERE request_id=?', [requestId])
      assert.equal(reviewed[0].status, decision === 'approve' ? 'Completed' : 'Rejected')
      assert.equal(reviewed[0].password_hash, null)
      assert.equal(Number(reviewed[0].reviewed_by_account_id), librarian.accountId)
      if (decision === 'approve') {
        const [account] = await db.execute('SELECT account_id,user_id FROM accounts WHERE school_id=?', [schoolId])
        const fixture = { role, schoolId, email, accountId: Number(account[0].account_id), userId: Number(account[0].user_id) }
        state.fixtures.push(fixture); await save()
        assert.equal((await login(fixture)).user.role, role)
      } else await assert.rejects(auth.login({ portal: 'user', school_id: schoolId, password: state.password }), error => error.code === 'INVALID_CREDENTIALS')
      pass(`${role} ${decision}: verification gate, pending login gate, Staff denial, Librarian decision, replay denial, scrubbed request password`)
    }
    const student = state.fixtures.find(row => row.role === 'Student'), studentLogin = await login(student)
    const patch = { first_name: 'QA Updated', last_name: 'Student Fixture', program_strand: 'BSIT', year_grade_level: '4th Year' }
    responseIs(await as('patch', '/api/v1/profile/me', studentLogin.token).send(patch), 200, 'Owner edits own profile')
    responseIs(await as('patch', '/api/v1/profile/me', studentLogin.token).send({ ...patch, email: 'another@ormoc.sti.edu.ph' }), 422, 'School email fixed')
    responseIs(await as('patch', `/api/v1/admin/users/${student.accountId}`, librarianLogin.token).send(patch), 404, 'No administrator profile edit route')
    const detail = await as('get', `/api/v1/admin/users/${student.accountId}`, librarianLogin.token)
    responseIs(detail, 200, 'Read-only profile history')
    assert.ok(detail.body.data.events.some(row => row.action === 'ProfileEdited'))
    pass('Profile owner edit, fixed school email, read-only administrator history, absent administrator edit route')
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
    responseIs(await as('post', '/api/v1/profile/avatar/me', studentLogin.token).attach('image', Buffer.from('invalid'), { filename: 'bad.png', contentType: 'image/png' }), 422, 'Image signature mismatch')
    responseIs(await as('post', '/api/v1/profile/avatar/me', studentLogin.token).attach('image', Buffer.alloc(2 * 1024 * 1024 + 1), { filename: 'large.png', contentType: 'image/png' }), 422, 'Oversized photo')
    for (const decision of ['reject', 'approve']) {
      responseIs(await as('post', '/api/v1/profile/avatar/me', studentLogin.token).attach('image', png, { filename: 'fixture.png', contentType: 'image/png' }), 201, 'Photo upload')
      const me = await as('get', '/api/v1/profile/avatar/me', studentLogin.token)
      const id = me.body.data.pending.id, path = `/api/v1/profile/avatar/submissions/${id}/review`
      responseIs(await as('post', path, staffLogin.token).send({ decision }), 403, 'Staff photo review denied')
      responseIs(await as('post', path, librarianLogin.token).send({ decision }), 200, 'Librarian photo review')
      responseIs(await as('post', path, librarianLogin.token).send({ decision }), 409, 'Repeated photo review denied')
      const after = await as('get', '/api/v1/profile/avatar/me', studentLogin.token)
      assert.equal(after.body.data.pending, null)
      assert.ok(decision === 'approve' ? after.body.data.currentUrl : after.body.data.lastRejection)
      pass(`Photo ${decision}: private upload, review permission, replay denial, owner result`)
    }
    const statusPath = `/api/v1/admin/users/${student.accountId}/status`
    responseIs(await as('post', statusPath, librarianLogin.token).send({ status: 'Deactivated', reason: 'Disposable Phase 1 QA trial' }), 200, 'Deactivate fixture')
    responseIs(await as('get', '/api/v1/auth/me', studentLogin.token), 401, 'Deactivated token rejected')
    await assert.rejects(login(student), error => error.code === 'ACCOUNT_DEACTIVATED')
    const archived = await as('get', `/api/v1/admin/users/directory?status=Inactive&q=${encodeURIComponent(student.schoolId)}`, librarianLogin.token)
    responseIs(archived, 200, 'Archive list')
    assert.ok(archived.body.data.some(row => Number(row.id) === student.accountId))
    const history = await as('get', `/api/v1/admin/users/${student.accountId}`, librarianLogin.token)
    assert.ok(history.body.data.events.some(row => row.action === 'Deactivated'))
    assert.equal(history.body.data.records.profile_pictures.length, 2)
    responseIs(await as('post', statusPath, librarianLogin.token).send({ status: 'Active', reason: 'Restore disposable fixture for browser trial' }), 200, 'Reactivate fixture')
    pass('Deactivation revokes login/token, appears in archive, preserves profile/photo history')
    const cookie = request.agent(app), csrf = await cookie.get('/api/auth/csrf')
    const cookieLogin = { email: student.email, password: state.password }
    responseIs(await cookie.post('/api/auth/login').send(cookieLogin), 403, 'Missing CSRF denied')
    responseIs(await cookie.post('/api/auth/login').set('x-csrf-token', csrf.body.csrfToken).send(cookieLogin), 200, 'Cookie login')
    responseIs(await cookie.get('/api/auth/me'), 200, 'Live cookie accepted')
    responseIs(await cookie.post('/api/auth/logout'), 403, 'Cookie logout requires CSRF')
    const [sessions] = await db.execute("SELECT session_id,session_data FROM auth_sessions WHERE (session_data::json->'user'->>'id')::int=?", [student.userId])
    assert.equal(sessions.length, 1)
    const data = JSON.parse(sessions[0].session_data); data.lastActivity = Date.now() - 31 * 60_000
    await db.execute('UPDATE auth_sessions SET session_data=? WHERE session_id=?', [JSON.stringify(data), sessions[0].session_id])
    const expired = await cookie.get('/api/auth/me')
    responseIs(expired, 401, 'Idle cookie expires'); assert.equal(expired.body.code, 'SESSION_EXPIRED')
    const [remaining] = await db.execute('SELECT session_id FROM auth_sessions WHERE session_id=?', [sessions[0].session_id])
    assert.equal(remaining.length, 0)
    pass('Real cookie login/CSRF, idle expiry using controlled 31-minute fixture timestamp, session row destroyed')
    await writeFile(new URL('../../../output/phase1-acceptance-results.json', import.meta.url), JSON.stringify({ date: new Date().toISOString(), checks }, null, 2))
    if (process.argv.includes('--keep-for-browser')) console.log('Temporary fixtures retained for visible browser QA; run this script with --cleanup afterwards. Credentials only in ignored output.')
    else await cleanup()
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Acceptance check failed')
  if (state) await cleanup()
  process.exitCode = 1
} finally { await db.end() }
