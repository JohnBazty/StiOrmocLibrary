import { createHmac, randomInt, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcrypt'
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { sendSchoolPasswordResetCode } from './school-email.sender.ts'

type Account = RowDataPacket & { account_id: number; user_id: number; email: string; password_hash: string; auth_version: number }
type Challenge = RowDataPacket & {
  public_id: string; account_version: number; code_hash: string | null; code_expires_at: Date;
  code_attempts: number; locked_until: Date | null; code_sent_at: Date;
  reset_token_hash: string | null; reset_expires_at: Date | null;
}
const CODE_LIFETIME = 10 * 60_000
const LOCK_LIFETIME = 15 * 60_000
const RESET_LIFETIME = 5 * 60_000
const PUBLIC_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const neutralMessage = 'If an active student account matches, a six-digit code will be sent to its school email. Check your inbox and junk folder. If no code arrives, wait one minute and try again or contact the library.'
const invalidCode = () => new HttpError(422, 'RECOVERY_CODE_INVALID', 'The code is incorrect, expired, or already used. Request a new code if needed.')
const locked = () => new HttpError(429, 'RECOVERY_LOCKED', 'Three incorrect codes were entered. Wait 15 minutes before requesting or verifying another code. Normal login is still available.')
const invalidReset = () => new HttpError(422, 'RECOVERY_TOKEN_INVALID', 'This password reset has expired or already been used. Start again.')
const digest = (id: string, value: string) => createHmac('sha256', env.jwt.secret).update(`password-recovery:${id}:${value}`).digest('hex')
const matches = (stored: string | null, id: string, value: string) => {
  if (!stored || !/^[a-f0-9]{64}$/.test(stored)) return false
  return timingSafeEqual(Buffer.from(stored, 'hex'), Buffer.from(digest(id, value), 'hex'))
}
const future = (value: Date | null, now: number) => value != null && new Date(value).getTime() > now
const object = (body: unknown) => body && typeof body === 'object' ? body as Record<string, unknown> : {}

export function createPasswordRecoveryService(
  database: Pool = db,
  sendCode: (email: string, code: string) => Promise<void> = sendSchoolPasswordResetCode,
  passwordHasher = bcrypt,
  now = Date.now,
  newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0'),
) {
  // Always lock the account before its challenge, including concurrent resends/resets.
  async function transaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      const result = await work(connection)
      await connection.commit()
      return result
    } catch (error) { await connection.rollback(); throw error }
    finally { connection.release() }
  }
  async function eligible(connection: PoolConnection, clause: string, values: Array<string | number>) {
    const [rows] = await connection.execute<Account[]>(`SELECT a.account_id,a.user_id,a.password_hash,a.auth_version,u.email
      FROM accounts a JOIN users u ON u.user_id=a.user_id
      WHERE ${clause} AND a.role='Student' AND a.account_status='Active' AND u.account_status='Active'
      FOR UPDATE OF a,u`, values)
    const account = rows[0]
    return account && /^[^\s@]+@ormoc\.sti\.edu\.ph$/i.test(account.email) ? account : null
  }
  async function loadChallenge(connection: PoolConnection, publicId: string) {
    const [lookup] = await connection.execute<RowDataPacket[]>('SELECT account_id FROM account_recovery_challenges WHERE public_id=?', [publicId])
    if (!lookup.length) return null
    const account = await eligible(connection, 'a.account_id=?', [lookup[0].account_id])
    if (!account) return null
    const [rows] = await connection.execute<Challenge[]>('SELECT * FROM account_recovery_challenges WHERE account_id=? AND public_id=? FOR UPDATE', [account.account_id, publicId])
    const challenge = rows[0]
    return challenge && Number(challenge.account_version) === Number(account.auth_version) ? { account, challenge } : null
  }
  return {
    async request(body: unknown) {
      const input = object(body)
      const identifier = String(input.identifier ?? '').trim()
      if (!identifier || identifier.length > 254) throw new HttpError(422, 'AUTH_VALIDATION_FAILED', 'Enter your School ID or school email.')
      const publicId = randomUUID()
      const timestamp = now()
      const delivery = await transaction(async connection => {
        const account = await eligible(connection, '(UPPER(a.school_id)=? OR LOWER(u.email)=?)', [identifier.toUpperCase(), identifier.toLowerCase()])
        if (!account) return null
        const [rows] = await connection.execute<Challenge[]>('SELECT * FROM account_recovery_challenges WHERE account_id=? FOR UPDATE', [account.account_id])
        const previous = rows[0]
        // Neutral request responses do not reveal membership, cooldowns or lock status.
        if (previous && (future(previous.locked_until, timestamp) || new Date(previous.code_sent_at).getTime() + 60_000 > timestamp)) return null
        const code = newCode()
        // Resending cannot erase failed attempts. Only an expired lock resets the counter.
        const attempts = previous?.locked_until && !future(previous.locked_until, timestamp) ? 0 : Number(previous?.code_attempts ?? 0)
        await connection.execute(`INSERT INTO account_recovery_challenges
          (account_id,public_id,account_version,code_hash,code_expires_at,code_sent_at,code_attempts)
          VALUES (?,?,?,?,?,?,?) ON CONFLICT (account_id) DO UPDATE SET
          public_id=EXCLUDED.public_id,account_version=EXCLUDED.account_version,code_hash=EXCLUDED.code_hash,
          code_expires_at=EXCLUDED.code_expires_at,code_sent_at=EXCLUDED.code_sent_at,code_attempts=EXCLUDED.code_attempts,
          locked_until=NULL,reset_token_hash=NULL,reset_expires_at=NULL,updated_at=NOW()`,
        [account.account_id, publicId, account.auth_version, digest(publicId, code), new Date(timestamp + CODE_LIFETIME), new Date(timestamp), attempts])
        return { email: account.email, code }
      })
      if (delivery) {
        try { await sendCode(delivery.email, delivery.code) }
        catch {
          await database.execute('UPDATE account_recovery_challenges SET code_hash=NULL WHERE public_id=?', [publicId])
          console.warn('[Password recovery] Email delivery failed. No recipient or code is logged.')
        }
      }
      return { challengeId: publicId, message: neutralMessage }
    },
    async verify(body: unknown) {
      const input = object(body)
      const publicId = String(input.challenge_id ?? '')
      const code = String(input.code ?? '')
      if (!PUBLIC_ID.test(publicId) || !/^\d{6}$/.test(code)) throw invalidCode()
      const result = await transaction(async connection => {
        const record = await loadChallenge(connection, publicId)
        if (!record) return { error: invalidCode() }
        const { account, challenge } = record
        if (future(challenge.locked_until, now())) return { error: locked() }
        if (!challenge.code_hash || !future(challenge.code_expires_at, now())) return { error: invalidCode() }
        if (!matches(challenge.code_hash, publicId, code)) {
          const attempts = Number(challenge.code_attempts) + 1
          await connection.execute('UPDATE account_recovery_challenges SET code_attempts=?,locked_until=?,updated_at=NOW() WHERE account_id=?',
            [attempts, attempts >= 3 ? new Date(now() + LOCK_LIFETIME) : null, account.account_id])
          return { error: attempts >= 3 ? locked() : invalidCode() }
        }
        const token = randomBytes(32).toString('hex')
        await connection.execute(`UPDATE account_recovery_challenges SET code_hash=NULL,reset_token_hash=?,reset_expires_at=?,updated_at=NOW()
          WHERE account_id=?`, [digest(publicId, token), new Date(now() + RESET_LIFETIME), account.account_id])
        return { data: { resetToken: token, expiresIn: RESET_LIFETIME / 1000 } }
      })
      // Throw AFTER commit so failed-code counters/locks persist.
      if (result.error) throw result.error
      return result.data!
    },
    async reset(body: unknown) {
      const input = object(body)
      const publicId = String(input.challenge_id ?? '')
      const token = String(input.reset_token ?? '')
      const password = typeof input.password === 'string' ? input.password : ''
      if (password.length < 8 || Buffer.byteLength(password) > 72 || password !== input.confirm_password) {
        throw new HttpError(422, 'AUTH_VALIDATION_FAILED', 'Use a password of at least 8 characters (at most 72 bytes), and enter the same confirmation.')
      }
      if (!PUBLIC_ID.test(publicId) || !/^[a-f0-9]{64}$/.test(token)) throw invalidReset()
      await transaction(async connection => {
        const record = await loadChallenge(connection, publicId)
        if (!record || !future(record.challenge.reset_expires_at, now()) || !matches(record.challenge.reset_token_hash, publicId, token)) throw invalidReset()
        if (await passwordHasher.compare(password, record.account.password_hash)) {
          throw new HttpError(422, 'PASSWORD_UNCHANGED', 'Choose a password different from your current password.')
        }
        const hash = await passwordHasher.hash(password, 12)
        await connection.execute('UPDATE accounts SET password_hash=?,auth_version=auth_version+1,updated_at=NOW() WHERE account_id=?', [hash, record.account.account_id])
        await connection.execute('UPDATE users SET password_hash=?,auth_version=auth_version+1,updated_at=NOW() WHERE user_id=?', [hash, record.account.user_id])
        await connection.execute('UPDATE account_recovery_challenges SET code_hash=NULL,reset_token_hash=NULL,reset_expires_at=NULL,code_attempts=0,locked_until=NULL,updated_at=NOW() WHERE account_id=?', [record.account.account_id])
      })
      return { message: 'Password updated. Sign in with your new password.' }
    },
  }
}

export const passwordRecoveryService = createPasswordRecoveryService()
