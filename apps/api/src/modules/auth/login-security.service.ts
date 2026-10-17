import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import jwt from 'jsonwebtoken'
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { jwtAuthService, dashboardForJwtRole, type JwtRole } from './jwt-auth.service.ts'
import { sendSchoolEmail } from './school-email.sender.ts'
import { isInstitutionalEmail } from './auth.validation.js'

export const LOGIN_IDLE_MS = 10 * 60_000
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
const hash = (value: string) => createHmac('sha256', env.jwt.secret).update(`login:${value}`).digest('hex')
const failCode = () => new HttpError(422, 'LOGIN_CODE_INVALID', 'The code is incorrect, expired or already used. Start login again if needed.')
const pausedCode = () => new HttpError(429, 'LOGIN_CODE_PAUSED', 'Three incorrect codes were entered. Wait 10 minutes before starting login again.')
export type VerifiedLogin = { accountId: number; userId: number | null; schoolId: string; role: JwtRole; authVersion: number; fullName: string | null; email: string }

export function createLoginSecurityService(database: Pool = db,
  verifyCredentials: (body: unknown) => Promise<VerifiedLogin> = body => jwtAuthService.login(body, true),
  sendCode = (email: string, code: string) => sendSchoolEmail(email, 'STI library login code', `Your login code is ${code}. It expires in 10 minutes. Do not share this code. If you did not sign in, ignore this email.`),
  now = Date.now, newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0')) {
  async function tx<T>(work: (connection: PoolConnection) => Promise<T>) {
    const connection = await database.getConnection()
    try { await connection.beginTransaction(); const value = await work(connection); await connection.commit(); return value }
    catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }
  async function complete(c: PoolConnection, verified: VerifiedLogin) {
    const [accounts] = await c.execute<RowDataPacket[]>('SELECT a.*,u.account_status AS linked_status,u.email,u.full_name FROM accounts a LEFT JOIN users u ON u.user_id=a.user_id WHERE a.account_id=? FOR UPDATE OF a', [verified.accountId])
    const account = accounts[0]
    if (!account || account.account_status !== 'Active' || (account.linked_status && account.linked_status !== 'Active') || Number(account.auth_version) !== verified.authVersion || account.role !== verified.role || account.school_id !== verified.schoolId) throw new HttpError(401, 'LOGIN_CHANGED', 'Account access changed. Start login again.')
    const version = Number(account.auth_version) + 1, sessionId = randomUUID()
    await c.execute('UPDATE accounts SET auth_version=?,updated_at=NOW() WHERE account_id=?', [version, verified.accountId])
    if (account.user_id) {
      await c.execute('UPDATE users SET auth_version=auth_version+1,updated_at=NOW() WHERE user_id=?', [account.user_id])
      await c.execute("DELETE FROM auth_sessions WHERE (session_data::json->'user'->>'id')::int=?", [account.user_id])
    }
    await c.execute('UPDATE library_login_sessions SET revoked_at=NOW() WHERE account_id=? AND revoked_at IS NULL', [verified.accountId])
    await c.execute('INSERT INTO library_login_sessions(session_id,account_id,auth_version,last_activity_at) VALUES (?,?,?,?)', [sessionId, verified.accountId, version, new Date(now())])
    const user = { id: verified.accountId, accountId: verified.accountId, schoolId: verified.schoolId, fullName: verified.fullName, role: verified.role }
    return { token: signSessionToken({ ...user, authVersion: version, sessionId }), tokenType: 'Bearer', expiresIn: env.jwt.expiresInSeconds, redirect: dashboardForJwtRole(verified.role), user }
  }
  return {
    async login(body: any) {
      const suppliedId = String(body?.school_id ?? body?.email ?? '').trim().slice(0, 254)
      // The same account has one attempt budget across its school-ID and legacy email aliases.
      const [aliases] = await database.execute<RowDataPacket[]>('SELECT a.account_id FROM accounts a LEFT JOIN users u ON u.user_id=a.user_id WHERE a.school_id=? OR LOWER(u.email)=? LIMIT 1', [suppliedId.toUpperCase(), suppliedId.toLowerCase()])
      const identifier = hash(aliases[0] ? `account:${aliases[0].account_id}` : `identifier:${suppliedId.toUpperCase()}`)
      // Serialize attempts across instances. Only incorrect credentials increment the counter.
      const credentialCheck = await verifyCredentials(body).then(value => ({ value, error: null as unknown })).catch(error => ({ value: null, error }))
      const result = await tx(async c => {
        await c.execute('INSERT INTO login_attempt_windows(identifier_hash) VALUES (?) ON CONFLICT DO NOTHING', [identifier])
        const [rows] = await c.execute<RowDataPacket[]>('SELECT * FROM login_attempt_windows WHERE identifier_hash=? FOR UPDATE', [identifier])
        const row = rows[0], timestamp = now()
        if (row.locked_until && new Date(row.locked_until).getTime() > timestamp) {
          const minutes = Math.ceil((new Date(row.locked_until).getTime() - timestamp) / 60_000)
          return { error: new HttpError(429, 'LOGIN_PAUSED', `Sign-in is paused. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`) }
        }
        let count = Number(row.failed_count)
        if (row.locked_until || timestamp - new Date(row.window_started_at).getTime() >= LOGIN_IDLE_MS) {
          count = 0
          await c.execute('UPDATE login_attempt_windows SET failed_count=0,locked_until=NULL,window_started_at=? WHERE identifier_hash=?', [new Date(timestamp), identifier])
        }
        let verified: VerifiedLogin
        try { if (credentialCheck.error) throw credentialCheck.error; verified = credentialCheck.value! }
        catch (error) {
          if (!(error instanceof HttpError) || error.code !== 'INVALID_CREDENTIALS') throw error
          count++
          await c.execute('UPDATE login_attempt_windows SET failed_count=?,locked_until=? WHERE identifier_hash=?', [count, count >= 8 ? new Date(timestamp + LOGIN_IDLE_MS) : null, identifier])
          const remaining = Math.max(0, 8 - count)
          return { error: new HttpError(count >= 8 ? 429 : 401, count >= 8 ? 'LOGIN_PAUSED' : 'INVALID_CREDENTIALS', count >= 8 ? 'Too many wrong attempts. Try again in 10 minutes.' : 'Wrong credentials.' + (remaining <= 3 ? ` ${remaining} attempts remaining.` : '')) }
        }
        await c.execute('UPDATE login_attempt_windows SET failed_count=0,locked_until=NULL WHERE identifier_hash=?', [identifier])
        if (!['Student', 'Faculty'].includes(verified.role)) return { data: await complete(c, verified) }
        if (!isInstitutionalEmail(verified.email)) throw new HttpError(422, 'LOGIN_EMAIL_MISSING', 'Your school email is not linked. Contact the librarian.')
        const [lockedAccount] = await c.execute<RowDataPacket[]>('SELECT auth_version FROM accounts WHERE account_id=? FOR UPDATE', [verified.accountId])
        if (Number(lockedAccount[0]?.auth_version) !== verified.authVersion) throw new HttpError(401, 'LOGIN_CHANGED', 'Account access changed. Start login again.')
        const [recent] = await c.execute<RowDataPacket[]>('SELECT sent_at,failed_count,expires_at FROM login_otp_challenges WHERE account_id=? ORDER BY sent_at DESC LIMIT 1', [verified.accountId])
        if (Number(recent[0]?.failed_count) >= 3 && new Date(recent[0].expires_at).getTime() > timestamp) return { error: pausedCode() }
        if (recent[0] && timestamp - new Date(recent[0].sent_at).getTime() < 60_000) return { error: new HttpError(429, 'LOGIN_CODE_WAIT', 'Wait one minute before requesting another login code.') }
        const challengeId = randomUUID(), code = newCode()
        await c.execute('UPDATE login_otp_challenges SET consumed_at=NOW(),code_hash=NULL WHERE account_id=? AND consumed_at IS NULL', [verified.accountId])
        await c.execute('INSERT INTO login_otp_challenges(challenge_id,account_id,auth_version,code_hash,expires_at,sent_at) VALUES (?,?,?,?,?,?)', [challengeId, verified.accountId, verified.authVersion, hash(`${challengeId}:${code}`), new Date(timestamp + LOGIN_IDLE_MS), new Date(timestamp)])
        return { pending: { challengeId, email: verified.email, code } }
      })
      if (result.error) throw result.error
      if (result.data) return result.data
      const pending = result.pending!
      try { await sendCode(pending.email, pending.code) }
      catch (error) { await database.execute('UPDATE login_otp_challenges SET code_hash=NULL,consumed_at=NOW() WHERE challenge_id=?', [pending.challengeId]); throw error }
      const [name, domain] = pending.email.split('@')
      return { otpRequired: true, challengeId: pending.challengeId, emailHint: `${name.slice(0, 2)}***@${domain}`, expiresIn: 600, resendAfter: 60 }
    },
    async verify(body: any) {
      const challengeId = String(body?.challenge_id ?? ''), code = String(body?.code ?? '')
      if (!UUID.test(challengeId) || !/^\d{6}$/.test(code)) throw failCode()
      const result = await tx(async c => {
        const [reference] = await c.execute<RowDataPacket[]>('SELECT account_id FROM login_otp_challenges WHERE challenge_id=?', [challengeId])
        if (!reference[0]) return { error: failCode() }
        const [accounts] = await c.execute<RowDataPacket[]>('SELECT a.*,u.email,u.full_name FROM accounts a LEFT JOIN users u ON u.user_id=a.user_id WHERE a.account_id=? FOR UPDATE OF a', [reference[0].account_id])
        const [rows] = await c.execute<RowDataPacket[]>('SELECT * FROM login_otp_challenges WHERE challenge_id=? FOR UPDATE', [challengeId])
        const row = rows[0], account = accounts[0]
        if (row?.failed_count >= 3 && new Date(row.expires_at).getTime() > now()) return { error: pausedCode() }
        if (!account || !['Student','Faculty'].includes(account.role) || !row || row.consumed_at || !row.code_hash || row.failed_count >= 3 || new Date(row.expires_at).getTime() <= now()) return { error: failCode() }
        if (!timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(hash(`${challengeId}:${code}`)))) {
          await c.execute('UPDATE login_otp_challenges SET failed_count=failed_count+1,expires_at=CASE WHEN failed_count>=2 THEN ? ELSE expires_at END WHERE challenge_id=?', [new Date(now() + LOGIN_IDLE_MS), challengeId])
          return { error: Number(row.failed_count) >= 2 ? pausedCode() : failCode() }
        }
        await c.execute('UPDATE login_otp_challenges SET consumed_at=NOW(),code_hash=NULL WHERE challenge_id=?', [challengeId])
        return { data: await complete(c, { accountId: Number(account.account_id), userId: account.user_id, schoolId: account.school_id, role: account.role, authVersion: Number(row.auth_version), email: account.email, fullName: account.full_name }) }
      })
      if (result.error) throw result.error
      return result.data
    },
    async resend(body: any) {
      const challengeId = String(body?.challenge_id ?? '')
      if (!UUID.test(challengeId)) throw failCode()
      const code = newCode()
      const email = await tx(async c => {
        const [reference] = await c.execute<RowDataPacket[]>('SELECT account_id FROM login_otp_challenges WHERE challenge_id=?', [challengeId])
        if (!reference[0]) throw failCode()
        const [accounts] = await c.execute<RowDataPacket[]>('SELECT a.auth_version,a.account_status,u.email FROM accounts a LEFT JOIN users u ON u.user_id=a.user_id WHERE a.account_id=? FOR UPDATE OF a', [reference[0].account_id])
        const [rows] = await c.execute<RowDataPacket[]>('SELECT * FROM login_otp_challenges WHERE challenge_id=? FOR UPDATE', [challengeId])
        const row = rows[0], account = accounts[0]
        if (!row || row.consumed_at || row.failed_count >= 3 || row.resend_count >= 3 || !account || account.account_status !== 'Active' || Number(account.auth_version) !== Number(row.auth_version)) throw failCode()
        if (now() - new Date(row.sent_at).getTime() < 60_000) throw new HttpError(429, 'LOGIN_CODE_WAIT', 'Wait one minute before requesting another code.')
        await c.execute('UPDATE login_otp_challenges SET code_hash=?,expires_at=?,sent_at=?,resend_count=resend_count+1 WHERE challenge_id=?', [hash(`${challengeId}:${code}`), new Date(now() + LOGIN_IDLE_MS), new Date(now()), challengeId])
        return String(account.email)
      })
      try { await sendCode(email, code) } catch (error) { await database.execute('UPDATE login_otp_challenges SET code_hash=NULL,consumed_at=NOW() WHERE challenge_id=?', [challengeId]); throw error }
      return { message: 'A new code was sent. Previous codes no longer work.', resendAfter: 60 }
    },
  }
}
export function signSessionToken(user: { accountId: number; schoolId: string; role: string; authVersion: number; sessionId: string }) {
  return jwt.sign({ ...user, userId: user.accountId }, env.jwt.secret, { algorithm: 'HS256', expiresIn: env.jwt.expiresInSeconds, issuer: env.jwt.issuer, audience: env.jwt.audience, subject: String(user.accountId) })
}
export const loginSecurityService = createLoginSecurityService()
