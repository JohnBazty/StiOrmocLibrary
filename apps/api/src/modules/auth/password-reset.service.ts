import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { createPasswordResetMailer, type PasswordResetMailer } from './password-reset-mailer.ts'

const GENERIC_REQUEST_MESSAGE = 'If an eligible student account matches, a reset code was sent to the school email on file.'
const INSTITUTIONAL_EMAIL = /^[^\s@]+@(?:ormoc\.)?sti\.edu(?:\.ph)?$/i
const SYNTHETIC_EMAIL = /^account\.\d+@/i
const SCHOOL_ID_PATTERN = /^[A-Z0-9][A-Z0-9._-]{2,49}$/
const RESET_PURPOSE = 'password_reset'

type PasswordHasher = Pick<typeof bcrypt, 'hash' | 'compare'>
type TokenSigner = Pick<typeof jwt, 'sign' | 'verify'>

function hashOtp(otp: string) {
  return createHash('sha256').update(`${env.jwt.secret}:${otp}`).digest('hex')
}

function otpMatches(otp: string, storedHash: string) {
  const candidate = Buffer.from(hashOtp(otp), 'utf8')
  const expected = Buffer.from(storedHash, 'utf8')
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}

function normalizeIdentifier(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isInstitutionalDeliverableEmail(email: string) {
  return INSTITUTIONAL_EMAIL.test(email) && !SYNTHETIC_EMAIL.test(email)
}

function validateNewPassword(password: string, confirmPassword: string) {
  const errors: Record<string, string> = {}
  if (!password) errors.new_password = 'Password is required.'
  else if (password.length < 8) errors.new_password = 'Password must contain at least 8 characters.'
  else if (password.length > 72) errors.new_password = 'Password must not exceed 72 characters.'
  if (!confirmPassword) errors.confirm_password = 'Password confirmation is required.'
  else if (password !== confirmPassword) errors.confirm_password = 'Password confirmation does not match.'
  return errors
}

function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000)
}

