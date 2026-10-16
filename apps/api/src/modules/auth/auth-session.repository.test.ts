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

function revocationDatabase({ accountVersion = 4, userVersion = 9, linked = true, fail = false } = {}) {
  const writes: string[] = []
  let committed = false, rolledBack = false, released = false
  const connection = {
    beginTransaction: async () => {},
    commit: async () => { committed = true },
    rollback: async () => { rolledBack = true },
    release: () => { released = true },
    execute: async (sql: string, values: unknown[] = []) => {
      writes.push(sql)
      if (sql.startsWith('SELECT account_id')) return [linked ? [{ account_id: 5, user_id: 12, auth_version: accountVersion }] : []]
      if (sql.startsWith('SELECT user_id')) return [[{ user_id: 12, auth_version: userVersion }]]
      if (fail && sql.startsWith('UPDATE users')) throw new Error('Write failed')
      if (sql.startsWith('SELECT auth_version FROM accounts')) return [[{ auth_version: accountVersion + 1 }]]
      if (sql.startsWith('SELECT auth_version FROM users')) return [[{ auth_version: userVersion + 1 }]]
      if (sql.startsWith('DELETE FROM auth_sessions')) assert.deepEqual(values, [12])
      return [{ affectedRows: 1 }]
    },
  }
  return { sessions: createAuthSessionRepository({ getConnection: async () => connection } as never), writes,
    outcome: () => ({ committed, rolledBack, released }) }
}

test('bearer logout revokes both linked versions and cookie sessions atomically despite differing versions', async () => {
  const f = revocationDatabase()
  assert.equal(await f.sessions.revokeCurrentVersion({ accountId: 5, authVersion: 4 }), true)
  assert.ok(f.writes.find(sql => sql.startsWith('UPDATE accounts')))
  assert.ok(f.writes.find(sql => sql.startsWith('UPDATE users')))
  assert.ok(f.writes.find(sql => sql.startsWith('DELETE FROM auth_sessions')))
  assert.deepEqual(f.outcome(), { committed: true, rolledBack: false, released: true })
})

test('cookie logout checks its user version when the account version differs', async () => {
  const f = revocationDatabase()
  assert.equal(await f.sessions.revokeCurrentVersion({ userId: 12, authVersion: 9 }), true)
  assert.match(f.writes[0], /FROM accounts.*FOR UPDATE/)
  assert.match(f.writes[1], /FROM users.*FOR UPDATE/)
  assert.equal(f.outcome().committed, true)
})

test('an older logout never writes or removes sessions belonging to a newer login', async () => {
  for (const identity of [{ accountId: 5, authVersion: 3 }, { userId: 12, authVersion: 8 }]) {
    const f = revocationDatabase()
    assert.equal(await f.sessions.revokeCurrentVersion(identity), false)
    assert.equal(f.writes.some(sql => /^(UPDATE|DELETE)/.test(sql)), false)
    assert.deepEqual(f.outcome(), { committed: false, rolledBack: true, released: true })
  }
})

test('cookie logout also supports a legacy user without a linked account', async () => {
  const f = revocationDatabase({ linked: false })
  assert.equal(await f.sessions.revokeCurrentVersion({ userId: 12, authVersion: 9 }), true)
  assert.equal(f.writes.some(sql => sql.startsWith('UPDATE accounts')), false)
  assert.ok(f.writes.some(sql => sql.startsWith('UPDATE users')))
})

test('missing bearer account cannot revoke another identity', async () => {
  const f = revocationDatabase({ linked: false })
  assert.equal(await f.sessions.revokeCurrentVersion({ accountId: 5, authVersion: 4 }), false)
  assert.equal(f.writes.some(sql => /^(UPDATE|DELETE)/.test(sql)), false)
})

test('a linked-version failure rolls back logout revocation and releases the connection', async () => {
  const f = revocationDatabase({ fail: true })
  await assert.rejects(f.sessions.revokeCurrentVersion({ accountId: 5, authVersion: 4 }), /Write failed/)
  assert.deepEqual(f.outcome(), { committed: false, rolledBack: true, released: true })
})
