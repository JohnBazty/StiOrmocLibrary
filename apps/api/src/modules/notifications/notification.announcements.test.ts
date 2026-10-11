import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { createNotificationRepository } from './notification.repository.ts'
import { HttpError } from '../../core/http-error.ts'

for (const role of ['Librarian', 'Staff']) {
  test(`${role} publishes with its linked identity, audit revision, and active-user notifications`, async () => {
    const calls: { sql: string; values: unknown[] }[] = []
    let committed = false
    let released = false
    const connection = {
      beginTransaction: async () => {},
      execute: async (sql: string, values: unknown[] = []) => {
        calls.push({ sql, values })
        if (sql.startsWith('SELECT user_id')) return [[{ user_id: 76 }]]
        if (sql.includes('INSERT INTO announcements')) return [{ insertId: 321 }]
        return [{ affectedRows: 1 }]
      },
      commit: async () => { committed = true },
      rollback: async () => { assert.fail('Publishing unexpectedly rolled back') },
      release: () => { released = true },
    }
    const repository = createNotificationRepository({ getConnection: async () => connection } as unknown as Pool)
    const result = await repository.createAnnouncement({ accountId: 48, role }, {
      title: 'Library schedule', body: 'Library is open today.', priority: 'Important', publishAt: null, expiresAt: null,
    })
    assert.equal(result.status, 'Published')
    assert.equal(result.announcementId, 321)
    assert.deepEqual(calls[0].values, [48])
    assert.equal(calls.find(call => call.sql.includes('INSERT INTO announcements'))?.values[7], 76)
    assert.equal(calls.find(call => call.sql.includes('INSERT INTO announcement_revisions'))?.values[4], 76)
    const delivery = calls.find(call => call.sql.includes('INSERT') && call.sql.includes('INTO notifications'))
    assert.ok(delivery)
    assert.match(delivery.sql, /u.account_status = 'Active'/)
    assert.equal(delivery.values[2], 321)
    assert.equal(committed, true)
    assert.equal(released, true)
  })

  test(`${role} can load announcement history`, async () => {
    const repository = createNotificationRepository({ execute: async () => [[{
      announcement_id: 321, title: 'Library schedule', message_body: 'Open today.', priority: 'Important',
      announcement_status: 'Published', created_by: 'Temporary Staff', delivered_count: '4', read_count: '2',
    }]] } as unknown as Pool)
    const [announcement] = await repository.announcements({ accountId: 48, role })
    assert.equal(announcement.createdBy, 'Temporary Staff')
    assert.equal(announcement.deliveredCount, 4)
    assert.equal(announcement.readCount, 2)
  })
}

test('other roles cannot publish or read the management history', async () => {
  const forbiddenDatabaseCall = async () => { assert.fail('Unauthorized role accessed the database') }
  const repository = createNotificationRepository({ getConnection: forbiddenDatabaseCall, execute: forbiddenDatabaseCall } as unknown as Pool)
  for (const role of ['Admin', 'Student', 'Faculty', undefined]) {
    const actor = { accountId: 48, role }
    await assert.rejects(repository.createAnnouncement(actor, {
      title: 'Library schedule', body: 'Open today.', priority: 'Normal', publishAt: null, expiresAt: null,
    }), error => error instanceof HttpError && error.status === 403)
    await assert.rejects(repository.announcements(actor), error => error instanceof HttpError && error.status === 403)
  }
})