export function createPasswordResetService(
  database: Pool = db,
  passwordHasher: PasswordHasher = bcrypt,
  tokenSigner: TokenSigner = jwt,
  mailer: PasswordResetMailer = createPasswordResetMailer(),
) {
  async function findStudentAccount(identifier: string) {
    const looksLikeEmail = identifier.includes('@')
    const schoolId = identifier.toUpperCase()
    const email = identifier.toLowerCase()
    const [rows] = await database.execute<RowDataPacket[]>(
      looksLikeEmail
        ? `SELECT a.account_id, a.school_id, a.password_hash, a.user_id, a.role, a.account_status, u.email AS user_email
             FROM accounts AS a
             LEFT JOIN users AS u ON u.user_id = a.user_id
            WHERE LOWER(u.email) = ?
            LIMIT 1`
        : `SELECT a.account_id, a.school_id, a.password_hash, a.user_id, a.role, a.account_status, u.email AS user_email
             FROM accounts AS a
             LEFT JOIN users AS u ON u.user_id = a.user_id
            WHERE a.school_id = ?
            LIMIT 1`,
      [looksLikeEmail ? email : schoolId],
    )
    return rows[0] ?? null
  }

  return {
    async requestReset(body: unknown) {
      const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
      const identifier = normalizeIdentifier(input.school_id_or_email)
      if (!identifier) {
        throw new HttpError(422, 'AUTH_VALIDATION_FAILED', 'Please correct the highlighted fields.', {
          errors: { school_id_or_email: 'Student ID or school email is required.' },
        })
      }
      if (!identifier.includes('@') && !SCHOOL_ID_PATTERN.test(identifier.toUpperCase())) {
        throw new HttpError(422, 'AUTH_VALIDATION_FAILED', 'Please correct the highlighted fields.', {
          errors: { school_id_or_email: 'Enter a valid Student ID or school email.' },
        })
      }
      if (identifier.includes('@') && !INSTITUTIONAL_EMAIL.test(identifier)) {
        throw new HttpError(422, 'AUTH_VALIDATION_FAILED', 'Please correct the highlighted fields.', {
          errors: { school_id_or_email: 'Use your official @ormoc.sti.edu.ph or @sti.edu email.' },
        })
      }

      const account = await findStudentAccount(identifier)
      if (account && account.role === 'Student' && account.account_status === 'Active') {
        const destination = typeof account.user_email === 'string' ? account.user_email.trim() : ''
        if (isInstitutionalDeliverableEmail(destination)) {
          const otp = String(randomInt(100000, 1000000))
          const otpHash = hashOtp(otp)
          const ttl = env.passwordReset.otpTtlMinutes
          await database.execute(
            `UPDATE password_reset_otps
                SET consumed_at = COALESCE(consumed_at, NOW()), updated_at = NOW()
              WHERE account_id = ? AND consumed_at IS NULL`,
            [account.account_id],
          )
          await database.execute(
            `INSERT INTO password_reset_otps
               (account_id, otp_hash, expires_at, failed_attempts, locked_until, consumed_at)
             VALUES (?, ?, ?, 0, NULL, NULL)`,
            [account.account_id, otpHash, minutesFromNow(ttl)],
          )
          try {
            await mailer.sendOtpEmail(destination, otp, ttl)
          } catch (error) {
            console.error('[password-reset] Failed to send OTP email.', error)
          }
        }
      }

      return { message: GENERIC_REQUEST_MESSAGE }
    },

    async verifyOtp(body: unknown) {
      const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
      const identifier = normalizeIdentifier(input.school_id_or_email)
      const otp = typeof input.otp === 'string' ? input.otp.trim() : ''
      const errors: Record<string, string> = {}
      if (!identifier) errors.school_id_or_email = 'Student ID or school email is required.'
      if (!/^\d{6}$/.test(otp)) errors.otp = 'Enter the 6-digit code from your email.'
      if (Object.keys(errors).length) {
        throw new HttpError(422, 'AUTH_VALIDATION_FAILED', 'Please correct the highlighted fields.', { errors })
      }

      const account = await findStudentAccount(identifier)
      if (!account || account.role !== 'Student' || account.account_status !== 'Active') {
        throw new HttpError(401, 'INVALID_RESET_CODE', 'The reset code is invalid or has expired.')
      }

      const [rows] = await database.execute<RowDataPacket[]>(
        `SELECT otp_id, otp_hash, expires_at, failed_attempts, locked_until, consumed_at
           FROM password_reset_otps
          WHERE account_id = ? AND consumed_at IS NULL
          ORDER BY otp_id DESC
          LIMIT 1`,
        [account.account_id],
      )
      const challenge = rows[0]
      if (!challenge) throw new HttpError(401, 'INVALID_RESET_CODE', 'The reset code is invalid or has expired.')

      const lockedUntil = challenge.locked_until ? new Date(challenge.locked_until) : null
      if (lockedUntil && lockedUntil.getTime() > Date.now()) {
        throw new HttpError(429, 'RESET_CODE_LOCKED', 'Too many incorrect codes. Please wait 15 minutes and try again.')
      }
      if (new Date(challenge.expires_at).getTime() <= Date.now()) {
        throw new HttpError(401, 'INVALID_RESET_CODE', 'The reset code is invalid or has expired.')
      }

      if (!otpMatches(otp, String(challenge.otp_hash))) {
        const failedAttempts = Number(challenge.failed_attempts) + 1
        const lock = failedAttempts >= env.passwordReset.maxFailedAttempts
        await database.execute(
          `UPDATE password_reset_otps
              SET failed_attempts = ?, locked_until = ?, updated_at = NOW()
            WHERE otp_id = ?`,
          [failedAttempts, lock ? minutesFromNow(env.passwordReset.lockMinutes) : null, challenge.otp_id],
        )
        if (lock) {
          throw new HttpError(429, 'RESET_CODE_LOCKED', 'Too many incorrect codes. Please wait 15 minutes and try again.')
        }
        throw new HttpError(401, 'INVALID_RESET_CODE', 'The reset code is invalid or has expired.')
      }

      await database.execute(
        `UPDATE password_reset_otps
            SET consumed_at = NOW(), failed_attempts = 0, locked_until = NULL, updated_at = NOW()
          WHERE otp_id = ?`,
        [challenge.otp_id],
      )

      const resetToken = tokenSigner.sign(
        {
          purpose: RESET_PURPOSE,
          accountId: Number(account.account_id),
          otpId: Number(challenge.otp_id),
          schoolId: String(account.school_id),
        },
        env.jwt.secret,
        {
          algorithm: 'HS256',
          expiresIn: env.passwordReset.resetTokenTtlSeconds,
          issuer: env.jwt.issuer,
          audience: env.jwt.audience,
          subject: String(account.account_id),
        },
      )

      return { resetToken }
    },

    async confirmReset(body: unknown) {
      const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
      const resetToken = typeof input.reset_token === 'string' ? input.reset_token.trim() : ''
      const newPassword = typeof input.new_password === 'string' ? input.new_password : ''
      const confirmPassword = typeof input.confirm_password === 'string' ? input.confirm_password : ''
      const fieldErrors = validateNewPassword(newPassword, confirmPassword)
      if (!resetToken) fieldErrors.reset_token = 'Reset token is required.'
      if (Object.keys(fieldErrors).length) {
        throw new HttpError(422, 'AUTH_VALIDATION_FAILED', 'Please correct the highlighted fields.', { errors: fieldErrors })
      }

      let claims: jwt.JwtPayload
      try {
        claims = tokenSigner.verify(resetToken, env.jwt.secret, {
          algorithms: ['HS256'],
          issuer: env.jwt.issuer,
          audience: env.jwt.audience,
        }) as jwt.JwtPayload
      } catch {
        throw new HttpError(401, 'INVALID_RESET_TOKEN', 'The password reset session is invalid or has expired.')
      }
      if (claims.purpose !== RESET_PURPOSE || !Number.isSafeInteger(claims.accountId)) {
        throw new HttpError(401, 'INVALID_RESET_TOKEN', 'The password reset session is invalid or has expired.')
      }

      const accountId = Number(claims.accountId)
      const [accountRows] = await database.execute<RowDataPacket[]>(
        `SELECT account_id, user_id, password_hash, role, account_status
           FROM accounts WHERE account_id = ? LIMIT 1`,
        [accountId],
      )
      const account = accountRows[0]
      if (!account || account.role !== 'Student' || account.account_status !== 'Active') {
        throw new HttpError(401, 'INVALID_RESET_TOKEN', 'The password reset session is invalid or has expired.')
      }

      const [historyRows] = await database.execute<RowDataPacket[]>(
        `SELECT password_hash FROM account_password_history
          WHERE account_id = ?
          ORDER BY history_id DESC
          LIMIT ?`,
        [accountId, env.passwordReset.historyLimit],
      )
      const priorHashes = [String(account.password_hash), ...historyRows.map((row) => String(row.password_hash))]
      for (const priorHash of priorHashes) {
        if (await passwordHasher.compare(newPassword, priorHash)) {
          throw new HttpError(422, 'PASSWORD_REUSED', 'Choose a completely new password that you have not used before.', {
            errors: { new_password: 'Choose a completely new password that you have not used before.' },
          })
        }
      }

      const nextHash = await passwordHasher.hash(newPassword, 12)
      const connection = await database.getConnection()
      let started = false
      try {
        await connection.beginTransaction()
        started = true
        await connection.execute(
          `INSERT INTO account_password_history (account_id, password_hash)
           VALUES (?, ?)`,
          [accountId, account.password_hash],
        )
        await connection.execute(
          `UPDATE accounts SET password_hash = ?, updated_at = NOW() WHERE account_id = ?`,
          [nextHash, accountId],
        )
        if (account.user_id) {
          await connection.execute(
            `UPDATE users SET password_hash = ? WHERE user_id = ?`,
            [nextHash, account.user_id],
          )
        }
        const [keepRows] = await connection.execute<RowDataPacket[]>(
          `SELECT history_id FROM account_password_history
            WHERE account_id = ?
            ORDER BY history_id DESC
            LIMIT ?`,
          [accountId, env.passwordReset.historyLimit],
        )
        const keepIds = keepRows.map((row) => Number(row.history_id)).filter((id) => Number.isSafeInteger(id))
        if (keepIds.length) {
          await connection.execute(
            `DELETE FROM account_password_history
              WHERE account_id = ?
                AND history_id NOT IN (${keepIds.map(() => '?').join(', ')})`,
            [accountId, ...keepIds],
          )
        }
        await connection.commit()
      } catch (error) {
        if (started) await connection.rollback()
        throw error
      } finally {
        connection.release()
      }

      return { message: 'Password updated successfully.' }
    },
  }
}

export const passwordResetService = createPasswordResetService()
