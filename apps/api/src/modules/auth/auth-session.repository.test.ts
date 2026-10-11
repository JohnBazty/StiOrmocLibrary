import assert from 'node:assert/strict'
import test from 'node:test'
import { createAuthSessionRepository } from './auth-session.repository.ts'

test('incrementAuthVersionForAccount bumps accounts and linked users in one transaction', async () => {
  const writes: Array<{ sql: string; values: unknown[] }> = []
  let committed = false
  const connection = {
    beginTransaction: async () => undefined,
    execute: async (sql: string, values: unknown[] = []) => {
      writes.push({ sql, values })
      if (sql.includes('FROM accounts') && sql.includes('FOR UPDATE')) {
        return [[{ account_id: 5, user_id: 12 }]]
      }
      if (sql.includes('SELECT auth_version FROM accounts')) {
        return [[{ auth_version: 4 }]]
      }
      return [[{}]]
    },
    commit: async () => { committed = true },
    rollback: async () => undefined,
    release: () => undefined,
  }
  const database = {
    getConnection: async () => connection,
    execute: async () => { throw new Error('pool execute should not be used for version bump') },
  } as never
  const sessions = createAuthSessionRepository(database)
  const version = await sessions.incrementAuthVersionForAccount(5)
  assert.equal(version, 4)
  assert.equal(committed, true)
  assert.equal(writes.some(({ sql }) => sql.includes('UPDATE accounts SET auth_version=auth_version+1')), true)
  assert.equal(writes.some(({ sql }) => sql.includes('UPDATE users SET auth_version=auth_version+1')), true)
})

test('clearOtherSessions keeps the current session id', async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = []
  const database = {
    getConnection: async () => { throw new Error('unused') },
    execute: async (sql: string, values: unknown[]) => {
      calls.push({ sql, values })
      return [{}]
    },
  } as never
  const sessions = createAuthSessionRepository(database)
  await sessions.clearOtherSessions(17, 'keep-me')
  assert.equal(calls.length, 1)
  assert.match(calls[0].sql, /DELETE FROM auth_sessions/)
  assert.deepEqual(calls[0].values, ['keep-me', 17])
})

test('cookie login returns the user version when linked account versions differ', async () => {
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    execute: async (sql: string) => {
      if (sql.includes('SELECT user_id FROM users')) return [[{ user_id: 12 }]]
      if (sql.includes('SELECT account_id FROM accounts')) return [[{ account_id: 5 }]]
      if (sql.includes('SELECT auth_version FROM users')) return [[{ auth_version: 9 }]]
      if (sql.includes('SELECT auth_version FROM accounts')) return [[{ auth_version: 4 }]]
      return [{ affectedRows: 1 }]
    },
  }
  const sessions = createAuthSessionRepository({ getConnection: async () => connection } as never)
  assert.equal(await sessions.incrementAuthVersionForUser(12), 9)
})
