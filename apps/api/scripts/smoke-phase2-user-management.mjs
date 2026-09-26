import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import pg from 'pg'
import { env } from '../src/config/env.js'

const deployment = process.argv[2]
if (!deployment || !/^dpl_[A-Za-z0-9]+$/.test(deployment) || env.db.driver !== 'postgres') {
  throw new Error('Pass a reviewed Vercel deployment ID and configure Supabase Postgres.')
}
const scope = 'team_wAUPvzzbz6oyARTA04OLQyH2'
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sti-account-smoke-'))
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const client = new pg.Client({ connectionString: env.db.connectionString })
const suffix = randomBytes(6).toString('hex')
const schoolId = `SMOKE${suffix.toUpperCase()}`
const password = `Smoke-${randomBytes(18).toString('hex')}!`
const email = `${schoolId.toLowerCase()}@example.invalid`
let accountId, userId

async function request(route, method = 'GET', token, body) {
  const args = ['--yes', 'vercel', 'curl', route, '--deployment', deployment, '--scope', scope, '--']
  const configFile = path.join(tmp, `curl-${randomBytes(5).toString('hex')}.txt`)
  const config = []
  if (method !== 'GET') config.push(`request = "${method}"`)
  if (token) config.push(`header = "Authorization: Bearer ${token}"`)
  if (body) {
    const bodyFile = path.join(tmp, `body-${randomBytes(5).toString('hex')}.json`)
    await fs.writeFile(bodyFile, JSON.stringify(body))
    config.push('header = "Content-Type: application/json"', `data-binary = "@${bodyFile.replaceAll('\\', '/')}"`)
  }
  await fs.writeFile(configFile, `${config.join('\n')}\n`)
  args.push('--config', configFile)
  return run(args)
}
function run(args) {
  const command = `npx ${args.join(' ')}`
  const result = spawnSync('cmd.exe', ['/d', '/s', '/c', command], { encoding: 'utf8', cwd: repoRoot, timeout: 90000 })
  if (result.error || result.status !== 0) throw new Error(`Deployment request failed: ${result.error?.message ?? result.stderr?.slice(-300)}`)
  try { return JSON.parse(result.stdout) }
  catch { throw new Error(`Deployment returned non-JSON: ${result.stdout.slice(0, 100)}`) }
}
function expect(value, label) {
  if (!value) throw new Error(`Failed: ${label}`)
  console.log(`PASS ${label}`)
}
function sign(account) {
  return jwt.sign({ accountId: Number(account.account_id), userId: Number(account.account_id), schoolId: account.school_id, role: account.role, authVersion: Number(account.auth_version) }, env.jwt.secret,
    { algorithm: 'HS256', expiresIn: 600, issuer: env.jwt.issuer, audience: env.jwt.audience, subject: String(account.account_id) })
}

