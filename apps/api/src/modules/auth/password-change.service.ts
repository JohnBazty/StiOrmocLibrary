import bcrypt from 'bcrypt'
import type { Pool, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { assertNewPassword } from './password-recovery.service.ts'
import { ACCOUNT_LOCK_MS, ACCOUNT_LOCK_THRESHOLD, passwordChangeLockIdentifier } from './login-security.service.ts'

const paused = () => new HttpError(429, 'PASSWORD_CHANGE_PAUSED', `Too many wrong passwords. Try again in ${ACCOUNT_LOCK_MS / 60_000} minutes.`)
const lockedAt = (row: RowDataPacket | undefined, timestamp: number) => Boolean(row?.locked_until && new Date(row.locked_until).getTime() > timestamp)

/** Signed-in password change; also the forced change after an Admin-set temporary password (S5). */
export function createPasswordChangeService(database: Pool = db, hasher: Pick<typeof bcrypt, 'compare' | 'hash'> = bcrypt, now = Date.now) {
  return {
    async change(accountId: number, body: unknown) {
      const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
      const current = typeof input.current_password === 'string' ? input.current_password : ''
      const password = input.new_password
      if (!current) throw new HttpError(422, 'AUTH_VALIDATION_FAILED', 'Enter your current password.')
      assertNewPassword(password, input.confirm_password)
      const identifier = passwordChangeLockIdentifier(accountId)
      const [accounts] = await database.execute<RowDataPacket[]>('SELECT password_hash FROM accounts WHERE account_id=?', [accountId])
      if (!accounts[0]) throw new HttpError(404, 'USER_NOT_FOUND', 'Account not found.')
      const [attempts] = await database.execute<RowDataPacket[]>('SELECT locked_until FROM login_attempt_windows WHERE identifier_hash=?', [identifier])
      if (lockedAt(attempts[0], now())) throw paused()
      // bcrypt runs before any row lock; the transaction re-checks that the hash did not change meanwhile.
      const stored = String(accounts[0].password_hash ?? '')
      const currentMatches = await hasher.compare(current, stored)
      if (currentMatches && await hasher.compare(password, stored)) throw new HttpError(422, 'PASSWORD_UNCHANGED', 'Choose a password different from your current password.')
      const hash = currentMatches ? await hasher.hash(password, 12) : ''
      const connection = await database.getConnection()
      let result: { error?: HttpError; data?: { signedOut: true; message: string } }
      try {
        await connection.beginTransaction()
        // Lock order as sign-in: the attempt row, then the account.
        await connection.execute('INSERT INTO login_attempt_windows(identifier_hash) VALUES (?) ON CONFLICT DO NOTHING', [identifier])
        const [rows] = await connection.execute<RowDataPacket[]>('SELECT * FROM login_attempt_windows WHERE identifier_hash=? FOR UPDATE', [identifier])
        const row = rows[0], timestamp = now()
        if (lockedAt(row, timestamp)) result = { error: paused() }
        else if (!currentMatches) {
          const fresh = row?.locked_until || timestamp - new Date(row?.window_started_at ?? timestamp).getTime() >= ACCOUNT_LOCK_MS
          const count = (fresh ? 0 : Number(row?.failed_count ?? 0)) + 1, lock = count >= ACCOUNT_LOCK_THRESHOLD
          await connection.execute('UPDATE login_attempt_windows SET failed_count=?,locked_until=?,window_started_at=? WHERE identifier_hash=?',
            [count, lock ? new Date(timestamp + ACCOUNT_LOCK_MS) : null, fresh ? new Date(timestamp) : new Date(row.window_started_at), identifier])
          result = { error: lock ? paused() : new HttpError(422, 'CURRENT_PASSWORD_INCORRECT', 'Your current password is incorrect.') }
        } else {
          const [locked] = await connection.execute<RowDataPacket[]>('SELECT account_id,user_id,password_hash,account_status FROM accounts WHERE account_id=? FOR UPDATE', [accountId])
          const account = locked[0]
          if (!account || String(account.password_hash ?? '') !== stored) {
            result = { error: new HttpError(409, 'PASSWORD_CHANGED_ELSEWHERE', 'Your password changed in another window. Sign in again.') }
          } else {
            await connection.execute('UPDATE accounts SET password_hash=?,must_change_password=FALSE,auth_version=auth_version+1,updated_at=NOW() WHERE account_id=?', [hash, accountId])
            if (account.user_id) await connection.execute('UPDATE users SET password_hash=?,auth_version=auth_version+1,updated_at=NOW() WHERE user_id=?', [hash, account.user_id])
            await connection.execute('UPDATE library_login_sessions SET revoked_at=NOW() WHERE account_id=? AND revoked_at IS NULL', [accountId])
            await connection.execute('DELETE FROM login_attempt_windows WHERE identifier_hash=?', [identifier])
            await connection.execute(`INSERT INTO account_management_events(account_id,actor_account_id,action_code,previous_status,new_status,reason)
              VALUES (?,?,'PasswordChanged',?,?,'Changed by account owner')`, [accountId, accountId, account.account_status, account.account_status])
            result = { data: { signedOut: true, message: 'Password changed. Sign in with your new password.' } }
          }
        }
        // Commit even on a wrong password so the failure count persists.
        await connection.commit()
      } catch (error) { await connection.rollback(); throw error }
      finally { connection.release() }
      if (result.error) throw result.error
      return result.data!
    },
  }
}
export const passwordChangeService = createPasswordChangeService()
