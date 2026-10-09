import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { validateLoginInput } from './auth.validation.js'
import { validateAccountRegistration, validateRoleLogin } from './account-auth.validation.ts'
import { issueAttendanceCredential } from '../attendance/attendance-credential.service.ts'
import { createAuthSessionRepository, type AuthSessionRepository } from './auth-session.repository.ts'
import { isCanonicalRole, toCanonicalRole, type CanonicalRole } from './role-normalization.ts'

export type JwtRole = CanonicalRole
const JWT_ROLES = new Set<JwtRole>(['Admin', 'Student', 'Faculty'])
const DUMMY_BCRYPT_HASH = '$2b$12$k1Pc4Uvw2o.7wwBZ1hQwHu5vTfEfRPRgRhhcaawYWpPJez0o7gaCq'
const INVALID_CREDENTIALS_MESSAGE = 'Invalid school ID or password.'
const USER_PORTAL_ROLES = new Set<JwtRole>(['Student', 'Faculty'])

export function dashboardForJwtRole(role: JwtRole) {
  return ({ Admin: '/admin/dashboard', Faculty: '/faculty/dashboard', Student: '/student/dashboard' })[role]
}

function isLegacyEmailLogin(body: unknown) {
  return Boolean(
    body && typeof body === 'object'
    && 'email' in body
    && !('school_id' in body)
    && !('login_as' in body)
    && !('portal' in body),
  )
}

function duplicateSchoolIdError() {
  return new HttpError(422, 'SCHOOL_ID_ALREADY_REGISTERED', 'This school ID is already registered.', {
    errors: { school_id: 'This school ID is already registered.' },
  })
}

function isDuplicateEntry(error: unknown) {
  return (error as { code?: string } | null)?.code === 'ER_DUP_ENTRY'
}

export function createJwtAuthService(
  database: Pool = db,
  passwordHasher = bcrypt,
  tokenSigner = jwt,
  sessions: AuthSessionRepository = createAuthSessionRepository(database),
) {
  function issueToken(accountId: number, schoolId: string, role: JwtRole, authVersion = 1) {
    return tokenSigner.sign(
      { accountId, userId: accountId, schoolId, role, authVersion },
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
      `SELECT u.user_id,u.school_id,u.full_name,u.email,u.password_hash,u.user_role,u.account_status,
              a.account_id,a.account_status AS linked_status,a.auth_version,a.role AS account_role
         FROM users u LEFT JOIN accounts a ON a.user_id=u.user_id WHERE u.email = ? LIMIT 1`, [validation.email],
    )
    const user = rows[0]
    const matches = await passwordHasher.compare(validation.password, user?.password_hash ?? DUMMY_BCRYPT_HASH)
    if (!user || !matches) throw new HttpError(401, 'INVALID_CREDENTIALS', 'The email address or password is incorrect.')
    if (user.account_status !== 'Active') throw new HttpError(403, 'ACCOUNT_DEACTIVATED', 'Your account is currently deactivated. Please coordinate with the campus librarian.')
    if (!user.account_id || user.linked_status !== 'Active') throw new HttpError(403, 'ACCOUNT_DEACTIVATED', 'Your account needs to be active and linked. Please coordinate with the campus librarian.')
    const role = toCanonicalRole(user.account_role ?? user.user_role)
    if (!role || !JWT_ROLES.has(role)) throw new HttpError(403, 'ROLE_NOT_AUTHORIZED', 'Your assigned role is not authorized.')
    const accountId = Number(user.account_id)
    const userId = Number(user.user_id)
    const authVersion = await sessions.incrementAuthVersionForAccount(accountId)
    await sessions.clearAllSessionsForUser(userId)
    return {
      token: issueToken(accountId, String(user.school_id), role, authVersion), tokenType: 'Bearer', expiresIn: env.jwt.expiresInSeconds,
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
        await issueAttendanceCredential(connection, Number(userResult.insertId))
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
      if (isLegacyEmailLogin(body)) return loginWithLegacyEmail(body)

      const validation = validateRoleLogin(body)
      if (!validation.isValid) throw new HttpError(422, 'AUTH_VALIDATION_FAILED', 'Please correct the highlighted fields.', { errors: validation.errors })

      const staffLogin = validation.portal === 'staff' || validation.role === 'Admin'
      const userPortalLogin = validation.portal === 'user'
      // During compatibility, Admin/staff login matches stored Admin or legacy Librarian rows.
      // User portal looks up by school_id only so the client no longer picks Student vs Faculty.
      const [rows] = await database.execute<RowDataPacket[]>(
        staffLogin
          ? `SELECT a.account_id, a.user_id, a.school_id, a.password_hash, a.role, a.account_status, a.auth_version,
                    u.account_status AS linked_status,
                    sp.first_name, sp.last_name
               FROM accounts AS a
               LEFT JOIN users AS u ON u.user_id = a.user_id
               LEFT JOIN student_profiles AS sp ON sp.account_id = a.account_id
              WHERE a.school_id = ? AND a.role IN ('Admin', 'Librarian')
              LIMIT 1`
          : userPortalLogin
            ? `SELECT a.account_id, a.user_id, a.school_id, a.password_hash, a.role, a.account_status, a.auth_version,
                      u.account_status AS linked_status,
                      sp.first_name, sp.last_name
                 FROM accounts AS a
                 LEFT JOIN users AS u ON u.user_id = a.user_id
                 LEFT JOIN student_profiles AS sp ON sp.account_id = a.account_id
                WHERE a.school_id = ?
                LIMIT 1`
            : `SELECT a.account_id, a.user_id, a.school_id, a.password_hash, a.role, a.account_status, a.auth_version,
                      u.account_status AS linked_status,
                      sp.first_name, sp.last_name
                 FROM accounts AS a
                 LEFT JOIN users AS u ON u.user_id = a.user_id
                 LEFT JOIN student_profiles AS sp ON sp.account_id = a.account_id
                WHERE a.school_id = ? AND a.role = ?
                LIMIT 1`,
        staffLogin || userPortalLogin ? [validation.schoolId] : [validation.schoolId, validation.role],
      )
      const account = rows[0]
      const matches = await passwordHasher.compare(validation.password, account?.password_hash ?? DUMMY_BCRYPT_HASH)
      if (!account || !matches) throw new HttpError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE)
      if (account.account_status !== 'Active' || (account.linked_status && account.linked_status !== 'Active')) throw new HttpError(403, 'ACCOUNT_DEACTIVATED', 'Your account is currently deactivated. Please coordinate with the campus librarian.')
      const role = toCanonicalRole(account.role)
      if (!role || !isCanonicalRole(role)) {
        throw new HttpError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE)
      }
      if (userPortalLogin && !USER_PORTAL_ROLES.has(role)) {
        throw new HttpError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE)
      }
      if (staffLogin && role !== 'Admin') {
        throw new HttpError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE)
      }
      if (!userPortalLogin && !staffLogin && role !== validation.role) {
        throw new HttpError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE)
      }

      const accountId = Number(account.account_id)
      const fullName = [account.first_name, account.last_name].filter(Boolean).join(' ') || null
      const authVersion = await sessions.incrementAuthVersionForAccount(accountId)
      if (account.user_id) await sessions.clearAllSessionsForUser(Number(account.user_id))
      return {
        token: issueToken(accountId, String(account.school_id), role, authVersion), tokenType: 'Bearer', expiresIn: env.jwt.expiresInSeconds,
        user: { id: accountId, accountId, schoolId: account.school_id, fullName, role },
        redirect: dashboardForJwtRole(role),
      }
    },
  }
}

export const jwtAuthService = createJwtAuthService()
