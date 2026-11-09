import { randomBytes } from 'node:crypto'
import bcrypt from 'bcrypt'
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { issueAttendanceCredential } from '../attendance/attendance-credential.service.ts'
import { validateAccountRegistration } from './account-auth.validation.ts'

type RegistrationRow = { school_id: string; email: string; first_name: string; last_name: string;
  program_strand: string | null; year_grade_level: string | null;
  requested_role: 'Student' | 'Faculty' | 'Librarian' | 'Staff'; password_hash: string | null;
}
const duplicate = () => new HttpError(422, 'REGISTRATION_UNAVAILABLE', 'These details may already be in the library system. Try signing in with your original School ID and password, or contact the library for account help. The password entered here was not saved.')
const pending = () => new HttpError(422, 'REGISTRATION_NOT_READY', 'The registration request is not ready for this action.')

export async function createActiveAccount(connection: PoolConnection, row: Pick<RegistrationRow,
  'school_id' | 'email' | 'first_name' | 'last_name' | 'program_strand' | 'year_grade_level' | 'requested_role' | 'password_hash'>, officialName?: string) {
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
  const fullName = officialName ?? `${row.first_name} ${row.last_name}`.trim()
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

export async function createStaffAccount(actor: number, body: unknown, database: Pool = db, driver = env.db.driver) {
  if (driver !== 'postgres') throw new HttpError(503, 'SUPABASE_REQUIRED', 'Staff account setup requires Postgres.')
  const supplied = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  if (supplied.role !== undefined && supplied.role !== 'Staff') throw new HttpError(422, 'STAFF_ROLE_REQUIRED', 'This form creates Staff accounts.')
  // Staff use their school mailbox to set their own password. This random credential is never shared.
  const secret = randomBytes(32).toString('hex')
  const input = validateAccountRegistration({ ...supplied, role: 'Staff', password: secret, confirm_password: secret })
  if (!input.isValid || `${input.firstName} ${input.lastName}`.length > 150) {
    throw new HttpError(422, 'AUTH_VALIDATION_FAILED', 'Enter a valid Staff name, School ID and Ormoc school email.', { errors: input.errors })
  }
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    await requireLibraryActor(connection, actor, 'accounts.manage')
    const accountId = await createActiveAccount(connection, {
      school_id: input.schoolId, email: input.schoolEmail, first_name: input.firstName, last_name: input.lastName,
      requested_role: 'Staff', program_strand: null, year_grade_level: null, password_hash: await bcrypt.hash(secret, 12),
    })
    await connection.execute(`INSERT INTO account_management_events
      (account_id,actor_account_id,action_code,new_status,reason)
      VALUES (?,?,'StaffAccountCreated','Active','Staff account set up by the library administrator.')`, [accountId, actor])
    await connection.commit()
    return { accountId, schoolId: input.schoolId }
  } catch (error) {
    await connection.rollback()
    if ((error as { code?: string } | null)?.code === '23505') throw duplicate()
    throw error
  } finally { connection.release() }
}
