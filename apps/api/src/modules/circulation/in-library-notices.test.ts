import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool, PoolConnection, RowDataPacket } from '../../config/db.js'
import { manilaTime } from '../notifications/user-notices.ts'
import { createNoticeTestDatabase } from '../notifications/user-notices.test.helper.ts'
import { flagUnreturnedInLibrary, inLibraryNotice, startInLibraryUse } from './desk-circulation.service.ts'

const HAND_BACK = '2026-11-19T09:00:00.000Z'
const NOW = new Date('2026-11-19T03:00:00Z')

test('started notice names the title and Manila hand-back time and links by role', () => {
  const notice = inLibraryNotice('started', { useId: 31, userId: 7, role: 'Student', title: 'Clean Code', handBackBy: HAND_BACK })
  assert.deepEqual(notice, {
    userId: 7, title: 'In-library use started',
    body: `Clean Code is checked out for in-library use. Please hand it back at the library desk by ${manilaTime(HAND_BACK)}.`,
    triggerType: 'In-Library Use', sourceType: 'In-Library Use', sourceId: 31, actionPath: '/student/my-books', priority: 'Normal', dedupeKey: 'in-library-use:31:started',
  })
})

test('in-library notice links follow the borrower role', () => {
  const path = (role: unknown) => inLibraryNotice('started', { useId: 1, userId: 7, role, title: 'T', handBackBy: HAND_BACK }).actionPath
  assert.equal(path('Faculty'), '/faculty/my-books')
  assert.equal(path('Staff'), '/staff/notifications')
  assert.equal(path('Librarian'), '/librarian/notifications')
})

test('overdue notice asks for the hand-back without a penalty and is Important', () => {
  const notice = inLibraryNotice('overdue', { useId: 31, userId: 7, role: 'Faculty', title: 'Clean Code', handBackBy: HAND_BACK })
  assert.equal(notice.title, 'Please return the book to the desk')
  assert.equal(notice.priority, 'Important')
  assert.equal(notice.dedupeKey, 'in-library-use:31:overdue')
  assert.equal(notice.actionPath, '/faculty/my-books')
  assert.equal(notice.body, `Clean Code was due back at the library desk by ${manilaTime(HAND_BACK)}. Please return it to the library desk.`)
  assert.doesNotMatch(notice.body, /fine|penalt|charge|fee|suspend|block|₱/i)
})

