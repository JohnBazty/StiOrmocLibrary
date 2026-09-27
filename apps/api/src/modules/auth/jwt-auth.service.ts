import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { validateLoginInput } from './auth.validation.js'
import { validateRoleLogin } from './account-auth.validation.ts'

export type JwtRole = 'Admin' | 'Librarian' | 'Student' | 'Faculty' | 'Staff'
const JWT_ROLES = new Set<JwtRole>(['Admin', 'Librarian', 'Student', 'Faculty', 'Staff'])
const DUMMY_BCRYPT_HASH = '$2b$12$k1Pc4Uvw2o.7wwBZ1hQwHu5vTfEfRPRgRhhcaawYWpPJez0o7gaCq'
const INVALID_CREDENTIALS_MESSAGE = 'Invalid school ID, password, or selected role.'

export function dashboardForJwtRole(role: JwtRole) {
  return ({ Admin: '/admin/dashboard', Librarian: '/librarian/dashboard', Faculty: '/faculty/dashboard', Student: '/student/dashboard', Staff: '/staff/dashboard' })[role]
}

function isLegacyEmailLogin(body: unknown) {
  return Boolean(body && typeof body === 'object' && 'email' in body && !('school_id' in body) && !('login_as' in body))
}

export function createJwtAuthService(database: Pool = db, passwordHasher = bcrypt, tokenSigner = jwt) {
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
              a.account_id,a.account_status AS linked_status,a.auth_version
         FROM users u LEFT JOIN accounts a ON a.user_id=u.user_id WHERE u.email = ? LIMIT 1`, [validation.email],
    )
    const user = rows[0]
    const matches = await passwordHasher.compare(validation.password, user?.password_hash ?? DUMMY_BCRYPT_HASH)
    if (!user || !matches) throw new HttpError(401, 'INVALID_CREDENTIALS', 'The email address or password is incorrect.')
    if (user.account_status !== 'Active') throw new HttpError(403, 'ACCOUNT_DEACTIVATED', 'Your account is currently deactivated. Please coordinate with the campus librarian.')
    if (!user.account_id || user.linked_status !== 'Active') throw new HttpError(403, 'ACCOUNT_DEACTIVATED', 'Your account needs to be active and linked. Please coordinate with the campus librarian.')
    if (!JWT_ROLES.has(user.user_role)) throw new HttpError(403, 'ROLE_NOT_AUTHORIZED', 'Your assigned role is not authorized.')
    const accountId = Number(user.account_id)
    const role = user.user_role as JwtRole
    return {
      token: issueToken(accountId, String(user.school_id), role, Number(user.auth_version ?? 1)), tokenType: 'Bearer', expiresIn: env.jwt.expiresInSeconds,
      user: { id: accountId, accountId, schoolId: user.school_id, fullName: user.full_name, email: user.email, role },
      redirect: dashboardForJwtRole(role),
    }
  }

  return {
    async login(body: unknown) {
      // Preserve the pre-existing email-based JWT client while new clients move
      // to the explicit school_id/login_as contract.
      if (isLegacyEmailLogin(body)) return loginWithLegacyEmail(body)

      const validation = validateRoleLogin(body)
      if (!validation.isValid) throw new HttpError(422, 'AUTH_VALIDATION_FAILED', 'Please correct the highlighted fields.', { errors: validation.errors })
      const [rows] = await database.execute<RowDataPacket[]>(
        `SELECT a.account_id, a.school_id, a.password_hash, a.role, a.account_status, a.auth_version,
                u.account_status AS linked_status,
                sp.first_name, sp.last_name, u.full_name
           FROM accounts AS a
           LEFT JOIN users AS u ON u.user_id = a.user_id
           LEFT JOIN student_profiles AS sp ON sp.account_id = a.account_id
          WHERE a.school_id = ? AND a.role = ?
          LIMIT 1`,
        [validation.schoolId, validation.role],
      )
      const account = rows[0]
      if (!account) {
        const [requests] = await database.execute<RowDataPacket[]>(
          'SELECT status,password_hash FROM registration_requests WHERE school_id=? AND requested_role=? LIMIT 1',
          [validation.schoolId, validation.role],
        )
        const pendingRequest = requests[0]
        if (pendingRequest?.password_hash && await passwordHasher.compare(validation.password, pendingRequest.password_hash)) {
          if (pendingRequest.status === 'PendingEmail') throw new HttpError(403, 'EMAIL_VERIFICATION_REQUIRED', 'Verify the code sent to your school email before signing in.')
          if (pendingRequest.status === 'PendingApproval') throw new HttpError(403, 'ACCOUNT_APPROVAL_PENDING', 'Your school email is verified. An administrator must approve this role before you can sign in.')
        }
      }
      const matches = await passwordHasher.compare(validation.password, account?.password_hash ?? DUMMY_BCRYPT_HASH)
      if (!account || !matches) throw new HttpError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE)
      if (account.account_status !== 'Active' || (account.linked_status && account.linked_status !== 'Active')) throw new HttpError(403, 'ACCOUNT_DEACTIVATED', 'Your account is currently deactivated. Please coordinate with the campus librarian.')
      if (!JWT_ROLES.has(account.role)) throw new HttpError(403, 'ROLE_NOT_AUTHORIZED', 'Your assigned role is not authorized.')

      const accountId = Number(account.account_id)
      const role = account.role as JwtRole
      const fullName = [account.first_name, account.last_name].filter(Boolean).join(' ') || account.full_name || null
      return {
        token: issueToken(accountId, String(account.school_id), role, Number(account.auth_version ?? 1)), tokenType: 'Bearer', expiresIn: env.jwt.expiresInSeconds,
        user: { id: accountId, accountId, schoolId: account.school_id, fullName, role },
        redirect: dashboardForJwtRole(role),
      }
    },
  }
}

export const jwtAuthService = createJwtAuthService()
