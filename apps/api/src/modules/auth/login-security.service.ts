import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import jwt from 'jsonwebtoken'
import type { Pool, PoolConnection, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { env } from '../../config/env.js'
import { HttpError } from '../../core/http-error.ts'
import { jwtAuthService, dashboardForJwtRole, type JwtRole } from './jwt-auth.service.ts'
import { sendSchoolEmail } from './school-email.sender.ts'
import { isInstitutionalEmail } from './auth.validation.js'
import { enrollmentEnabled, linkSemesterMember, lockEnrollment, restorationEvidence, semesterAccessEnded } from '../enrollment/enrollment-policy.ts'
import {
  DEVICE_DEADLINE_SQL, LIVE_DEVICE_SQL, LOGIN_IDLE_MS, REMEMBER_DEVICE_MS, SWITCH_DEVICE_MS,
  deviceTokenHash, isDeviceToken, loginDevicesEnabled, makeDeviceToken,
} from './login-device-policy.ts'

export { LOGIN_IDLE_MS } from './login-device-policy.ts'
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
const hash = (value: string) => createHmac('sha256', env.jwt.secret).update(`login:${value}`).digest('hex')
const failCode = () => new HttpError(422, 'LOGIN_CODE_INVALID', 'The code is incorrect, expired or already used. Start login again if needed.')
const pausedCode = () => new HttpError(429, 'LOGIN_CODE_PAUSED', 'Three incorrect codes were entered. Wait 10 minutes before starting login again.')
const semesterEnded = () => new HttpError(403, 'SEMESTER_ACCESS_ENDED', 'Your semester has ended. You can sign in again once your enrollment is listed for the next semester.')
export type VerifiedLogin = { accountId: number; userId: number | null; schoolId: string; role: JwtRole; authVersion: number; fullName: string | null; email: string }
type DeviceOptions = { browserToken?: string; remember?: boolean; replacedSessionId?: string }
type BrowserIdentity = { accountId: number; authVersion: number; sessionId?: string }
const deviceExpired = () => new HttpError(401, 'DEVICE_EXPIRED', 'This device’s sign-in has ended. Sign in again to continue.')
const switchExpired = () => new HttpError(409, 'DEVICE_SWITCH_EXPIRED', 'This sign-in changed or timed out. Sign in again to continue.')
const verifiedAccount = (account: RowDataPacket, authVersion = Number(account.auth_version)): VerifiedLogin => ({
  accountId: Number(account.account_id), userId: account.user_id, schoolId: account.school_id, role: account.role,
  authVersion, email: account.email, fullName: account.full_name,
})

export function createLoginSecurityService(database: Pool = db,
  verifyCredentials: (body: unknown) => Promise<VerifiedLogin> = body => jwtAuthService.login(body, true),
  sendCode = (email: string, code: string) => sendSchoolEmail(email, 'STI library login code', `Your login code is ${code}. It expires in 10 minutes. Do not share this code. If you did not sign in, ignore this email.`),
  now = Date.now, newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0'), devicesEnabled = loginDevicesEnabled) {
  async function tx<T>(work: (connection: PoolConnection) => Promise<T>) {
    const connection = await database.getConnection()
    try { await connection.beginTransaction(); const value = await work(connection); await connection.commit(); return value }
    catch (error) { await connection.rollback(); throw error } finally { connection.release() }
  }
  function loginResult(verified: VerifiedLogin, version: number, sessionId: string, device = false, deadline?: number, lastActivity = now()) {
    const user = { id: verified.accountId, accountId: verified.accountId, schoolId: verified.schoolId, fullName: verified.fullName, role: verified.role }
    const expiresIn = device ? deviceAccessLifetime(lastActivity, deadline, now()) : env.jwt.expiresInSeconds
    if (expiresIn < 1) throw deviceExpired()
    const token = signSessionToken({ ...user, authVersion: version, sessionId, ...(device ? { deviceSession: true, rememberedUntil: deadline, idleUntil: lastActivity + LOGIN_IDLE_MS } : {}) }, expiresIn)
    return { token, tokenType: 'Bearer', expiresIn, redirect: dashboardForJwtRole(verified.role), user }
  }

  async function complete(c: PoolConnection, verified: VerifiedLogin, restorationSemesterId: number | null = null, options: DeviceOptions = {}) {
    const [accounts] = await c.execute<RowDataPacket[]>('SELECT a.*,u.account_status AS linked_status,u.email,u.full_name FROM accounts a LEFT JOIN users u ON u.user_id=a.user_id WHERE a.account_id=? FOR UPDATE OF a', [verified.accountId])
    const account = accounts[0]
    if (!account || Number(account.auth_version) !== verified.authVersion || account.role !== verified.role || account.school_id !== verified.schoolId) throw new HttpError(401, 'LOGIN_CHANGED', 'Account access changed. Start login again.')
    const device = devicesEnabled()
    const remember = device && options.remember === true && ['Student', 'Faculty'].includes(verified.role)
    if (account.account_status !== 'Active' || (account.linked_status && account.linked_status !== 'Active')) {
      const restore=account.role==='Student' && await restorationEvidence(c,verified.accountId,verified.schoolId,String(account.email??''))
      if (!restore || restore.semesterId !== restorationSemesterId) throw new HttpError(401, 'LOGIN_CHANGED', 'Account access changed. Start login again.')
      await c.execute("UPDATE accounts SET account_status='Active',updated_at=NOW() WHERE account_id=?",[verified.accountId])
      await c.execute("UPDATE users SET account_status='Active',updated_at=NOW() WHERE user_id=?",[account.user_id])
      await linkSemesterMember(c,restore.semesterId,verified.accountId,verified.schoolId,restore.name)
    } else if (verified.role==='Student' && await semesterAccessEnded(c,verified.accountId)) throw semesterEnded()
    if (device) {
      const [sessions] = await c.execute<RowDataPacket[]>(
        `SELECT session_id,device_token_hash FROM library_login_sessions
         WHERE account_id=? AND auth_version=? AND revoked_at IS NULL AND ${LIVE_DEVICE_SQL}
         ORDER BY created_at DESC LIMIT 1`, [verified.accountId, verified.authVersion],
      )
      const active = sessions[0]
      if (options.replacedSessionId) {
        if (active && active.session_id !== options.replacedSessionId) throw switchExpired()
      } else if (active && (!options.browserToken || deviceTokenHash('browser', options.browserToken) !== active.device_token_hash)) {
        const switchToken = makeDeviceToken()
        await c.execute('DELETE FROM login_device_switches WHERE account_id=? AND expires_at<=NOW()', [verified.accountId])
        await c.execute('INSERT INTO login_device_switches(token_hash,account_id,auth_version,replaced_session_id,remember_device,expires_at) VALUES (?,?,?,?,?,?)',
          [deviceTokenHash('switch', switchToken), verified.accountId, verified.authVersion, active.session_id, remember, new Date(now() + SWITCH_DEVICE_MS)])
        return { deviceSwitchRequired: true as const, switchToken }
      }
    }
    const version = Number(account.auth_version) + 1, sessionId = randomUUID()
    await c.execute('UPDATE accounts SET auth_version=?,updated_at=NOW() WHERE account_id=?', [version, verified.accountId])
    if (account.user_id) {
      await c.execute('UPDATE users SET auth_version=auth_version+1,updated_at=NOW() WHERE user_id=?', [account.user_id])
      await c.execute("DELETE FROM auth_sessions WHERE (session_data::json->'user'->>'id')::int=?", [account.user_id])
    }
    await c.execute('UPDATE library_login_sessions SET revoked_at=NOW() WHERE account_id=? AND revoked_at IS NULL', [verified.accountId])
    if (!device) {
      await c.execute('INSERT INTO library_login_sessions(session_id,account_id,auth_version,last_activity_at) VALUES (?,?,?,?)', [sessionId, verified.accountId, version, new Date(now())])
      return loginResult(verified, version, sessionId)
    }
    const timestamp = now()
    const token = makeDeviceToken()
    const deadline = remember ? timestamp + REMEMBER_DEVICE_MS : undefined
    await c.execute('DELETE FROM login_device_switches WHERE account_id=?', [verified.accountId])
    await c.execute('INSERT INTO library_login_sessions(session_id,account_id,auth_version,last_activity_at,device_token_hash,remembered_until) VALUES (?,?,?,?,?,?)',
      [sessionId, verified.accountId, version, new Date(timestamp), deviceTokenHash('browser', token), deadline ? new Date(deadline) : null])
    return { ...loginResult(verified, version, sessionId, true, deadline, timestamp), deviceCookie: { token, sessionId, deadline } }
  }

  async function lockBrowser(c: PoolConnection, token?: string, identity?: BrowserIdentity) {
    const digest = token ? deviceTokenHash('browser', token) : null
    const [matches] = digest
      ? await c.execute<RowDataPacket[]>('SELECT account_id,session_id FROM library_login_sessions WHERE device_token_hash=?', [digest])
      : [[{ account_id: identity?.accountId, session_id: identity?.sessionId }]]
    const reference = matches[0]
    if (!reference?.account_id || !reference.session_id) throw deviceExpired()
    if (enrollmentEnabled()) await lockEnrollment(c)
    const [accounts] = await c.execute<RowDataPacket[]>(
      'SELECT a.*,u.account_status AS linked_status,u.email,u.full_name FROM accounts a LEFT JOIN users u ON u.user_id=a.user_id WHERE a.account_id=? FOR UPDATE OF a',
      [reference.account_id],
    )
    const account = accounts[0]
    if (!account) throw deviceExpired()
    const [sessions] = await c.execute<RowDataPacket[]>(
      'SELECT * FROM library_login_sessions WHERE session_id=? AND account_id=? AND auth_version=? AND revoked_at IS NULL AND device_token_hash IS NOT NULL',
      [reference.session_id, account.account_id, account.auth_version],
    )
    if (!sessions[0]) throw deviceExpired()
    return { account, session: sessions[0] }
  }

  return {
    async login(body: any, browserToken?: string) {
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
        if (!['Student', 'Faculty'].includes(verified.role)) return { data: await complete(c, verified, null, { browserToken }) }
        if (!isInstitutionalEmail(verified.email)) throw new HttpError(422, 'LOGIN_EMAIL_MISSING', 'Your school email is not linked. Contact the librarian.')
        if (verified.role==='Student' && enrollmentEnabled()) await lockEnrollment(c)
        const [lockedAccount] = await c.execute<RowDataPacket[]>('SELECT auth_version FROM accounts WHERE account_id=? FOR UPDATE', [verified.accountId])
        if (Number(lockedAccount[0]?.auth_version) !== verified.authVersion) throw new HttpError(401, 'LOGIN_CHANGED', 'Account access changed. Start login again.')
        const ended = verified.role === 'Student' && await semesterAccessEnded(c, verified.accountId)
        const restoration = ended ? await restorationEvidence(c, verified.accountId, verified.schoolId, verified.email) : null
        if (ended && !restoration) throw semesterEnded()
        const [recent] = await c.execute<RowDataPacket[]>('SELECT sent_at,failed_count,expires_at FROM login_otp_challenges WHERE account_id=? ORDER BY sent_at DESC LIMIT 1', [verified.accountId])
        if (Number(recent[0]?.failed_count) >= 3 && new Date(recent[0].expires_at).getTime() > timestamp) return { error: pausedCode() }
        if (recent[0] && timestamp - new Date(recent[0].sent_at).getTime() < 60_000) return { error: new HttpError(429, 'LOGIN_CODE_WAIT', 'Wait one minute before requesting another login code.') }
        const challengeId = randomUUID(), code = newCode()
        await c.execute('UPDATE login_otp_challenges SET consumed_at=NOW(),code_hash=NULL WHERE account_id=? AND consumed_at IS NULL', [verified.accountId])
        await c.execute('INSERT INTO login_otp_challenges(challenge_id,account_id,auth_version,code_hash,expires_at,sent_at) VALUES (?,?,?,?,?,?)', [challengeId, verified.accountId, verified.authVersion, hash(`${challengeId}:${code}`), new Date(timestamp + LOGIN_IDLE_MS), new Date(timestamp)])
        if (devicesEnabled() && body?.remember_device === true) {
          await c.execute('UPDATE login_otp_challenges SET remember_device=true WHERE challenge_id=?', [challengeId])
        }
        if (restoration) await c.execute('UPDATE login_otp_challenges SET restoration_semester_id=? WHERE challenge_id=?', [restoration.semesterId, challengeId])
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
    async verify(body: any, browserToken?: string) {
      const challengeId = String(body?.challenge_id ?? ''), code = String(body?.code ?? '')
      if (!UUID.test(challengeId) || !/^\d{6}$/.test(code)) throw failCode()
      const result = await tx(async c => {
        const [reference] = await c.execute<RowDataPacket[]>('SELECT account_id FROM login_otp_challenges WHERE challenge_id=?', [challengeId])
        if (!reference[0]) return { error: failCode() }
        if (enrollmentEnabled()) await lockEnrollment(c)
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
        return { data: await complete(c, verifiedAccount(account, Number(row.auth_version)), row.restoration_semester_id == null ? null : Number(row.restoration_semester_id), { browserToken, remember: row.remember_device === true }) }
      })
      if (result.error) throw result.error
      return result.data
    },
    async switchDevice(token: unknown) {
      if (!devicesEnabled() || !isDeviceToken(token)) throw switchExpired()
      const digest = deviceTokenHash('switch', token)
      return tx(async c => {
        const [references] = await c.execute<RowDataPacket[]>('SELECT account_id FROM login_device_switches WHERE token_hash=?', [digest])
        if (!references[0]) throw switchExpired()
        if (enrollmentEnabled()) await lockEnrollment(c)
        const [accounts] = await c.execute<RowDataPacket[]>('SELECT a.*,u.email,u.full_name FROM accounts a LEFT JOIN users u ON u.user_id=a.user_id WHERE a.account_id=? FOR UPDATE OF a', [references[0].account_id])
        const [attempts] = await c.execute<RowDataPacket[]>('SELECT * FROM login_device_switches WHERE token_hash=? AND expires_at>clock_timestamp()', [digest])
        const attempt = attempts[0], account = accounts[0]
        if (!attempt || !account || Number(attempt.auth_version) !== Number(account.auth_version)) throw switchExpired()
        return complete(c, verifiedAccount(account), null, { replacedSessionId: attempt.replaced_session_id, remember: attempt.remember_device })
      })
    },
    async resumeDevice(token: unknown, expectedSessionId?: unknown) {
      if (!devicesEnabled() || !isDeviceToken(token)) throw deviceExpired()
      return tx(async c => {
        const { account, session } = await lockBrowser(c, token)
        if (expectedSessionId != null && expectedSessionId !== session.session_id) throw deviceExpired()
        const timestamp = now()
        const deadline = session.remembered_until == null ? undefined : new Date(session.remembered_until).getTime()
        let lastActivity = new Date(session.last_activity_at).getTime()
        if (account.account_status !== 'Active' || (account.linked_status && account.linked_status !== 'Active')
          || (account.role === 'Student' && await semesterAccessEnded(c, Number(account.account_id)))
          || (deadline != null && (!['Student', 'Faculty'].includes(account.role) || timestamp >= deadline))) throw deviceExpired()
        if (deadline != null) {
          await c.execute(`UPDATE library_login_sessions SET last_activity_at=? WHERE session_id=? AND ${DEVICE_DEADLINE_SQL}`, [new Date(timestamp), session.session_id])
          lastActivity = timestamp
        }
        return loginResult(verifiedAccount(account), Number(account.auth_version), session.session_id, true, deadline, lastActivity)
      })
    },
    async revokeDevice(token: unknown, identity?: BrowserIdentity) {
      if (!devicesEnabled() || (!isDeviceToken(token) && !identity?.sessionId)) return false
      try {
        return await tx(async c => {
          const { account, session } = await lockBrowser(c, isDeviceToken(token) ? token : undefined, identity)
          if (identity && (identity.accountId !== Number(account.account_id)
            || identity.authVersion !== Number(account.auth_version) || identity.sessionId !== session.session_id)) return false
          await c.execute('UPDATE library_login_sessions SET revoked_at=NOW() WHERE session_id=?', [session.session_id])
          await c.execute('DELETE FROM login_device_switches WHERE account_id=?', [account.account_id])
          return true
        })
      } catch (error) {
        if (error instanceof HttpError && error.code === 'DEVICE_EXPIRED') return false
        throw error
      }
    },
    async resend(body: any) {
      const challengeId = String(body?.challenge_id ?? '')
      if (!UUID.test(challengeId)) throw failCode()
      const code = newCode()
      const email = await tx(async c => {
        const [reference] = await c.execute<RowDataPacket[]>('SELECT account_id FROM login_otp_challenges WHERE challenge_id=?', [challengeId])
        if (!reference[0]) throw failCode()
        if (enrollmentEnabled()) await lockEnrollment(c)
        const [accounts] = await c.execute<RowDataPacket[]>('SELECT a.auth_version,a.account_status,u.email,a.role,a.school_id,u.account_status AS linked_status FROM accounts a LEFT JOIN users u ON u.user_id=a.user_id WHERE a.account_id=? FOR UPDATE OF a', [reference[0].account_id])
        const [rows] = await c.execute<RowDataPacket[]>('SELECT * FROM login_otp_challenges WHERE challenge_id=? FOR UPDATE', [challengeId])
        const row = rows[0], account = accounts[0]
        if (!row || row.consumed_at || row.failed_count >= 3 || row.resend_count >= 3 || !account || Number(account.auth_version) !== Number(row.auth_version)) throw failCode()
        if (account.account_status !== 'Active' || (account.linked_status && account.linked_status !== 'Active') || (account.role==='Student' && await semesterAccessEnded(c,Number(reference[0].account_id)))) {
          const restoration = account.role === 'Student' && await restorationEvidence(c, Number(reference[0].account_id), account.school_id, String(account.email ?? ''))
          if (!restoration || restoration.semesterId !== Number(row.restoration_semester_id)) throw failCode()
        }
        if (now() - new Date(row.sent_at).getTime() < 60_000) throw new HttpError(429, 'LOGIN_CODE_WAIT', 'Wait one minute before requesting another code.')
        await c.execute('UPDATE login_otp_challenges SET code_hash=?,expires_at=?,sent_at=?,resend_count=resend_count+1 WHERE challenge_id=?', [hash(`${challengeId}:${code}`), new Date(now() + LOGIN_IDLE_MS), new Date(now()), challengeId])
        return String(account.email)
      })
      try { await sendCode(email, code) } catch (error) { await database.execute('UPDATE login_otp_challenges SET code_hash=NULL,consumed_at=NOW() WHERE challenge_id=?', [challengeId]); throw error }
      return { message: 'A new code was sent. Previous codes no longer work.', resendAfter: 60 }
    },
  }
}
export function deviceAccessLifetime(lastActivity: number, deadline?: number, timestamp = Date.now()) {
  return Math.min(env.jwt.expiresInSeconds, Math.floor((Math.min(lastActivity + LOGIN_IDLE_MS, deadline ?? Infinity) - timestamp) / 1000))
}
export function signSessionToken(user: { accountId: number; schoolId: string; role: string; authVersion: number; sessionId: string; deviceSession?: boolean; rememberedUntil?: number; idleUntil?: number }, expiresIn = env.jwt.expiresInSeconds) {
  return jwt.sign({ ...user, userId: user.accountId }, env.jwt.secret, { algorithm: 'HS256', expiresIn, issuer: env.jwt.issuer, audience: env.jwt.audience, subject: String(user.accountId) })
}
export const loginSecurityService = createLoginSecurityService()
