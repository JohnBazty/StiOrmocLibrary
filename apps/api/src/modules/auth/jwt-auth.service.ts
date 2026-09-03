import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { validateLoginInput } from './auth.validation.js'
import { validateAccountRegistration, validateRoleLogin } from './account-auth.validation.ts'

export type JwtRole = 'Admin' | 'Librarian' | 'Student' | 'Faculty'
const JWT_ROLES = new Set<JwtRole>(['Admin', 'Librarian', 'Student', 'Faculty'])
const DUMMY_BCRYPT_HASH = '$2b$12$k1Pc4Uvw2o.7wwBZ1hQwHu5vTfEfRPRgRhhcaawYWpPJez0o7gaCq'
const INVALID_CREDENTIALS_MESSAGE = 'Invalid school ID, password, or selected role.'

export function dashboardForJwtRole(role: JwtRole) {
  return ({ Admin: '/admin/dashboard', Librarian: '/librarian/dashboard', Faculty: '/faculty/dashboard', Student: '/student/dashboard' })[role]
}

function isLegacyEmailLogin(body: unknown) {
  return Boolean(body && typeof body === 'object' && 'email' in body && !('school_id' in body) && !('login_as' in body))
}

function duplicateSchoolIdError() {
  return new HttpError(422, 'SCHOOL_ID_ALREADY_REGISTERED', 'This school ID is already registered.', {
    errors: { school_id: 'This school ID is already registered.' },
  })
}

function isDuplicateEntry(error: unknown) {
  return (error as { code?: string } | null)?.code === 'ER_DUP_ENTRY'
}

