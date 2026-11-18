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

function cartHandler(sql: string) {
  {
    if (sql.includes('SELECT user_id,role,account_status FROM accounts')) return [{ user_id: 4, role: 'Student', account_status: 'Active' }]
    if (sql.includes('SELECT t.*,MIN(pc.material_id)')) return [{ title_id: 9, material_id: 17, title: 'Clean Code', record_type: 'Book' }]
    if (sql.includes('COUNT(*) AS total FROM (')) return [{ total: 0 }]
    if (sql.includes('COUNT(*) AS n FROM reservations')) return [{ n: 0 }]
    if (sql.includes('SELECT pc.* FROM physical_copies pc JOIN titles')) return [{ physical_copy_id: 31, material_id: 17 }]
    if (sql.includes('AS position FROM reservations')) return [{ position: 1 }]
    if (sql.includes('INSERT INTO reservations')) return { insertId: 501, affectedRows: 1 }
    if (sql.includes('SELECT r.*,t.title')) return [{ reservation_id: 501, user_id: 4, material_id: 17, request_kind: 'CartHandover', reservation_status: 'approved', queue_position: 1, assigned_physical_copy_id: 31 }]
    return undefined
  }
}
const cartPool = () => fakePool(cartHandler)
async function cartDeadline(now: string, closedDay?: string) {
  const { database, calls } = cartPool()
  const wrapped = closedDay ? { ...database, getConnection: async () => {
    const c = await database.getConnection() as any
    const execute = c.execute.bind(c)
    c.execute = async (sql: string, p: unknown[]) => sql.includes('FROM library_closed_days') ? [[{ closed_date: closedDay }]] : execute(sql, p)
    return c
  } } : database
  await createBookRequestService(wrapped as never, () => at(now)).submitCart(1, [9], 'cart-request-key-0001')
  const insert = calls.find((c) => c.sql.includes('INSERT INTO reservations'))!
  return (insert.params[insert.params.length - 1] as Date).getTime()
}

test('cart submitted at 10:00 on an open day expires at that day closing', async () => {
  assert.equal(await cartDeadline('2026-11-16T10:00'), at('2026-11-16T17:00').getTime())
})
test('cart submitted after closing or exactly at closing expires at the next open day closing', async () => {
  assert.equal(await cartDeadline('2026-11-16T18:00'), at('2026-11-17T17:00').getTime())
  assert.equal(await cartDeadline('2026-11-16T17:00'), at('2026-11-17T17:00').getTime())
})
test('cart submitted before a closed date gets the next open day closing', async () => {
  assert.equal(await cartDeadline('2026-11-16T10:00', '2026-11-16'), at('2026-11-17T17:00').getTime())
})
test('cart is rejected when the library has no open day', async () => {
  const { database } = fakePool((sql) => sql.includes('FROM library_operating_schedule') && sql.includes('opens_at') ? [] : cartHandler(sql))
  await assert.rejects(createBookRequestService(database, () => at('2026-11-16T10:00')).submitCart(1, [9], 'cart-request-key-0001'),
    (e: any) => e.code === 'LIBRARY_CLOSED_NO_SCHEDULE')
})

test('expire releases an expired cart handover with one cart-worded notice', async () => {
  const { database, calls } = fakePool((sql) => {
    if (sql.includes('SELECT r.* FROM reservations r')) return [{ reservation_id: 77, user_id: 4, accession_id: 17, assigned_physical_copy_id: 31, book_title_id: 9, reservation_status: 'approved', request_kind: 'CartHandover', queue_position: 1 }]
    if (sql.includes('SELECT r.user_id,r.request_kind')) return [{ user_id: 4, request_kind: 'CartHandover', assigned_physical_copy_id: 31, deadline: null, email: null, user_role: 'Student', title: 'Clean Code' }]
    return undefined
  })
  const result = await createBookRequestService(database).expire(at('2026-11-16T17:01'))
  assert.equal(result.expiredCount, 1)
  const select = calls.find((c) => c.sql.includes('SELECT r.* FROM reservations r'))!
  assert.match(select.sql, /request_kind='CartHandover'/)
  const notices = calls.filter((c) => c.sql.includes('INTO notifications'))
  assert.equal(notices.length, 1)
  assert.match(String(notices[0].params[2]), /cart handover expired at closing/)
  assert.ok(calls.some((c) => c.sql.includes("SET reservation_status=?") && c.params[0] === 'expired'))
  const claim = calls.find((c) => c.sql.includes('UPDATE borrow_transactions'))!
  assert.match(String(claim.params[1]), /cart/i)
})

test('an unusable held copy moves the ready hold to a spare copy at the same queue position', async () => {
  const hold = { reservation_id: 501, user_id: 4, material_id: 17, book_title_id: 9, reservation_status: 'ready_for_pickup', request_kind: 'Reservation', queue_position: 2, assigned_physical_copy_id: 31, accession_id: 17 }
  const { database, calls } = fakePool((sql) => {
    if (sql.includes('SELECT * FROM reservations WHERE assigned_physical_copy_id')) return [hold]
    if (sql.includes('SELECT * FROM reservations WHERE book_title_id=?')) return [{ ...hold, reservation_status: 'pending', assigned_physical_copy_id: null }]
    if (sql.includes('SELECT pc.*,t.title FROM physical_copies')) return [{ physical_copy_id: 32, material_id: 18, title: 'Clean Code', barcode: 'B-32' }]
    return undefined
  })
  const q = await database.getConnection()
  const { releaseLostCopyHolds } = await import('./book-request.service.ts')
  assert.equal(await releaseLostCopyHolds(q, 31, 1, at('2026-11-16T10:00'), 'unusable'), 1)
  const release = calls.find((c) => c.sql.includes("reservation_status='pending'"))!
  assert.doesNotMatch(release.sql, /queue_position/)
  const assign = calls.find((c) => c.sql.includes("reservation_status='approved'"))!
  assert.equal(assign.params[1], 32)
  assert.ok(!calls.some((c) => /SET queue_position/.test(c.sql)), 'queue positions are untouched')
  assert.ok(calls.some((c) => c.sql.includes('INTO notifications') && String(c.params.at(-2)).includes('copy-unusable')))
})
