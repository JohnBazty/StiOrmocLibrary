import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcrypt'
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { issueAttendanceCredential } from '../attendance/attendance-credential.service.ts'
import { normalizeSchoolId, validateAccountRegistration } from './account-auth.validation.ts'
import { requireVerificationSender, sendSchoolVerificationCode } from './school-email.sender.ts'

type RegistrationRow = RowDataPacket & {
  request_id: number; school_id: string; email: string; first_name: string; last_name: string;
  program_strand: string | null; year_grade_level: string | null;
  requested_role: 'Student' | 'Faculty' | 'Librarian' | 'Staff'; password_hash: string | null;
  status: string; code_hash: string | null; code_expires_at: Date | null;
  code_sent_at: Date | null; code_attempts: number;
}
const codeDigest = (requestId: number, code: string) =>
  createHmac('sha256', env.jwt.secret).update(`${requestId}:${code}`).digest('hex')
const duplicate = () => new HttpError(422, 'REGISTRATION_UNAVAILABLE', 'These details may already be in the library system. Try signing in with your original School ID and password, or contact the library for account help. The password entered here was not saved.')
const pending = () => new HttpError(422, 'REGISTRATION_NOT_READY', 'The registration request is not ready for this action.')

async function createActiveAccount(connection: PoolConnection, row: RegistrationRow) {
  const [existing] = await connection.execute<RowDataPacket[]>(
    'SELECT account_id FROM accounts WHERE school_id=? LIMIT 1', [row.school_id],
  )
  if (existing.length) throw duplicate()
  const [emailRows] = await connection.execute<RowDataPacket[]>(
    'SELECT user_id FROM users WHERE LOWER(email)=? LIMIT 1', [row.email],
  )
  if (emailRows.length) throw duplicate()
  const roleName = row.requested_role === 'Staff' ? 'Library Staff' : row.requested_role
  if (!row.password_hash) throw pending()
  const [roleRows] = await connection.execute<RowDataPacket[]>('SELECT role_id FROM roles WHERE role_name=? LIMIT 1', [roleName])
  if (!roleRows.length) throw new HttpError(503, 'ROLE_SCHEMA_MISSING', 'The account roles are not ready. Apply the Phase 6 database migration.')
  const [accountResult] = await connection.execute<ResultSetHeader>(
    `INSERT INTO accounts (school_id,password_hash,role,account_status)
     VALUES (?,?,?, 'Active')`,
    [row.school_id, row.password_hash, row.requested_role],
  )
  const accountId = Number(accountResult.insertId)
  const fullName = `${row.first_name} ${row.last_name}`.trim()
  const educationalLevel = row.requested_role === 'Student'
    ? row.year_grade_level?.startsWith('Grade') ? 'Senior High School' : 'College' : null
  const [userResult] = await connection.execute<ResultSetHeader>(
    `INSERT INTO users (role_id,user_role,institutional_id,school_id,full_name,email,password_hash,
      educational_level,course_or_strand,account_status)
     VALUES (?,?,?,?,?,?,?,?,?,'Active')`,
    [roleRows[0].role_id, row.requested_role, row.school_id, row.school_id, fullName,
      row.email, row.password_hash, educationalLevel, row.program_strand],
  )
  const userId = Number(userResult.insertId)
  await connection.execute('UPDATE accounts SET user_id=?,updated_at=NOW() WHERE account_id=?', [userId, accountId])
  if (row.requested_role === 'Student') {
    await connection.execute(
      `INSERT INTO student_profiles (account_id,first_name,last_name,program_strand,year_grade_level)
       VALUES (?,?,?,?,?)`,
      [accountId, row.first_name, row.last_name, row.program_strand, row.year_grade_level],
    )
  }
  if (row.requested_role === 'Student' || row.requested_role === 'Faculty') {
    await issueAttendanceCredential(connection, userId)
  }
  return accountId
}

