import assert from 'node:assert/strict'
import test from 'node:test'
import { createRosterRegistration } from './roster-registration.service.ts'
import { parseEnrollmentFile } from './enrollment-parser.ts'
import { requireVerificationSender } from '../auth/school-email.sender.ts'
import { HttpError } from '../../core/http-error.ts'

function fakePool(rowsByPattern: Array<[RegExp, unknown[]]>) {
  const executed: string[] = []
  const conn = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async execute(sql: string) {
      executed.push(sql)
      for (const [pattern, rows] of rowsByPattern) {
        if (pattern.test(sql)) return [rows, []]
      }
      return [[], []]
    },
  }
  return {
    executed,
    pool: {
      async getConnection() { return conn },
      async execute(sql: string) { return conn.execute(sql) },
    },
  }
}

test('rosterRegistration.begin clearly rejects an ID not on the active roster (422 ROSTER_NOT_FOUND)', async () => {
  const { pool } = fakePool([
    [/enrollment_lifecycle/, [{ started: true }]],
    [/FROM enrollment_semesters/, [{ semester_id: 1 }]],
    [/FROM \(SELECT DISTINCT ON/, []],
  ])
  const service = createRosterRegistration(pool as never, async () => {}, () => true, 'Student')
  await assert.rejects(
    () => service.begin({ school_id: '02000999999' }),
    (err: unknown) => err instanceof HttpError && err.status === 422 && err.code === 'ROSTER_NOT_FOUND',
  )
})

test('rosterRegistration.begin clearly rejects a roster row with no school email (422 ROSTER_EMAIL_MISSING)', async () => {
  const { pool } = fakePool([
    [/enrollment_lifecycle/, [{ started: true }]],
    [/FROM enrollment_semesters/, [{ semester_id: 1 }]],
    [/FROM \(SELECT DISTINCT ON/, [{ roster_id: 10, school_id: '02000123456', school_email: null }]],
  ])
  const service = createRosterRegistration(pool as never, async () => {}, () => true, 'Student')
  await assert.rejects(
    () => service.begin({ school_id: '02000123456' }),
    (err: unknown) => err instanceof HttpError && err.status === 422 && err.code === 'ROSTER_EMAIL_MISSING',
  )
})

test('rosterRegistration.begin surfaces email send errors instead of hiding them', async () => {
  const { pool } = fakePool([
    [/enrollment_lifecycle/, [{ started: true }]],
    [/FROM enrollment_semesters/, [{ semester_id: 1 }]],
    [/FROM \(SELECT DISTINCT ON/, [{ roster_id: 10, school_id: '02000123456', school_email: 'student@ormoc.sti.edu.ph' }]],
    [/FROM accounts/, []],
    [/INSERT INTO enrollment_signup_challenges/, { affectedRows: 1 } as unknown as unknown[]],
  ])
  const service = createRosterRegistration(
    pool as never,
    async () => { throw new HttpError(503, 'EMAIL_DELIVERY_UNAVAILABLE', 'Mail failed') },
    () => true,
    'Student',
  )
  await assert.rejects(
    () => service.begin({ school_id: '02000123456' }),
    (err: unknown) => err instanceof HttpError && err.code === 'EMAIL_DELIVERY_UNAVAILABLE',
  )
})

test('enrollment-parser accepts Faculty Department / Dept column headers', async () => {
  const csv = Buffer.from('Faculty ID,Full Name,Faculty Department,School Email\nFAC-101,Maria Santos,Computer Studies,maria.santos@ormoc.sti.edu.ph\n')
  const parsed = await parseEnrollmentFile(
    { buffer: csv, originalname: 'faculty.csv' },
    { listedEnrolled: true, academicYear: '2026-2027', termName: '1st Semester', role: 'Faculty' },
  )
  assert.equal(parsed.errors, 0)
  assert.equal(parsed.rows[0].data.program, 'Computer Studies')
})

test('requireVerificationSender falls back to GMAIL_USER when GMAIL_SENDER_EMAIL is unset', () => {
  const prevSender = process.env.GMAIL_SENDER_EMAIL
  const prevUser = process.env.GMAIL_USER
  const prevPass = process.env.GMAIL_APP_PASSWORD
  try {
    delete process.env.GMAIL_SENDER_EMAIL
    process.env.GMAIL_USER = 'library.test@gmail.com'
    process.env.GMAIL_APP_PASSWORD = 'abcd efgh ijkl mnop'
    const sender = requireVerificationSender('student@ormoc.sti.edu.ph')
    assert.equal(sender.provider, 'gmail')
    if (sender.provider === 'gmail') assert.equal(sender.user, 'library.test@gmail.com')
  } finally {
    if (prevSender === undefined) delete process.env.GMAIL_SENDER_EMAIL; else process.env.GMAIL_SENDER_EMAIL = prevSender
    if (prevUser === undefined) delete process.env.GMAIL_USER; else process.env.GMAIL_USER = prevUser
    if (prevPass === undefined) delete process.env.GMAIL_APP_PASSWORD; else process.env.GMAIL_APP_PASSWORD = prevPass
  }
})