await client.connect()
try {
  const admin = (await client.query("SELECT account_id,school_id,role,auth_version FROM accounts WHERE role='Admin' AND account_status='Active' ORDER BY account_id LIMIT 1")).rows[0]
  expect(admin, 'active admin identity found')
  const adminToken = sign(admin)
  const adminMe = await request('/api/v1/auth/me', 'GET', adminToken)
  expect(adminMe.success && adminMe.data.role === 'Admin', 'deployment accepts admin identity')

  const role = (await client.query("SELECT role_id FROM roles WHERE role_name='Student' LIMIT 1")).rows[0]
  expect(role, 'Student role exists')
  const hash = await bcrypt.hash(password, 10)
  const user = await client.query(
    `INSERT INTO users(role_id,user_role,institutional_id,school_id,full_name,email,password_hash,educational_level,course_or_strand,account_status)
     VALUES($1,'Student',$2,$2,'Phase Two Smoke Student',$3,$4,'College','BS Information Technology','Active') RETURNING user_id`,
    [role.role_id, schoolId, email, hash],
  )
  userId = Number(user.rows[0].user_id)
  const account = await client.query(
    "INSERT INTO accounts(user_id,school_id,contact_number,password_hash,role,account_status) VALUES($1,$2,'09123456789',$3,'Student','Active') RETURNING account_id",
    [userId, schoolId, hash],
  )
  accountId = Number(account.rows[0].account_id)
  await client.query("INSERT INTO student_profiles(account_id,first_name,last_name,program_strand,year_grade_level) VALUES($1,'Phase Two','Smoke Student','BS Information Technology','4th Year')", [accountId])
  console.log('Disposable student account created')
  const initialDirectory = await request(`/api/v1/admin/users/directory?q=${schoolId}`, 'GET', adminToken)
  expect(initialDirectory.success && initialDirectory.data?.some(row => Number(row.id) === accountId), 'deployment reads disposable student from Supabase')

  const loginBody = { school_id: schoolId, password, login_as: 'Student' }
  const login = await request('/api/v1/auth/login', 'POST', undefined, loginBody)
  if (!login.success) console.log('Student login response:', login.code, login.message)
  expect(login.success && login.data?.token, 'student can sign in while active')
  const originalToken = login.data.token
  const studentMe = await request('/api/v1/auth/me', 'GET', originalToken)
  expect(studentMe.success, 'active student token is accepted')

  const studentAttempt = await request(`/api/v1/admin/users/${accountId}/status`, 'POST', originalToken, { status: 'Deactivated', reason: 'Smoke check' })
  expect(!studentAttempt.success && studentAttempt.code === 'JWT_ROLE_FORBIDDEN', 'student cannot change account status')
  const shortReason = await request(`/api/v1/admin/users/${accountId}/status`, 'POST', adminToken, { status: 'Deactivated', reason: 'x' })
  expect(!shortReason.success && shortReason.code === 'USER_REASON_REQUIRED', 'short audit reason is rejected')

  const deactivated = await request(`/api/v1/admin/users/${accountId}/status`, 'POST', adminToken, { status: 'Deactivated', reason: 'Deployment smoke test' })
  expect(deactivated.success && deactivated.data?.account_status === 'Deactivated', 'admin deactivates account')
  const oldMe = await request('/api/v1/auth/me', 'GET', originalToken)
  expect(!oldMe.success && oldMe.code === 'ACCOUNT_ACCESS_REVOKED', 'existing student token is revoked')
  const blockedLogin = await request('/api/v1/auth/login', 'POST', undefined, loginBody)
  expect(!blockedLogin.success && blockedLogin.code === 'ACCOUNT_DEACTIVATED', 'deactivated student cannot sign in')

  const activated = await request(`/api/v1/admin/users/${accountId}/status`, 'POST', adminToken, { status: 'Active', reason: 'Deployment smoke test' })
  expect(activated.success, 'admin reactivates account')
  const oldAfterActivate = await request('/api/v1/auth/me', 'GET', originalToken)
  expect(!oldAfterActivate.success && oldAfterActivate.code === 'ACCOUNT_ACCESS_REVOKED', 'old token stays revoked after activation')
  const freshLogin = await request('/api/v1/auth/login', 'POST', undefined, loginBody)
  expect(freshLogin.success && freshLogin.data?.token, 'reactivated student receives fresh token')

  const edit = await request(`/api/v1/admin/users/${accountId}/profile`, 'PATCH', adminToken,
    { first_name: 'Phase Two', last_name: 'Smoke Student', email, contact_number: '09123456789', program_strand: 'BS Information Technology', year_grade_level: '3rd Year', reason: 'Deployment smoke test' })
  expect(edit.success && edit.data?.changed_fields?.includes('year_grade_level'), 'admin edits permitted profile field')
  const detail = await request(`/api/v1/admin/users/${accountId}`, 'GET', adminToken)
  expect(detail.success && detail.data?.year_grade_level === '3rd Year' && detail.data.events.length === 3, 'profile and audit history read back')
  const archived = await request(`/api/v1/admin/users/${accountId}/status`, 'POST', adminToken, { status: 'Archived', reason: 'Deployment smoke test' })
  expect(archived.success, 'admin archives account')
  const afterArchive = await request('/api/v1/auth/me', 'GET', freshLogin.data.token)
  expect(!afterArchive.success && afterArchive.code === 'ACCOUNT_ACCESS_REVOKED', 'archived account token is revoked')
  const directory = await request(`/api/v1/admin/users/directory?q=${schoolId}`, 'GET', adminToken)
  expect(directory.success && directory.data?.some(row => Number(row.id) === accountId && row.account_status === 'Archived'), 'archived account remains in directory')
  const state = (await client.query('SELECT a.account_status account_status,u.account_status user_status,COUNT(e.event_id)::int events FROM accounts a JOIN users u ON u.user_id=a.user_id LEFT JOIN account_management_events e ON e.account_id=a.account_id WHERE a.account_id=$1 GROUP BY a.account_status,u.account_status', [accountId])).rows[0]
  expect(state?.account_status === 'Archived' && state.user_status === 'Archived' && state.events === 4, 'Supabase identities and audit records agree')
} finally {
  if (accountId || userId) {
    await client.query('BEGIN')
    try {
      if (accountId) {
        await client.query('DELETE FROM account_management_events WHERE account_id=$1', [accountId])
        await client.query('DELETE FROM student_profiles WHERE account_id=$1', [accountId])
        await client.query('UPDATE accounts SET user_id=NULL WHERE account_id=$1', [accountId])
        await client.query('DELETE FROM accounts WHERE account_id=$1', [accountId])
      }
      if (userId) await client.query('DELETE FROM users WHERE user_id=$1', [userId])
      await client.query('COMMIT')
      console.log('Disposable student account removed')
    } catch (error) { await client.query('ROLLBACK'); console.error('Disposable account cleanup failed', { accountId, userId }); throw error }
  }
  await client.end()
  await fs.rm(tmp, { recursive: true, force: true })
}