type FakeOptions = { insertId: number; failNotice?: boolean }
function fakeQ({ insertId, failNotice }: FakeOptions) {
  const calls: { sql: string; values: unknown[] }[] = []
  const state = { commits: 0, rollbacks: 0 }
  const q = {
    async beginTransaction() {}, async commit() { state.commits += 1 }, async rollback() { state.rollbacks += 1 },
    async execute(sql: string, values: unknown[] = []) {
      calls.push({ sql, values })
      if (sql.includes('INSERT INTO in_library_uses')) return [{ insertId, affectedRows: 1 }]
      if (sql.includes('INSERT INTO notifications')) { if (failNotice) throw new Error('notice insert failed'); return [{ affectedRows: 1 }] }
      if (sql.includes('UPDATE research_inventory') || sql.includes('UPDATE physical_copies') || sql.includes('UPDATE materials')) return [{ affectedRows: 1 }]
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  return { q: q as unknown as Pick<PoolConnection, 'execute'>, calls, state }
}
const index = (calls: { sql: string }[], text: string) => calls.findIndex(c => c.sql.includes(text))
const bookCopy = { physical_copy_id: 20, material_id: 30, research_inventory_id: null, title: 'Clean Code', barcode: 'BOOK-20', condition_status: 'Good' } as unknown as RowDataPacket
const researchCopy = { physical_copy_id: null, material_id: null, research_inventory_id: 5, title: 'Thesis on Rice Yields', barcode: 'RES-5', condition_status: 'Good' } as unknown as RowDataPacket
const start = (copy: RowDataPacket, handBackBy: string | null = HAND_BACK) => ({ userId: 7, role: 'Student', actorAccountId: 3, attendanceLogId: 44, copy, handBackBy, now: NOW })

test('starting an in-library book use inserts the use then one notice keyed by the use id', async () => {
  const { q, calls, state } = fakeQ({ insertId: 77 })
  const result = await startInLibraryUse(q, start(bookCopy))
  assert.deepEqual(result, { useId: 77, title: 'Clean Code', barcode: 'BOOK-20', handBackBy: HAND_BACK, status: 'Open' })
  const use = calls[index(calls, 'INSERT INTO in_library_uses')]
  assert.deepEqual(use.values, [7, 20, 30, null, 44, NOW, HAND_BACK, 'Good', 3])
  const notices = calls.filter(c => c.sql.includes('INSERT INTO notifications'))
  assert.equal(notices.length, 1)
  assert.ok(index(calls, 'INSERT INTO notifications') > index(calls, 'INSERT INTO in_library_uses'))
  assert.deepEqual(notices[0].values.slice(0, 9), [7, 'In-library use started', `Clean Code is checked out for in-library use. Please hand it back at the library desk by ${manilaTime(HAND_BACK)}.`, 'In-Library Use', 'In-Library Use', 77, '/student/my-books', 'Normal', 'in-library-use:77:started'])
  assert.ok(index(calls, 'UPDATE physical_copies') >= 0 && index(calls, 'UPDATE materials') >= 0)
  assert.equal(index(calls, 'UPDATE research_inventory'), -1)
  assert.equal(state.commits, 0)
})

test('starting an in-library research item use names it by title and keys by the use id', async () => {
  const { q, calls } = fakeQ({ insertId: 78 })
  await startInLibraryUse(q, start(researchCopy))
  const notices = calls.filter(c => c.sql.includes('INSERT INTO notifications'))
  assert.equal(notices.length, 1)
  assert.match(String(notices[0].values[2]), /Thesis on Rice Yields/)
  assert.equal(notices[0].values[5], 78)
  assert.equal(notices[0].values[8], 'in-library-use:78:started')
  assert.ok(index(calls, 'UPDATE research_inventory') >= 0)
  assert.equal(index(calls, 'UPDATE physical_copies'), -1)
})

test('a failing start notice propagates, runs no later update and never commits', async () => {
  const { q, calls, state } = fakeQ({ insertId: 79, failNotice: true })
  await assert.rejects(startInLibraryUse(q, start(bookCopy)), /notice insert failed/)
  assert.equal(index(calls, 'UPDATE physical_copies'), -1)
  assert.equal(index(calls, 'UPDATE materials'), -1)
  assert.equal(state.commits, 0)
})

test('a missing hand-back time is rejected before any SQL runs', async () => {
  const { q, calls } = fakeQ({ insertId: 80 })
  await assert.rejects(startInLibraryUse(q, start(bookCopy, null)), { code: 'DESK_CUTOFF_UNAVAILABLE' })
  assert.equal(calls.length, 0)
})

test('start notice values carry no user or staff name', async () => {
  const { q, calls } = fakeQ({ insertId: 81 })
  await startInLibraryUse(q, start(bookCopy))
  const values = JSON.stringify(calls.find(c => c.sql.includes('INSERT INTO notifications'))?.values)
  assert.doesNotMatch(values, /Ana|Ben|Libby/)
})

const SWEEP_DDL = `
  CREATE TABLE users (user_id BIGINT PRIMARY KEY, user_role TEXT NOT NULL, full_name TEXT NOT NULL);
  CREATE TABLE titles (title_id BIGINT PRIMARY KEY, title TEXT NOT NULL);
  CREATE TABLE physical_copies (physical_copy_id BIGINT PRIMARY KEY, title_id BIGINT NOT NULL);
  CREATE TABLE research_inventory (research_inventory_id BIGINT PRIMARY KEY, title_id BIGINT NOT NULL);
  CREATE TABLE in_library_uses (use_id BIGINT PRIMARY KEY, user_id BIGINT NOT NULL, physical_copy_id BIGINT, research_inventory_id BIGINT, status TEXT NOT NULL,
    hand_back_by TIMESTAMPTZ NOT NULL, ended_at TIMESTAMPTZ, reviewed_at TIMESTAMPTZ, updated_at TIMESTAMPTZ);
  CREATE TABLE admin_notifications (event_type TEXT, actor_user_id BIGINT, message_title TEXT, message_body TEXT);
  CREATE TABLE library_profile_settings (settings_id BIGINT PRIMARY KEY);
  INSERT INTO library_profile_settings VALUES (1);
  INSERT INTO users VALUES (7,'Student','Ana Sweep-Student'),(8,'Faculty','Ben Sweep-Faculty');
  INSERT INTO titles VALUES (1,'Clean Code'),(2,'Thesis on Rice Yields');
  INSERT INTO physical_copies VALUES (20,1);
  INSERT INTO research_inventory VALUES (5,2);
  INSERT INTO in_library_uses VALUES
    (1,7,20,NULL,'Open',    '2026-11-19T01:00:00Z',NULL,NULL,NULL),
    (2,8,NULL,5,'Open',     '2026-11-19T01:30:00Z',NULL,NULL,NULL),
    (3,7,20,NULL,'Returned','2026-11-19T01:00:00Z','2026-11-19T00:30:00Z',NULL,NULL),
    (4,7,20,NULL,'Open',    '2026-11-19T04:00:00Z',NULL,NULL,NULL);`
const SWEEP_NOW = new Date('2026-11-19T02:00:00Z')

async function sweepDb() {
  const { pg, pool } = await createNoticeTestDatabase(SWEEP_DDL)
  const notices = async () => (await pg.query<Record<string, unknown>>('SELECT * FROM notifications ORDER BY dedupe_key')).rows
  return { pg, pool, notices }
}

test('the sweep sends one hand-back notice per use it moves to Review and none for handed-back or not-due uses', async () => {
  const { pg, pool, notices } = await sweepDb()
  assert.deepEqual(await flagUnreturnedInLibrary(pool, SWEEP_NOW), { flagged: 2 })
  const rows = await notices()
  assert.deepEqual(rows.map(r => [r.dedupe_key, r.user_id, r.action_path]), [
    ['in-library-use:1:overdue', 7, '/student/my-books'], ['in-library-use:2:overdue', 8, '/faculty/my-books'],
  ])
  assert.ok(rows.every(r => r.message_title === 'Please return the book to the desk' && r.priority === 'Important' && r.source_type === 'In-Library Use'))
  assert.equal(rows[0].message_body, `Clean Code was due back at the library desk by ${manilaTime('2026-11-19T01:00:00Z')}. Please return it to the library desk.`)
  assert.equal(rows[1].message_body, `Thesis on Rice Yields was due back at the library desk by ${manilaTime('2026-11-19T01:30:00Z')}. Please return it to the library desk.`)
  assert.equal((await pg.query('SELECT 1 FROM admin_notifications WHERE event_type = \'in_library_handback_missing\'')).rows.length, 2)
  assert.deepEqual((await pg.query('SELECT use_id, status FROM in_library_uses ORDER BY use_id')).rows.map(r => (r as { status: string }).status), ['Review', 'Review', 'Returned', 'Open'])
})

test('a second sweep sends nothing more', async () => {
  const { pool, notices } = await sweepDb()
  await flagUnreturnedInLibrary(pool, SWEEP_NOW)
  assert.deepEqual(await flagUnreturnedInLibrary(pool, SWEEP_NOW), { flagged: 0 })
  assert.equal((await notices()).length, 2)
})

test('overdue notices name no user and threaten no penalty', async () => {
  const { pool, notices } = await sweepDb()
  await flagUnreturnedInLibrary(pool, SWEEP_NOW)
  for (const row of await notices()) {
    assert.doesNotMatch(String(row.message_body), /fine|penalt|charge|fee|suspend|block|₱/i)
    assert.doesNotMatch(JSON.stringify(row), /Ana Sweep-Student|Ben Sweep-Faculty/)
  }
})

test('a failing overdue notice rolls the whole sweep back', async () => {
  const { pg, pool, notices } = await sweepDb()
  const failing = {
    ...pool,
    async getConnection() {
      const conn = await pool.getConnection()
      const execute = async (sql: string, values?: unknown[]) => { if (sql.includes('INSERT INTO notifications')) throw new Error('notice insert failed'); return conn.execute(sql, values) }
      return { ...conn, execute, query: execute, rollback: () => conn.rollback(), commit: () => conn.commit(), beginTransaction: () => conn.beginTransaction(), release() {} }
    },
  } as unknown as Pool
  await assert.rejects(flagUnreturnedInLibrary(failing, SWEEP_NOW), /notice insert failed/)
  assert.deepEqual((await pg.query('SELECT status FROM in_library_uses WHERE use_id IN (1,2)')).rows.map(r => (r as { status: string }).status), ['Open', 'Open'])
  assert.equal((await notices()).length, 0)
  assert.equal((await pg.query('SELECT 1 FROM admin_notifications')).rows.length, 0)
})
