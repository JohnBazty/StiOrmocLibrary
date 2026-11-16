import type { Pool, PoolConnection, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { semesterAccessEnded } from '../enrollment/enrollment-policy.ts'
import { REFRESH_REUSE_GRACE_MS, deviceTokenHash, isDeviceToken, makeDeviceToken } from './login-device-policy.ts'
import { signSessionToken } from './login-security.service.ts'

const invalid = () => new HttpError(401, 'REFRESH_TOKEN_INVALID', 'Sign in again to continue.')
const accessRevoked = () => new HttpError(401, 'ACCOUNT_ACCESS_REVOKED', 'Your account access changed. Please sign in again.')

type SemesterEnded = (c: PoolConnection, accountId: number) => Promise<boolean>

/** Rotating refresh tokens for the phone app. Every timestamp comes from the injected now(), never from SQL NOW(). */
export function createMobileRefreshService(database: Pool = db, now = Date.now, semesterEnded: SemesterEnded = semesterAccessEnded, graceMs = REFRESH_REUSE_GRACE_MS) {
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

  /** The unused successor of an already-rotated row while it is inside the grace window, else undefined (= reuse). */
  async function unusedSuccessorInGrace(c: PoolConnection, row: RowDataPacket) {
    if (graceMs <= 0 || !row.replaced_by || now() - new Date(row.rotated_at).getTime() >= graceMs) return undefined
    const [successors] = await c.execute<RowDataPacket[]>('SELECT rotated_at FROM mobile_refresh_tokens WHERE token_hash=? FOR UPDATE', [row.replaced_by])
    return successors[0] && !successors[0].rotated_at ? String(row.replaced_by) : undefined
  }

  /** Fixed deadline, then the locked account and session state (D-04, D-07). Returns the account row to sign for, or the rejection. */
  async function checkAccess(c: PoolConnection, row: RowDataPacket): Promise<{ account: RowDataPacket } | { error: HttpError }> {
    if (new Date(row.expires_at).getTime() <= now()) return { error: new HttpError(401, 'REFRESH_TOKEN_EXPIRED', 'Sign in again to continue.') }
    const [accounts] = await c.execute<RowDataPacket[]>('SELECT a.*,u.account_status AS linked_status FROM accounts a LEFT JOIN users u ON u.user_id=a.user_id WHERE a.account_id=? FOR UPDATE OF a', [row.account_id])
    const account = accounts[0]
    if (!account || account.account_status !== 'Active' || (account.linked_status && account.linked_status !== 'Active')
      || Number(account.auth_version) !== Number(row.auth_version)
      || (account.role === 'Student' && await semesterEnded(c, Number(row.account_id)))) return { error: accessRevoked() }
    const [sessions] = await c.execute<RowDataPacket[]>('SELECT revoked_at,client FROM library_login_sessions WHERE session_id=?', [row.session_id])
    if (!sessions[0] || sessions[0].revoked_at || sessions[0].client !== 'mobile') return { error: invalid() }
    return { account }
  }

  async function refresh(token: unknown) {
    if (!isDeviceToken(token)) throw invalid()
    // Rejections are returned, not thrown, so the family revoke on reuse commits with this transaction.
    const outcome = await tx(async c => {
      const hash = deviceTokenHash('refresh', token)
      const [rows] = await c.execute<RowDataPacket[]>('SELECT * FROM mobile_refresh_tokens WHERE token_hash=? FOR UPDATE', [hash])
      const row = rows[0]
      if (!row) return { error: invalid() }
      const graceSuccessor = row.rotated_at ? await unusedSuccessorInGrace(c, row) : undefined
      if (row.rotated_at && !graceSuccessor) {
        await c.execute('UPDATE library_login_sessions SET revoked_at=NOW() WHERE session_id=? AND revoked_at IS NULL', [row.session_id])
        return { error: new HttpError(401, 'REFRESH_TOKEN_REUSED', 'Sign in again to continue.') }
      }
      const access = await checkAccess(c, row)
      if ('error' in access) return access
      const { account } = access

      const next = makeDeviceToken(), nextHash = deviceTokenHash('refresh', next)
      const deadline = new Date(row.expires_at)
      await c.execute('INSERT INTO mobile_refresh_tokens(token_hash,session_id,account_id,auth_version,issued_at,expires_at) VALUES (?,?,?,?,?,?)',
        [nextHash, row.session_id, row.account_id, row.auth_version, new Date(now()), deadline])
      // Grace retry: the lost successor dies (rotated, no successor of its own, so presenting it later is reuse); the retried row stays as it was.
      if (graceSuccessor) await c.execute('UPDATE mobile_refresh_tokens SET rotated_at=? WHERE token_hash=?', [new Date(now()), graceSuccessor])
      else await c.execute('UPDATE mobile_refresh_tokens SET rotated_at=?,replaced_by=? WHERE token_hash=?', [new Date(now()), nextHash, hash])

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
