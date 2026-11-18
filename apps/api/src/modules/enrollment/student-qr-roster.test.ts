import assert from 'node:assert/strict'
import test from 'node:test'
import { createEnrollmentService, replenishRosterCredentials } from './enrollment.service.ts'
import { issueAttendanceCredential, validateAttendanceCredential } from '../attendance/attendance-credential.service.ts'

test('QR roster retains unregistered students and performs no writes', async () => {
  const statements: string[] = []
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    execute: async (sql: string) => {
      statements.push(sql)
      if (sql.includes('SELECT a.role')) return [[{ role: 'Librarian', account_status: 'Active' }]]
      if (sql.includes('SELECT * FROM enrollment_semesters')) return [[{ semester_id: 1 }]]
      return [[{ school_id: 'TEST-001', student_name: 'Example Student', program: null, year_level: null, account_status: null }]]
    },
  }
  const service = createEnrollmentService({ getConnection: async () => connection } as never, () => true)
  const result = await service.qrRoster(1, 1, 1, '')
  assert.equal(result.rows[0].qr_image, null)
  assert.equal(result.rows[0].qr_status, 'Registration needed')
  assert.equal(statements.every(sql => !/\b(INSERT|UPDATE|DELETE)\b/.test(sql)), true)
})

test('QR roster refuses a current Student account before reading roster data', async () => {
  let reads = 0
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    execute: async () => { reads += 1; return [[{ role: 'Student', account_status: 'Active' }]] },
  }
  const service = createEnrollmentService({ getConnection: async () => connection } as never, () => true)
  await assert.rejects(() => service.qrRoster(1, 1, 1, ''), { code: 'JWT_ROLE_FORBIDDEN' })
  assert.equal(reads, 1)
})

test('a roster replenishment revokes existing passes before issuing replacements', async () => {
  const statements: string[] = []
  const connection = { execute: async (sql: string) => {
    statements.push(sql)
    if (sql.includes('SELECT DISTINCT u.user_id') || sql.includes('SELECT u.user_id')) return [[{ user_id: 19 }]]
    if (sql.includes('SELECT credential_id')) return [[]]
    return [{ insertId: 44 }]
  } }
  await replenishRosterCredentials(connection as never, 1)
  const revoked = statements.findIndex(sql => sql.includes("credential_status='Revoked'"))
  const issued = statements.findIndex(sql => sql.includes('INSERT INTO attendance_qr_credentials'))
  assert.ok(revoked >= 0 && issued > revoked)
})

test('uploading the identical roster still replenishes QR codes without inserting duplicate students', async () => {
  const statements: string[] = []
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    execute: async (sql: string) => {
      statements.push(sql)
      if (sql.includes('SELECT a.role')) return [[{ role: 'Librarian', account_status: 'Active' }]]
      if (sql.includes('SELECT started FROM enrollment_lifecycle')) return [[{ started: false }]]
      if (sql.includes('SELECT * FROM enrollment_semesters WHERE semester_id')) return [[{ semester_id: 1, academic_year: '2026-2027', term_name: '1st Semester' }]]
      if (sql.includes('SELECT clock_timestamp() AS time')) return [[{ time: new Date('2026-11-18T00:00:00Z') }]]
      if (sql.includes('INSERT INTO enrollment_roster_imports')) return [{ insertId: 0 }]
      if (sql.includes('SELECT DISTINCT u.user_id') || sql.includes('SELECT u.user_id')) return [[{ user_id: 19 }]]
      if (sql.includes('INSERT INTO attendance_qr_credentials')) return [{ insertId: 44 }]
      return [[]]
    },
  }
  const service = createEnrollmentService({ getConnection: async () => connection } as never, () => true)
  const result = await service.upload(1, 1, { originalname: 'example.csv', buffer: Buffer.from('Student ID,Name,Program,Year Level\nTEST-001,Example Student,BSIT,1st Year\n') }, { sourceDate: '2026-11-18', scope: 'Complete' })
  assert.equal(result.alreadyUploaded, true)
  assert.ok(statements.some(sql => sql.includes("credential_status='Revoked'")))
  assert.ok(statements.some(sql => sql.includes('INSERT INTO attendance_qr_credentials')))
  assert.equal(statements.some(sql => sql.includes('INSERT INTO enrollment_roster_students')), false)
})

test('replenishment rejects the previously saved QR and accepts its replacement', async () => {
  let credential: Record<string, unknown> | null = null
  const connection = { execute: async (sql: string, values: unknown[] = []) => {
    if (sql.includes('SELECT DISTINCT u.user_id') || sql.includes('SELECT u.user_id')) return [[{ user_id: 19 }]]
    if (sql.includes('SELECT credential_id')) return [credential ? [credential] : []]
    if (sql.includes('INSERT INTO attendance_qr_credentials')) {
      credential = { credential_id: 44, user_id: values[0], public_id: values[1], secret_hash: values[2], credential_version: values[3], credential_status: 'Active', issued_at: new Date() }
      return [{ insertId: 44 }]
    }
    if (sql.includes("credential_status='Revoked'")) { credential!.credential_status = 'Revoked'; return [{ affectedRows: 1 }] }
    if (sql.includes('UPDATE attendance_qr_credentials')) {
      Object.assign(credential!, { public_id: values[0], secret_hash: values[1], credential_version: values[2], credential_status: 'Active' })
      return [{ affectedRows: 1 }]
    }
    if (sql.includes('FROM attendance_qr_credentials c')) return [credential?.public_id === values[0] ? [{ ...credential, account_status: 'Active', school_id: 'TEST-001', full_name: 'Example Student', user_role: 'Student' }] : []]
    throw new Error('Unexpected fixture query')
  } }
  const original = await issueAttendanceCredential(connection as never,19)
  for (let upload = 0; upload < 2; upload += 1) {
    await replenishRosterCredentials(connection as never,1)
    await assert.rejects(() => validateAttendanceCredential(connection as never,original.payload), { code: 'ATTENDANCE_QR_INVALID' })
    const replacement = await issueAttendanceCredential(connection as never,19)
    assert.notEqual(replacement.payload,original.payload)
    assert.equal((await validateAttendanceCredential(connection as never,replacement.payload)).userId,19)
    original.payload = replacement.payload
  }
})