export function createJwtAuthService(database: Pool = db, passwordHasher = bcrypt, tokenSigner = jwt) {
  function issueToken(accountId: number, schoolId: string, role: JwtRole) {
    return tokenSigner.sign(
      { accountId, userId: accountId, schoolId, role },
      env.jwt.secret,
      {
        algorithm: 'HS256', expiresIn: env.jwt.expiresInSeconds,
        issuer: env.jwt.issuer, audience: env.jwt.audience, subject: String(accountId),
      },
    )
  }

  async function loginWithLegacyEmail(body: unknown) {
    const validation = validateLoginInput(body)
    if (!validation.isValid) throw new HttpError(422, 'AUTH_VALIDATION_FAILED', 'Please correct the highlighted fields.', { errors: validation.errors })
    const [rows] = await database.execute<RowDataPacket[]>(
      `SELECT user_id, school_id, full_name, email, password_hash, user_role, account_status
         FROM users WHERE email = ? LIMIT 1`, [validation.email],
    )
    const user = rows[0]
    const matches = await passwordHasher.compare(validation.password, user?.password_hash ?? DUMMY_BCRYPT_HASH)
    if (!user || !matches) throw new HttpError(401, 'INVALID_CREDENTIALS', 'The email address or password is incorrect.')
    if (user.account_status !== 'Active') throw new HttpError(403, 'ACCOUNT_DEACTIVATED', 'Your account is currently deactivated. Please coordinate with the campus librarian.')
    if (!JWT_ROLES.has(user.user_role)) throw new HttpError(403, 'ROLE_NOT_AUTHORIZED', 'Your assigned role is not authorized.')
    const accountId = Number(user.user_id)
    const role = user.user_role as JwtRole
    return {
      token: issueToken(accountId, String(user.school_id), role), tokenType: 'Bearer', expiresIn: env.jwt.expiresInSeconds,
      user: { id: accountId, accountId, schoolId: user.school_id, fullName: user.full_name, email: user.email, role },
      redirect: dashboardForJwtRole(role),
    }
  }

  return {
    async register(body: unknown) {
      const validation = validateAccountRegistration(body)
      if (!validation.isValid) throw new HttpError(422, 'AUTH_VALIDATION_FAILED', 'Please correct the highlighted fields.', { errors: validation.errors })

      const [existingRows] = await database.execute<RowDataPacket[]>(
        'SELECT account_id FROM accounts WHERE school_id = ? LIMIT 1', [validation.schoolId],
      )
      if (existingRows.length > 0) throw duplicateSchoolIdError()

      // Hash outside the transaction so bcrypt work does not hold database locks.
      const passwordHash = await passwordHasher.hash(validation.password, 12)
      const connection = await database.getConnection()
      let transactionStarted = false
      try {
        await connection.beginTransaction()
        transactionStarted = true
        const [lockedRows] = await connection.execute<RowDataPacket[]>(
          'SELECT account_id FROM accounts WHERE school_id = ? LIMIT 1 FOR UPDATE', [validation.schoolId],
        )
        if (lockedRows.length > 0) throw duplicateSchoolIdError()

        const [accountResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO accounts
             (school_id, contact_number, password_hash, role, account_status)
           VALUES (?, ?, ?, 'Student', 'Active')`,
          [validation.schoolId, validation.contactNumber, passwordHash],
        )
        const accountId = Number(accountResult.insertId)
        const fullName = `${validation.firstName} ${validation.lastName}`.trim()
        const [userResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO users
             (role_id, user_role, institutional_id, school_id, full_name, email,
              password_hash, educational_level, course_or_strand, account_status)
           SELECT role_id, 'Student', ?, ?, ?, ?, ?, 'College', ?, 'Active'
             FROM roles WHERE role_name = 'Student' LIMIT 1`,
          [validation.schoolId, validation.schoolId, fullName,
            `account.${accountId}@ormoc.sti.edu.ph`, passwordHash, validation.programStrand],
        )
        await connection.execute<ResultSetHeader>(
          'UPDATE accounts SET user_id = ?, updated_at = NOW() WHERE account_id = ?',
          [userResult.insertId, accountId],
        )
        await connection.execute<ResultSetHeader>(
          `INSERT INTO student_profiles
             (account_id, first_name, last_name, program_strand, year_grade_level)
           VALUES (?, ?, ?, ?, ?)`,
          [accountId, validation.firstName, validation.lastName, validation.programStrand, validation.yearGradeLevel],
        )
        await connection.commit()
        return {
          account: {
            id: accountId, schoolId: validation.schoolId, role: 'Student' as const,
            firstName: validation.firstName, lastName: validation.lastName,
          },
        }
      } catch (error) {
        if (transactionStarted) await connection.rollback()
        if (isDuplicateEntry(error)) throw duplicateSchoolIdError()
        throw error
      } finally {
        connection.release()
      }
    },

    async login(body: unknown) {
      // Preserve the pre-existing email-based JWT client while new clients move
      // to the explicit school_id/login_as contract.
      if (isLegacyEmailLogin(body)) return loginWithLegacyEmail(body)

      const validation = validateRoleLogin(body)
      if (!validation.isValid) throw new HttpError(422, 'AUTH_VALIDATION_FAILED', 'Please correct the highlighted fields.', { errors: validation.errors })
      const [rows] = await database.execute<RowDataPacket[]>(
        `SELECT a.account_id, a.school_id, a.password_hash, a.role, a.account_status,
                sp.first_name, sp.last_name
           FROM accounts AS a
           LEFT JOIN student_profiles AS sp ON sp.account_id = a.account_id
          WHERE a.school_id = ? AND a.role = ?
          LIMIT 1`,
        [validation.schoolId, validation.role],
      )
      const account = rows[0]
      const matches = await passwordHasher.compare(validation.password, account?.password_hash ?? DUMMY_BCRYPT_HASH)
      if (!account || !matches) throw new HttpError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE)
      if (account.account_status !== 'Active') throw new HttpError(403, 'ACCOUNT_DEACTIVATED', 'Your account is currently deactivated. Please coordinate with the campus librarian.')
      if (!JWT_ROLES.has(account.role)) throw new HttpError(403, 'ROLE_NOT_AUTHORIZED', 'Your assigned role is not authorized.')

      const accountId = Number(account.account_id)
      const role = account.role as JwtRole
      const fullName = [account.first_name, account.last_name].filter(Boolean).join(' ') || null
      return {
        token: issueToken(accountId, String(account.school_id), role), tokenType: 'Bearer', expiresIn: env.jwt.expiresInSeconds,
        user: { id: accountId, accountId, schoolId: account.school_id, fullName, role },
        redirect: dashboardForJwtRole(role),
      }
    },
  }
}

export const jwtAuthService = createJwtAuthService()