export function createRegistrationService(
  database: Pool = db,
  sendCode: (email: string, code: string) => Promise<void> = sendSchoolVerificationCode,
  passwordHasher = bcrypt,
  activeDriver: string = env.db.driver,
) {
  const requireSupabase = () => {
    if (activeDriver !== 'postgres') throw new HttpError(503, 'SUPABASE_REQUIRED', 'Registration requires the Supabase Postgres connection.')
  }
  return {
    async register(body: unknown) {
      requireSupabase()
      const input = validateAccountRegistration(body)
      if (!input.isValid) throw new HttpError(422, 'AUTH_VALIDATION_FAILED', 'Please correct the highlighted fields.', { errors: input.errors })
      // Fail closed before storing a request if the authorized sender is absent.
      if (sendCode === sendSchoolVerificationCode) requireVerificationSender(input.schoolEmail)
      // Expired unverified attempts must not reserve a school ID forever.
      await database.execute("DELETE FROM registration_requests WHERE status='PendingEmail' AND created_at < NOW() - INTERVAL '24 hours'", [])
      const [accounts] = await database.execute<RowDataPacket[]>(
        'SELECT account_id FROM accounts WHERE school_id=? LIMIT 1', [input.schoolId],
      )
      const [users] = await database.execute<RowDataPacket[]>(
        'SELECT user_id FROM users WHERE LOWER(email)=? LIMIT 1', [input.schoolEmail],
      )
      const [requests] = await database.execute<RegistrationRow[]>(
        'SELECT request_id FROM registration_requests WHERE school_id=? OR email=? LIMIT 1',
        [input.schoolId, input.schoolEmail],
      )
      if (accounts.length || users.length || requests.length) throw duplicate()
      const passwordHash = await passwordHasher.hash(input.password, 12)
      let result: ResultSetHeader
      try { [result] = await database.execute<ResultSetHeader>(
        `INSERT INTO registration_requests
          (school_id,email,first_name,last_name,program_strand,year_grade_level,requested_role,password_hash)
         VALUES (?,?,?,?,?,?,?,?)`,
        [input.schoolId, input.schoolEmail, input.firstName, input.lastName,
          input.programStrand || null, input.yearGradeLevel || null, input.role, passwordHash],
      ) } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && (error.code === '23505' || error.code === 'ER_DUP_ENTRY')) throw duplicate()
        throw error
      }
      const requestId = Number(result.insertId)
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
      await database.execute(
        `UPDATE registration_requests SET code_hash=?,code_expires_at=?,code_sent_at=NOW(),updated_at=NOW()
         WHERE request_id=? AND status='PendingEmail'`,
        [codeDigest(requestId, code), new Date(Date.now() + 10 * 60_000), requestId],
      )
      try { await sendCode(input.schoolEmail, code) }
      catch (error) {
        await database.execute("DELETE FROM registration_requests WHERE request_id=? AND status='PendingEmail'", [requestId])
        throw error
      }
      return { requestId, schoolId: input.schoolId, email: input.schoolEmail, status: 'PendingEmail' }
    },

    async resend(body: unknown) {
      requireSupabase()
      const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
      const schoolId = normalizeSchoolId(input.school_id)
      const [rows] = await database.execute<RegistrationRow[]>(
        'SELECT * FROM registration_requests WHERE school_id=? LIMIT 1', [schoolId],
      )
      const row = rows[0]
      if (!row || row.status !== 'PendingEmail') throw pending()
      if (row.code_sent_at && Date.now() - new Date(row.code_sent_at).getTime() < 60_000) {
        throw new HttpError(429, 'CODE_RESEND_WAIT', 'Wait one minute before requesting another code.')
      }
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
      await database.execute(
        `UPDATE registration_requests SET code_hash=?,code_expires_at=?,code_sent_at=NOW(),code_attempts=0,updated_at=NOW()
         WHERE request_id=? AND status='PendingEmail'`,
        [codeDigest(row.request_id, code), new Date(Date.now() + 10 * 60_000), row.request_id],
      )
      await sendCode(row.email, code)
      return { status: 'PendingEmail' }
    },

    async verify(body: unknown) {
      requireSupabase()
      const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
      const schoolId = normalizeSchoolId(input.school_id)
      const code = typeof input.code === 'string' ? input.code.trim() : ''
      if (!/^[0-9]{6}$/.test(code)) throw new HttpError(422, 'CODE_INVALID', 'Enter the six-digit verification code.')
      const connection = await database.getConnection()
      await connection.beginTransaction()
      let committed = false
      try {
        const [rows] = await connection.execute<RegistrationRow[]>(
          'SELECT * FROM registration_requests WHERE school_id=? LIMIT 1 FOR UPDATE', [schoolId],
        )
        const row = rows[0]
        if (!row || row.status !== 'PendingEmail') throw pending()
        if (!row.code_hash || !row.code_expires_at || new Date(row.code_expires_at).getTime() <= Date.now() || row.code_attempts >= 5) {
          throw new HttpError(422, 'CODE_EXPIRED', 'The code expired or had too many attempts. Request another code.')
        }
        const supplied = Buffer.from(codeDigest(row.request_id, code), 'hex')
        const expected = Buffer.from(row.code_hash, 'hex')
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
          await connection.execute('UPDATE registration_requests SET code_attempts=code_attempts+1 WHERE request_id=?', [row.request_id])
          await connection.commit()
          committed = true
          throw new HttpError(422, 'CODE_INVALID', 'The verification code is incorrect.')
        }
        await connection.execute(
          `UPDATE registration_requests SET status='PendingApproval',email_verified_at=NOW(),code_hash=NULL,code_expires_at=NULL,updated_at=NOW()
           WHERE request_id=?`,
          [row.request_id],
        )
        await connection.commit()
        committed = true
        return { status: 'PendingApproval', role: row.requested_role }
      } catch (error) {
        if (!committed) await connection.rollback()
        throw error
      } finally { connection.release() }
    },

    async pendingApprovals() {
      requireSupabase()
      const [rows] = await database.execute<RowDataPacket[]>(
        `SELECT request_id,school_id,email,first_name,last_name,requested_role,email_verified_at,created_at
           FROM registration_requests WHERE status='PendingApproval' ORDER BY created_at ASC LIMIT 100`, [],
      )
      return rows
    },

    async review(requestId: number, actorAccountId: number, decision: string) {
      requireSupabase()
      if (!Number.isSafeInteger(requestId) || requestId < 1 || !Number.isSafeInteger(actorAccountId) || actorAccountId < 1) {
        throw new HttpError(422, 'REVIEW_INVALID', 'Select a valid registration request.')
      }
      if (!['approve', 'reject'].includes(decision)) {
        throw new HttpError(422, 'REVIEW_INVALID', 'Choose approve or reject.')
      }
      const connection = await database.getConnection()
      await connection.beginTransaction()
      try {
        const [rows] = await connection.execute<RegistrationRow[]>(
          'SELECT * FROM registration_requests WHERE request_id=? LIMIT 1 FOR UPDATE', [requestId],
        )
        const row = rows[0]
        if (!row || row.status !== 'PendingApproval') throw pending()
        if (decision === 'approve') await createActiveAccount(connection, row)
        const status = decision === 'approve' ? 'Completed' : 'Rejected'
        await connection.execute(
          'UPDATE registration_requests SET status=?,reviewed_by_account_id=?,reviewed_at=NOW(),review_reason=?,password_hash=NULL,updated_at=NOW() WHERE request_id=?',
          [status, actorAccountId, decision === 'approve' ? 'Account registration approved by Admin.' : 'Account registration rejected by Admin.', requestId],
        )
        await connection.commit()
        return { requestId, status }
      } catch (error) {
        await connection.rollback()
        throw error
      } finally { connection.release() }
    },
  }
}

export const registrationService = createRegistrationService()
