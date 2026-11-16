import type { Pool, PoolConnection, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { deviceTokenHash, isDeviceToken, makeDeviceToken } from './login-device-policy.ts'
import { signSessionToken } from './login-security.service.ts'

const invalid = () => new HttpError(401, 'REFRESH_TOKEN_INVALID', 'Sign in again to continue.')

/** Rotating refresh tokens for the phone app. Every timestamp comes from the injected now(), never from SQL NOW(). */
export function createMobileRefreshService(database: Pool = db, now = Date.now) {
  async function tx<T>(work: (connection: PoolConnection) => Promise<T>) {
    const connection = await database.getConnection()
    try { await connection.beginTransaction(); const value = await work(connection); await connection.commit(); return value }
    catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }

  /** Runs on the caller's connection. expiresAt is the family deadline, computed once by the caller and stored unchanged. */
  async function issue(c: PoolConnection, input: { accountId: number; authVersion: number; sessionId: string; expiresAt: Date }) {
    const refreshToken = makeDeviceToken()
    await c.execute('INSERT INTO mobile_refresh_tokens(token_hash,session_id,account_id,auth_version,issued_at,expires_at) VALUES (?,?,?,?,?,?)',
      [deviceTokenHash('refresh', refreshToken), input.sessionId, input.accountId, input.authVersion, new Date(now()), input.expiresAt])
    return { refreshToken, refreshExpiresAt: input.expiresAt.toISOString() }
  }

  async function refresh(token: unknown) {
    if (!isDeviceToken(token)) throw invalid()
    // Rejections are returned, not thrown, so a later revoke can still commit inside this transaction.
    const outcome = await tx(async c => {
      const hash = deviceTokenHash('refresh', token)
      const [rows] = await c.execute<RowDataPacket[]>('SELECT * FROM mobile_refresh_tokens WHERE token_hash=? FOR UPDATE', [hash])
      const row = rows[0]
      if (!row) return { error: invalid() }
      const [accounts] = await c.execute<RowDataPacket[]>('SELECT school_id,role,auth_version FROM accounts WHERE account_id=?', [row.account_id])
      const [sessions] = await c.execute<RowDataPacket[]>('SELECT session_id FROM library_login_sessions WHERE session_id=?', [row.session_id])
      const account = accounts[0]
      if (!account || !sessions[0]) return { error: invalid() }

      const next = makeDeviceToken(), nextHash = deviceTokenHash('refresh', next)
      const deadline = new Date(row.expires_at)
      await c.execute('INSERT INTO mobile_refresh_tokens(token_hash,session_id,account_id,auth_version,issued_at,expires_at) VALUES (?,?,?,?,?,?)',
        [nextHash, row.session_id, row.account_id, row.auth_version, new Date(now()), deadline])
      await c.execute('UPDATE mobile_refresh_tokens SET rotated_at=?,replaced_by=? WHERE token_hash=?', [new Date(now()), nextHash, hash])

      const expiresIn = Math.min(env.jwt.expiresInSeconds, Math.floor((deadline.getTime() - now()) / 1000))
      const accessToken = signSessionToken({ accountId: Number(row.account_id), schoolId: account.school_id, role: account.role, authVersion: Number(row.auth_version), sessionId: row.session_id }, expiresIn)
      return { value: { token: accessToken, tokenType: 'Bearer', expiresIn, refreshToken: next, refreshExpiresAt: deadline.toISOString() } }
    })
    if ('error' in outcome) throw outcome.error
    return outcome.value
  }

  return { issue, refresh }
}

export const mobileRefreshService = createMobileRefreshService()
