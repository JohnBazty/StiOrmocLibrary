import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
import { createNotificationRepository } from './notification.repository.ts'
import { HttpError } from '../../core/http-error.ts'

for (const role of ['Admin', 'Librarian', 'Staff']) {
  test(`${role} inbox reads and changes only its linked profile`, async () => {
    const calls: { sql: string; values: unknown[] }[] = []
    const database = { execute: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values })
      if (sql.startsWith('SELECT user_id')) return [[{ user_id: 81 }]]
      if (sql.startsWith('UPDATE')) return [{ affectedRows: 0 }]
      return [[]]
    } } as unknown as Pool
    const repository = createNotificationRepository(database)
    await repository.list({ accountId: 14, role }, { userId: 99 })
    const reads = calls.filter(call => call.sql.includes('FROM notifications'))
    assert.equal(reads.length, 2)
    for (const read of reads) { assert.match(read.sql, /user_id = \?/); assert.deepEqual(read.values, [81]) }
    await assert.rejects(repository.markRead({ accountId: 14, role }, 99), error => error instanceof HttpError && error.status === 404)
    assert.deepEqual(calls.at(-1)?.values, [99, 81])
  })
}

test('a technical Admin without a library profile has an empty personal inbox without creating a profile', async () => {
  const calls: string[] = []
  const database = { execute: async (sql: string) => { calls.push(sql); return [[]] } } as unknown as Pool
  const result = await createNotificationRepository(database).list({ accountId: 14, role: 'Admin' }, {})
  assert.deepEqual(result.items, [])
  assert.equal(result.unreadCount, 0)
  assert.ok(calls.every(sql => sql.trimStart().startsWith('SELECT')))
})

test('an unlinked Staff profile still reports its setup error', async () => {
  const database = { execute: async () => [[]] } as unknown as Pool
  await assert.rejects(createNotificationRepository(database).list({ accountId: 14, role: 'Staff' }, {}), error => error instanceof HttpError && error.code === 'NOTIFICATION_PROFILE_NOT_LINKED')
})
