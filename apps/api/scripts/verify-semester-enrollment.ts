import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import bcrypt from 'bcrypt'
import type { Pool, RowDataPacket } from '../src/config/db.js'
import { createPgPool } from '../src/config/pg-pool.js'
import { env } from '../src/config/env.js'
import { createEnrollmentService } from '../src/modules/enrollment/enrollment.service.ts'
import { createRosterRegistration } from '../src/modules/enrollment/roster-registration.service.ts'
import { enrollmentDecision, semesterAccessEnded } from '../src/modules/enrollment/enrollment-policy.ts'
import { createJwtAuthService } from '../src/modules/auth/jwt-auth.service.ts'
import { createLoginSecurityService } from '../src/modules/auth/login-security.service.ts'
import { parseUserFilters, UsersRepository } from '../src/modules/users/users.repository.ts'
import { createStaffAccount } from '../src/modules/auth/registration.service.ts'
import { createPasswordRecoveryService } from '../src/modules/auth/password-recovery.service.ts'
import { createActiveJwtAccountGuard, verifyAccessToken } from '../src/modules/auth/jwt-auth.middleware.ts'
import { REMEMBER_DEVICE_MS } from '../src/modules/auth/login-device-policy.ts'

if (!process.argv.includes('--isolated-schema')) {
  throw new Error('Use --isolated-schema with a configured Postgres connection.')
}
process.env.ENROLLMENT_ROSTER_ENABLED = 'true'
process.env.LOGIN_DEVICES_ENABLED = 'true'
const schema = `qa_enrollment_${randomUUID().replaceAll('-', '')}`
assert.match(schema, /^qa_enrollment_[a-f0-9]{32}$/)
const connection = createPgPool(env.db.connectionString, 3)
const file = (name: string) => readFile(new URL(`../../../database/supabase/${name}`, import.meta.url), 'utf8')
function table(source: string, name: string) {
  const ddl = source.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\(\\r?\\n[\\s\\S]+?\\r?\\n\\);`))?.[0]
  assert.ok(ddl, `Missing fixture definition for ${name}`)
  return ddl
}
async function getConnection() {
  const q = await connection.getConnection()
  let active = false
  async function begin() {
    await q.beginTransaction()
    try { await q.execute(`SET LOCAL search_path TO ${schema},pg_catalog`); active = true }
    catch (error) { await q.rollback(); throw error }
  }
  return {
    ...q, beginTransaction: begin,
    async commit() { await q.commit(); active = false },
    async rollback() { await q.rollback(); active = false },
    async execute(sql: string, values: unknown[] = []) {
      if (active) return q.execute(sql, values)
      await begin()
      try { const result = await q.execute(sql, values); await q.commit(); return result }
      catch (error) { await q.rollback(); throw error }
      finally { active = false }
    },
  }
}
const pool = {
  getConnection,
  async execute(sql: string, values?: unknown[]) {
    const q = await getConnection()
    try { return await q.execute(sql, values) } finally { q.release() }
  },
} as unknown as Pool
const row = async (sql: string, values: unknown[] = []) => {
  const [rows] = await pool.execute<RowDataPacket[]>(sql, values)
  return rows[0]
}
type DeviceResult = Extract<Awaited<ReturnType<ReturnType<typeof createLoginSecurityService>['verify']>>, { deviceCookie: unknown }>
const device = (result: unknown) => {
  assert.ok(result && typeof result === 'object' && 'deviceCookie' in result)
  return result as DeviceResult
}
const protectedStatus = (token: string) => new Promise<number>((resolve, reject) => {
  const response = {
    locals: { authenticatedUser: verifyAccessToken(token) },
    status: (status: number) => ({ json: () => resolve(status) }),
  }
  createActiveJwtAccountGuard(pool)({} as never, response as never, error => error ? reject(error) : resolve(200))
})

const header = ['Student ID', 'Name', 'Program', 'Level', 'Campus Email Address']
const newStudent = ['00000123', 'QA New Student', 'BSIT', '1Y', 'new-fixture@ormoc.sti.edu.ph']
const restrictedStudent = ['00000456', 'QA Restricted Student', 'BSIT', '2Y', 'restricted-fixture@ormoc.sti.edu.ph']
const missingEmail = ['00000789', 'QA Other Campus', 'BSIT', '1Y', 'fixture@other-campus.sti.edu.ph']
const csv = (...rows: string[][]) => ({ originalname: 'synthetic.csv', buffer: Buffer.from([header, ...rows].map(columns => columns.join(',')).join('\r\n')) })
const manilaDate = (value: number) => new Date(value + 8 * 3_600_000).toISOString().slice(0, 10)
const password = 'FakeFixturePass123'

let created = false
try {
  const [base, roles, qr, loginDdl, enrollment, events, recoveryDdl, devicesDdl] = await Promise.all([
    file('001_from_baseline.sql'), file('015_phase6_registration_roles.sql'), file('005_main_product_gapfill.sql'),
    file('029_october16_revisions.sql'), file('031_semester_enrollment.sql'),
    file('011_phase2_user_management.sql'), file('020_revision_phase1_password_recovery.sql'), file('032_login_devices.sql'),
  ])
  await connection.execute(`CREATE SCHEMA ${schema}`)
  created = true
  const q = await getConnection()
  try {
    await q.beginTransaction()
    const fixtures = [
      ...['roles', 'users', 'accounts', 'student_profiles', 'auth_sessions'].map(name => table(base, name)),
      table(roles, 'registration_requests'), table(qr, 'attendance_qr_credentials'),
      ...['login_attempt_windows', 'login_otp_challenges', 'library_login_sessions'].map(name => table(loginDdl, name)),
      'ALTER TABLE accounts ADD COLUMN auth_version integer NOT NULL DEFAULT 1;',
      'ALTER TABLE users ADD COLUMN auth_version integer NOT NULL DEFAULT 1;',
      table(events, 'account_management_events'),
      table(recoveryDdl.replaceAll('public.', ''), 'account_recovery_challenges'),
      'CREATE TABLE loan_fixture(account_id bigint REFERENCES accounts(account_id), due_at timestamptz, state text);',
    ]
    await q.execute(fixtures.join('\n'))
    await q.execute(enrollment)
    await q.execute(devicesDdl)
    await q.execute(`WITH inserted AS (
      INSERT INTO roles(role_name) VALUES ('Librarian'),('Staff'),('Library Staff'),('Faculty'),('Student') RETURNING role_id,role_name
    ), identities AS (
      INSERT INTO users(role_id,user_role,institutional_id,school_id,full_name,email,password_hash,account_status)
      SELECT role_id,role_name,school,school,name,email,'unused',status FROM inserted JOIN (VALUES
        ('Librarian','QA-LIB','QA Librarian','librarian-fixture@ormoc.sti.edu.ph','Active'),
        ('Staff','QA-STAFF','QA Staff','staff-fixture@ormoc.sti.edu.ph','Active'),
        ('Faculty','QA-FAC','QA Faculty','faculty-fixture@ormoc.sti.edu.ph','Active'),
        ('Student','00000456','QA Restricted Student','restricted-fixture@ormoc.sti.edu.ph','Deactivated')
      ) AS seed(role,school,name,email,status) ON role=role_name RETURNING *
    ) INSERT INTO accounts(user_id,school_id,role,password_hash,account_status)
      SELECT user_id,school_id,user_role,password_hash,account_status FROM identities`)
    await q.commit()
  } catch (error) { await q.rollback(); throw error }
  finally { q.release() }

  const library = Number((await row("SELECT account_id FROM accounts WHERE school_id='QA-LIB'")).account_id)
  const staff = Number((await row("SELECT account_id FROM accounts WHERE school_id='QA-STAFF'")).account_id)
  const time = +(await row('SELECT clock_timestamp() AS time')).time
  const sourceDate = manilaDate(time), endDate = manilaDate(time + 7 * 86_400_000)
  const setup = { academicYear: '2090-2091', termName: '1st Semester', endDate }
  const service = createEnrollmentService(pool)
  assert.equal(Number((await row(`SELECT COUNT(*) n FROM pg_class
    WHERE relnamespace=current_schema()::regnamespace AND relkind='r' AND relrowsecurity
      AND NOT has_table_privilege('anon',oid,'SELECT') AND NOT has_table_privilege('authenticated',oid,'SELECT')
      AND relname LIKE 'enrollment_%'`)).n), 6)
  assert.equal((await row(`SELECT relrowsecurity AND NOT has_table_privilege('anon',oid,'SELECT')
    AND NOT has_table_privilege('authenticated',oid,'SELECT') AS private FROM pg_class
    WHERE relnamespace=current_schema()::regnamespace AND relname='login_device_switches'`)).private, true)
  await assert.rejects(service.saveSemester(staff, setup), { status: 403 })
  const { semesterId } = await service.saveSemester(library, setup)
  const { semesterId: nextId } = await service.saveSemester(library, { ...setup, termName: '2nd Semester' })
  const scope = { sourceDate, scope: 'Complete' }
  await assert.rejects(service.start(library, semesterId), { code: 'SEMESTER_INVALID' })
  await assert.rejects(service.upload(library, semesterId, csv(newStudent, newStudent), scope), { code: 'ROSTER_ROWS_INVALID' })
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Fixture')
  sheet.addRows([header, newStudent, restrictedStudent, missingEmail])
  const excel = { originalname: 'synthetic.xlsx', buffer: Buffer.from(await workbook.xlsx.writeBuffer()) }
  await assert.rejects(service.preview(staff, semesterId, excel), { status: 403 })
  const preview = await service.preview(library, semesterId, excel)
  assert.equal(preview.studentCount, 3)
  assert.equal(preview.errorCount, 0)
  assert.equal(preview.warningCount, 1)
  assert.deepEqual(preview.sheets[0].headings, header)
  assert.deepEqual(preview.sheets[0].rows[2].cells, missingEmail)
  assert.equal(Number((await row('SELECT COUNT(*) n FROM enrollment_roster_imports')).n), 0)
  const upload = await service.upload(library, semesterId, excel, scope)
  assert.equal(upload.students, 3)
  assert.equal(upload.missingEmail, 1)
  assert.equal((await service.upload(library, semesterId, excel, scope)).alreadyUploaded, true)
  await service.upload(library, semesterId, csv(newStudent), { ...scope, scope: 'Partial' })
  const beforeStart = await service.roster(library, semesterId, 1, '00000')
  assert.deepEqual(beforeStart.rows.map(student => student.school_id), ['00000123', '00000456', '00000789'])
  const users = new UsersRepository(pool)
  const notRegistered = parseUserFilters({ status: 'Not registered', limit: 1 })
  const firstPage = await users.directory(notRegistered)
  assert.equal(firstPage.pagination.total, 2)
  assert.equal(firstPage.rows[0].id, null)
  const secondPage = await users.directory({ ...notRegistered, page: 2 })
  assert.notEqual(firstPage.rows[0].school_id, secondPage.rows[0].school_id)
  assert.deepEqual(await users.programs(notRegistered.status), ['BSIT'])
  assert.equal((await users.directory({ ...notRegistered, q: 'new-fixture' })).pagination.total, 1)
  assert.equal((await users.directory({ ...notRegistered, q: restrictedStudent[0] })).pagination.total, 0)
  assert.equal(Number((await row('SELECT COUNT(*) n FROM accounts')).n), 4)
  await service.start(library, semesterId)
  await assert.rejects(service.start(library, nextId), { code: 'SEMESTER_INVALID' })
  await assert.rejects(service.saveSemester(library, { ...setup, semesterId }), { code: 'SEMESTER_INVALID' })
  await assert.rejects(service.end(library, semesterId), { code: 'SEMESTER_INVALID' })
  assert.equal((await enrollmentDecision(pool, '00000123', 'Student')).allowed, true)
  assert.equal((await enrollmentDecision(pool, '00000001', 'Student')).allowed, false)
  assert.equal((await enrollmentDecision(pool, 'QA-FAC', 'Faculty')).allowed, true)

  const deliveries: { email: string; code: string }[] = []
  const sender = async (email: string, code: string) => { deliveries.push({ email, code }) }
  const signup = createRosterRegistration(pool, sender)
  for (const school_id of ['00000001', '00000456', '00000789']) {
    const result = await signup.begin({ school_id })
    assert.deepEqual(Object.keys(result), ['challengeId'])
  }
  assert.equal(deliveries.length, 0)
  const { challengeId } = await signup.begin({ school_id: newStudent[0], school_email: 'ignored@example.invalid' })
  assert.equal(deliveries[0].email, newStudent[4])
  await assert.rejects(signup.verify({ challenge_id: challengeId, code: deliveries[0].code === '000000' ? '000001' : '000000' }), { code: 'ROSTER_CODE_INVALID' })
  const { grant } = await signup.verify({ challenge_id: challengeId, code: deliveries[0].code })
  const input = { challenge_id: challengeId, grant, password, confirm_password: password }
  const attempts = await Promise.allSettled([signup.complete(input), signup.complete(input)])
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1)
  assert.deepEqual(attempts.find(result => result.status === 'fulfilled')?.value, { schoolId: newStudent[0], status: 'Active' })
  const student = await row('SELECT account_id,user_id,account_status FROM accounts WHERE school_id=?', [newStudent[0]])
  assert.equal(student.account_status, 'Active')
  assert.equal((await users.directory({ ...notRegistered, q: newStudent[0] })).pagination.total, 0)
  let loginTime = Date.now()
  const login = createJwtAuthService(pool)
  const security = createLoginSecurityService(pool, body => login.login(body, true), sender, () => loginTime)
  const credentials = { school_id: newStudent[0], password, portal: 'user' }
  await assert.rejects(security.login({ ...credentials, password: 'IncorrectPassword' }), { code: 'INVALID_CREDENTIALS' })
  const signIn = await security.login({ ...credentials, remember_device: true })
  assert.ok(signIn && 'challengeId' in signIn)
  const session = device(await security.verify({ challenge_id: signIn.challengeId, code: deliveries.at(-1)?.code }))
  assert.equal(session.user.accountId, Number(student.account_id))
  assert.equal(session.deviceCookie.deadline, loginTime + REMEMBER_DEVICE_MS)
  assert.notEqual((await row('SELECT device_token_hash FROM library_login_sessions WHERE session_id=?', [session.deviceCookie.sessionId])).device_token_hash, session.deviceCookie.token)
  assert.equal(await protectedStatus(session.token), 200)
  await assert.rejects(security.resumeDevice('A'.repeat(43)), { code: 'DEVICE_EXPIRED' })
  await pool.execute("UPDATE library_login_sessions SET last_activity_at=clock_timestamp()-interval '11 minutes' WHERE session_id=?", [session.deviceCookie.sessionId])
  assert.equal(await protectedStatus(session.token), 401)
  const resumed = await Promise.all(Array.from({ length: 3 }, () => security.resumeDevice(session.deviceCookie.token)))
  assert.ok(resumed.every(result => verifyAccessToken(result.token).sessionId === session.deviceCookie.sessionId))
  assert.ok(resumed.every(result => verifyAccessToken(result.token).rememberedUntil === session.deviceCookie.deadline))

  loginTime += 61_000
  const otherLogin = await security.login({ ...credentials, remember_device: true })
  assert.ok(otherLogin && 'challengeId' in otherLogin)
  const conflict = await security.verify({ challenge_id: otherLogin.challengeId, code: deliveries.at(-1)?.code })
  assert.ok(conflict && 'switchToken' in conflict)
  assert.equal(await protectedStatus(resumed[0].token), 200)
  const switched = await Promise.allSettled([security.switchDevice(conflict.switchToken), security.switchDevice(conflict.switchToken)])
  assert.equal(switched.filter(result => result.status === 'fulfilled').length, 1)
  const replacement = device(switched.find(result => result.status === 'fulfilled')?.value)
  assert.equal(await protectedStatus(resumed[0].token), 401)
  assert.equal(await security.revokeDevice(session.deviceCookie.token, verifyAccessToken(session.token)), false)
  assert.equal(await protectedStatus(replacement.token), 200)
  await assert.rejects(security.resumeDevice(session.deviceCookie.token), { code: 'DEVICE_EXPIRED' })
  await pool.execute("INSERT INTO loan_fixture VALUES (?,NOW(),'Borrowed')", [student.account_id])
  const loan = await row('SELECT * FROM loan_fixture')

  // Advance only this synthetic term's clock bounds to simulate its scheduled cutoff.
  await pool.execute(`UPDATE enrollment_semesters SET started_at=clock_timestamp()-interval '2 days',
    manual_end_at=clock_timestamp()-interval '1 minute',scheduled_end_at=clock_timestamp()-interval '1 second'
    WHERE semester_id=?`, [semesterId])
  assert.equal(await semesterAccessEnded(pool, Number(student.account_id)), true)
  assert.equal(await service.closeDue(), true)
  assert.equal(await service.closeDue(), false)
  assert.equal((await row('SELECT account_status FROM accounts WHERE account_id=?', [student.account_id])).account_status, 'Deactivated')
  assert.ok((await row('SELECT revoked_at FROM library_login_sessions WHERE session_id=?', [replacement.deviceCookie.sessionId])).revoked_at)
  await assert.rejects(security.resumeDevice(replacement.deviceCookie.token), { code: 'DEVICE_EXPIRED' })
  const archive = await service.roster(library, semesterId, 1, newStudent[0])
  assert.equal(archive.archived, true)
  assert.equal(archive.rows[0].closed_status, 'Deactivated')
  assert.equal(archive.rows[0].deactivated_at_end, true)
  assert.deepEqual(await row('SELECT * FROM loan_fixture'), loan)
  assert.equal((await row("SELECT account_status FROM accounts WHERE role='Faculty'")).account_status, 'Active')
  await assert.rejects(security.login(credentials), { code: 'ACCOUNT_DEACTIVATED' })

  const nextRoster = csv(newStudent, restrictedStudent)
  await service.upload(library, nextId, nextRoster, { ...scope, scope: 'Partial' })
  assert.equal((await service.upload(library, nextId, nextRoster, scope)).alreadyUploaded, false)
  await service.start(library, nextId)
  loginTime += 61_000
  await pool.execute("UPDATE accounts SET password_hash=? WHERE school_id='00000456'", [await bcrypt.hash(password, 4)])
  await assert.rejects(security.login({ ...credentials, school_id: restrictedStudent[0] }), { code: 'ACCOUNT_DEACTIVATED' })
  const returning = await security.login(credentials)
  assert.ok(returning && 'challengeId' in returning)
  assert.equal((await row('SELECT account_status FROM accounts WHERE account_id=?', [student.account_id])).account_status, 'Deactivated')
  await pool.execute('UPDATE login_otp_challenges SET restoration_semester_id=? WHERE challenge_id=?', [semesterId, returning.challengeId])
  await assert.rejects(security.verify({ challenge_id: returning.challengeId, code: deliveries.at(-1)?.code }), { code: 'LOGIN_CHANGED' })
  await pool.execute('UPDATE login_otp_challenges SET restoration_semester_id=? WHERE challenge_id=?', [nextId, returning.challengeId])
  const restored = await security.verify({ challenge_id: returning.challengeId, code: deliveries.at(-1)?.code })
  assert.equal(device(restored).user.accountId, Number(student.account_id))
  assert.equal((await row('SELECT user_id,account_status FROM accounts WHERE account_id=?', [student.account_id])).user_id, student.user_id)
  assert.equal((await row("SELECT account_status FROM accounts WHERE school_id='00000456'")).account_status, 'Deactivated')
  assert.deepEqual(await row('SELECT * FROM loan_fixture'), loan)

  await pool.execute("UPDATE enrollment_semesters SET started_at=clock_timestamp()-interval '2 minutes',manual_end_at=clock_timestamp()-interval '1 minute' WHERE semester_id=?", [nextId])
  await service.end(library, nextId)
  await service.end(library, nextId)
  assert.equal((await row('SELECT end_kind FROM enrollment_semesters WHERE semester_id=?', [nextId])).end_kind, 'Manual')
  assert.equal(Number((await row('SELECT COUNT(*) n FROM enrollment_semester_members WHERE account_id=?', [student.account_id])).n), 2)
  const provisioned = await createStaffAccount(library, {
    school_id: 'QA-NEW-STAFF', school_email: 'new-staff-fixture@ormoc.sti.edu.ph', first_name: 'New', last_name: 'Staff',
  }, pool)
  const staffCredentials = { school_id: provisioned.schoolId, password, portal: 'staff' }
  await assert.rejects(security.login(staffCredentials), { code: 'INVALID_CREDENTIALS' })
  const recovery = createPasswordRecoveryService(pool, sender)
  const deliveryCount = deliveries.length
  await recovery.request({ identifier: provisioned.schoolId })
  await recovery.request({ identifier: 'QA-STAFF', portal: 'staff' })
  await recovery.request({ identifier: 'QA-LIB', portal: 'staff' })
  assert.equal(deliveries.length, deliveryCount)
  const staffSetup = await recovery.request({ identifier: provisioned.schoolId, portal: 'staff' })
  assert.equal(deliveries.at(-1)?.email, 'new-staff-fixture@ormoc.sti.edu.ph')
  const verifiedStaff = await recovery.verify({ challenge_id: staffSetup.challengeId, code: deliveries.at(-1)?.code })
  await recovery.reset({ challenge_id: staffSetup.challengeId, reset_token: verifiedStaff.resetToken, password, confirm_password: password })
  const ordinary = device(await security.login({ ...staffCredentials, remember_device: true }))
  assert.equal(ordinary.user.accountId, provisioned.accountId)
  assert.equal(ordinary.deviceCookie.deadline, undefined)
  await pool.execute("UPDATE library_login_sessions SET last_activity_at=clock_timestamp()-interval '11 minutes' WHERE session_id=?", [ordinary.deviceCookie.sessionId])
  await assert.rejects(security.resumeDevice(ordinary.deviceCookie.token), { code: 'DEVICE_EXPIRED' })
  const staffSession = device(await security.login(staffCredentials))
  assert.equal(await security.revokeDevice(undefined, verifyAccessToken(staffSession.token)), true)
  await assert.rejects(security.resumeDevice(staffSession.deviceCookie.token), { code: 'DEVICE_EXPIRED' })

  await pool.execute("UPDATE accounts SET password_hash=? WHERE school_id='QA-FAC'", [await bcrypt.hash(password, 4)])
  const facultyLogin = await security.login({ school_id: 'QA-FAC', password, portal: 'user', remember_device: true })
  assert.ok(facultyLogin && 'challengeId' in facultyLogin)
  const faculty = device(await security.verify({ challenge_id: facultyLogin.challengeId, code: deliveries.at(-1)?.code }))
  assert.equal(await protectedStatus(faculty.token), 200)
  loginTime = faculty.deviceCookie.deadline!
  await pool.execute("UPDATE library_login_sessions SET remembered_until=clock_timestamp()-interval '1 second' WHERE session_id=?", [faculty.deviceCookie.sessionId])
  assert.equal(await protectedStatus(faculty.token), 401)
  await assert.rejects(security.resumeDevice(faculty.deviceCookie.token), { code: 'DEVICE_EXPIRED' })
  const lastFacultyLogin = await security.login({ school_id: 'QA-FAC', password, portal: 'user', remember_device: true })
  assert.ok(lastFacultyLogin && 'challengeId' in lastFacultyLogin)
  const lastFaculty = device(await security.verify({ challenge_id: lastFacultyLogin.challengeId, code: deliveries.at(-1)?.code }))
  await users.changeStatus(lastFaculty.user.accountId, library, { status: 'Deactivated', reason: 'Disposable device verification' })
  assert.equal(await protectedStatus(lastFaculty.token), 401)
  await assert.rejects(security.resumeDevice(lastFaculty.deviceCookie.token), { code: 'DEVICE_EXPIRED' })
  console.log('Enrollment, account setup, and single-device checks passed with mock email.')
} finally {
  try {
    if (created) {
      assert.match(schema, /^qa_enrollment_[a-f0-9]{32}$/)
      await connection.execute(`DROP SCHEMA ${schema} CASCADE`)
      console.log('Disposable enrollment fixtures removed.')
    }
  } finally { await connection.end() }
}
