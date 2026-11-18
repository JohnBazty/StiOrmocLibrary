import assert from 'node:assert/strict'
import test from 'node:test'
import { createBookRequestService } from './book-request.service.ts'
import { fakePool } from './book-request.test-helpers.ts'

const at = (iso: string) => new Date(`${iso}+08:00`)
const heldRow = { reservation_id: 501, user_id: 4, material_id: 17, book_title_id: 9, reservation_status: 'approved', request_kind: 'Reservation',
  queue_position: 1, assigned_physical_copy_id: 31, accession_id: 17, title: 'Clean Code' }

function markReadyPool() {
  return fakePool((sql) => {
    if (sql.includes('SELECT user_id,role,account_status FROM accounts')) return [{ user_id: 1, role: 'Librarian', account_status: 'Active' }]
    if (sql.includes('SELECT r.*,t.title')) return [heldRow]
    if (sql.includes('COUNT(*) AS total FROM (')) return [{ total: 1 }]
    if (sql.includes('SELECT pc.* FROM physical_copies pc JOIN titles')) return [{ physical_copy_id: 31 }]
    return undefined
  })
}

test('Mark ready uses the opening-hours deadline, not a flat 24 hours', async () => {
  const { database, calls } = markReadyPool()
  // Mon 07:30 + 24h = Tue 07:30, before opening, so the deadline is Tue 17:00.
  await createBookRequestService(database, () => at('2026-11-16T07:30')).adjustStatus(1, 501, { status: 'ready_for_pickup' })
  const update = calls.find((c) => c.sql.includes("SET reservation_status='ready_for_pickup'"))
  assert.ok(update)
  assert.equal((update.params[1] as Date).getTime(), at('2026-11-17T17:00').getTime())
})

test('Mark ready keeps exactly 24 hours when that falls in open hours', async () => {
  const { database, calls } = markReadyPool()
  await createBookRequestService(database, () => at('2026-11-16T10:00')).adjustStatus(1, 501, { status: 'ready_for_pickup' })
  const update = calls.find((c) => c.sql.includes("SET reservation_status='ready_for_pickup'"))
  assert.equal((update!.params[1] as Date).getTime(), at('2026-11-17T10:00').getTime())
})
