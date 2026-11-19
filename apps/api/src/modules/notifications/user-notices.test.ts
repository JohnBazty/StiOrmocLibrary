import assert from 'node:assert/strict'
import test from 'node:test'
import { insertUserNotice, manilaTime, rolePath, type UserNotice } from './user-notices.ts'
import { createNoticeTestDatabase } from './user-notices.test.helper.ts'

test('rolePath links each role to a page that exists for it', () => {
  assert.equal(rolePath('Student', 'borrowing'), '/student/borrowing')
  assert.equal(rolePath('Faculty', 'my-books'), '/faculty/my-books')
  assert.equal(rolePath('Student', 'clearance'), '/student/clearance')
  assert.equal(rolePath('Faculty', 'clearance'), '/faculty/clearance')
  assert.equal(rolePath('Student', 'printing'), '/student/printing')
  assert.equal(rolePath('Staff', 'printing'), '/staff/printing')
  assert.equal(rolePath('Faculty', 'printing'), '/faculty/notifications')
  assert.equal(rolePath('Staff', 'my-books'), '/staff/notifications')
  assert.equal(rolePath('Librarian', 'borrowing'), '/librarian/notifications')
  assert.equal(rolePath(null, 'borrowing'), null)
  assert.equal(rolePath(undefined, 'my-books'), null)
  assert.equal(rolePath('System Administrator', 'my-books'), null)
})

test('manilaTime formats in Asia/Manila', () => {
  assert.match(manilaTime(new Date('2026-11-19T07:10:00Z')), /^Nov 19, 2026, 3:10\sPM$/)
})

const notice = (over: Partial<UserNotice> = {}): UserNotice => ({
  userId: 7, title: 'Book returned', body: 'Clean Code was returned.', triggerType: 'Return', sourceType: 'Borrow Transaction',
  sourceId: 8, actionPath: '/student/borrowing', priority: 'Normal', dedupeKey: 'loan:8:returned', ...over,
})

test('insertUserNotice stores every column and ignores a repeated dedupe key', async () => {
  const { pg, pool } = await createNoticeTestDatabase()
  await insertUserNotice(pool, notice())
  await insertUserNotice(pool, notice({ body: 'second try' }))
  let rows = (await pg.query<Record<string, unknown>>('SELECT * FROM notifications')).rows
  assert.equal(rows.length, 1)
  assert.equal(rows[0].message_title, 'Book returned'); assert.equal(rows[0].message_body, 'Clean Code was returned.')
  assert.equal(rows[0].trigger_type, 'Return'); assert.equal(rows[0].source_type, 'Borrow Transaction')
  assert.equal(Number(rows[0].source_id), 8); assert.equal(rows[0].action_path, '/student/borrowing')
  assert.equal(rows[0].priority, 'Normal'); assert.equal(rows[0].dedupe_key, 'loan:8:returned')
  assert.ok(rows[0].scheduled_for); assert.ok(rows[0].delivered_at)
  await insertUserNotice(pool, notice({ dedupeKey: 'loan:9:returned' }))
  rows = (await pg.query<Record<string, unknown>>('SELECT * FROM notifications')).rows
  assert.equal(rows.length, 2)
})

test('insertUserNotice rejects an over-long title so the caller rolls back', async () => {
  const { pool } = await createNoticeTestDatabase()
  await assert.rejects(insertUserNotice(pool, notice({ title: 'x'.repeat(151) })))
})
