import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../../core/http-error.ts'
import { ACCOUNT_LOCK_MS, ACCOUNT_LOCK_THRESHOLD, accountLockIdentifier, createLoginSecurityService } from './login-security.service.ts'

// One in-memory login_attempt_windows row, enough for the lockout path.
function lockoutDatabase() {
  const rows = new Map<string, { failed_count: number; window_started_at: Date; locked_until: Date | null }>()
  const execute = async (sql: string, values: unknown[] = []) => {
    if (sql.startsWith('SELECT a.account_id FROM accounts')) return [[{ account_id: 7 }]]
    const key = String(values.at(-1))
    if (sql.startsWith('INSERT INTO login_attempt_windows')) {
      if (!rows.has(String(values[0]))) rows.set(String(values[0]), { failed_count: 0, window_started_at: new Date(clock), locked_until: null })
      return [{ affectedRows: 1 }]
    }
    if (sql.startsWith('SELECT * FROM login_attempt_windows')) return [[{ ...rows.get(String(values[0])) }]]
    if (sql.startsWith('UPDATE login_attempt_windows SET failed_count=0,locked_until=NULL,window_started_at=?')) {
      Object.assign(rows.get(key)!, { failed_count: 0, locked_until: null, window_started_at: values[0] }); return [{ affectedRows: 1 }]
    }
    if (sql.startsWith('UPDATE login_attempt_windows SET failed_count=?,locked_until=?')) {
      Object.assign(rows.get(key)!, { failed_count: values[0], locked_until: values[1] }); return [{ affectedRows: 1 }]
    }
    throw new Error(`Unexpected SQL in test: ${sql}`)
  }
  const connection = { execute, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {} }
  return { rows, database: { execute, getConnection: async () => connection } as never }
}
let clock = Date.UTC(2026, 10, 11, 1, 0, 0)
const wrongPassword = async () => { throw new HttpError(401, 'INVALID_CREDENTIALS', 'Wrong credentials.') }
const attempt = (service: ReturnType<typeof createLoginSecurityService>) =>
  service.login({ school_id: '02000123456', password: 'wrong-password' }).then(() => null, (error: HttpError) => error)

test('the lock is 5 wrong passwords and 15 minutes', () => {
  assert.equal(ACCOUNT_LOCK_THRESHOLD, 5)
  assert.equal(ACCOUNT_LOCK_MS, 15 * 60_000)
})

test('five wrong passwords pause sign-in for 15 minutes with the remaining-attempts reply first', async () => {
  clock = Date.UTC(2026, 10, 11, 1, 0, 0)
  const { database, rows } = lockoutDatabase()
  const service = createLoginSecurityService(database, wrongPassword, async () => {}, () => clock)
  const replies = []
  for (let index = 0; index < 4; index++) replies.push(await attempt(service))
  assert.deepEqual(replies.map(error => [error?.status, error?.code]), Array(4).fill([401, 'INVALID_CREDENTIALS']))
  assert.equal(replies[0]?.message, 'Wrong credentials.')
  assert.equal(replies[1]?.message, 'Wrong credentials. 3 attempts remaining.')
  assert.equal(replies[3]?.message, 'Wrong credentials. 1 attempts remaining.')
  const fifth = await attempt(service)
  assert.equal(fifth?.status, 429)
  assert.equal(fifth?.code, 'LOGIN_PAUSED')
  assert.equal(fifth?.message, 'Too many wrong attempts. Try again in 15 minutes.')
  const row = rows.get(accountLockIdentifier(7))!
  assert.equal(new Date(row.locked_until!).getTime(), clock + 15 * 60_000)
  clock += 14 * 60_000
  const paused = await attempt(service)
  assert.equal(paused?.code, 'LOGIN_PAUSED')
  assert.equal(paused?.message, 'Sign-in is paused. Try again in 1 minute.')
  clock += 60_000
  const afterLock = await attempt(service)
  assert.equal(afterLock?.code, 'INVALID_CREDENTIALS')
  assert.equal(row.failed_count, 1)
})

test('the counting window is 15 minutes', async () => {
  clock = Date.UTC(2026, 10, 11, 2, 0, 0)
  const { database, rows } = lockoutDatabase()
  const service = createLoginSecurityService(database, wrongPassword, async () => {}, () => clock)
  for (let index = 0; index < 4; index++) await attempt(service)
  clock += 14 * 60_000
  assert.equal((await attempt(service))?.code, 'LOGIN_PAUSED')
  clock += 16 * 60_000
  for (let index = 0; index < 4; index++) await attempt(service)
  clock += 15 * 60_000
  assert.equal((await attempt(service))?.code, 'INVALID_CREDENTIALS')
  assert.equal(rows.get(accountLockIdentifier(7))!.failed_count, 1)
})
