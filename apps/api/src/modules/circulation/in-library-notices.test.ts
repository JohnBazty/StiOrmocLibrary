import assert from 'node:assert/strict'
import test from 'node:test'
import type { PoolConnection, RowDataPacket } from '../../config/db.js'
import { manilaTime } from '../notifications/user-notices.ts'
import { inLibraryNotice, startInLibraryUse } from './desk-circulation.service.ts'

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
