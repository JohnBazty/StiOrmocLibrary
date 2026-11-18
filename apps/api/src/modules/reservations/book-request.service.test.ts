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

test('a blocked first borrower is skipped with a recorded reason and the copy goes to the next one', async () => {
  const waiting = [
    { reservation_id: 501, user_id: 8, material_id: 17, book_title_id: 9, reservation_status: 'pending', request_kind: 'Reservation', queue_position: 1 },
    { reservation_id: 502, user_id: 9, material_id: 17, book_title_id: 9, reservation_status: 'pending', request_kind: 'Reservation', queue_position: 2 },
  ]
  const { database, calls } = fakePool((sql, params) => {
    if (sql.includes('SELECT pc.*,t.title FROM physical_copies')) return [{ physical_copy_id: 31, material_id: 17, title: 'Clean Code', barcode: 'B-31' }]
    if (sql.includes('SELECT * FROM reservations WHERE book_title_id=?')) return waiting
    if (sql.includes('FROM fines f LEFT JOIN')) return [{ balance: params[0] === 8 ? 100 : 0 }]
    return undefined
  })
  const { allocateWaitingRequests } = await import('./book-request.service.ts')
  const assigned = await allocateWaitingRequests(await database.getConnection(), 9, at('2026-11-16T10:00'))
  assert.deepEqual(assigned, [502])
  const skip = calls.find((c) => c.sql.includes('SET last_skip_reason=?'))!
  assert.match(String(skip.params[0]), /outstanding library balance/)
  assert.equal(skip.params[2], 501)
  const assign = calls.find((c) => c.sql.includes("reservation_status='approved'"))!
  assert.match(assign.sql, /last_skip_reason=NULL,last_skipped_at=NULL/)
  assert.equal(assign.params.at(-1), 502)
  assert.ok(!calls.some((c) => /SET queue_position/.test(c.sql)), 'the skipped request keeps its position')
})

test('ending a request clears its skip reason', async () => {
  const { database, calls } = fakePool(() => undefined)
  const { releaseBookRequest } = await import('./book-request.service.ts')
  await releaseBookRequest(await database.getConnection(), { reservation_id: 501, reservation_status: 'pending', request_kind: 'Reservation', book_title_id: 9, queue_position: 1 } as never, 'cancelled', 1, new Date())
  assert.match(calls.find((c) => c.sql.startsWith('UPDATE reservations SET reservation_status=?'))!.sql, /last_skip_reason=NULL/)
})

// ---- Pickup window from the saved settings (SPEC R1, R2, R8)
function windowPool(windowDays: number | null) {
  return fakePool((sql) => {
    if (windowDays != null && sql.includes('to_regclass')) return [{ present: true }]
    if (windowDays != null && sql.includes('FROM reservation_settings')) return [{ pickup_window_days: windowDays, waiting_expiry_days: null, waiting_expiry_saved_at: null }]
    if (sql.includes('SELECT r.user_id,r.request_kind')) return [{ user_id: 4, request_kind: 'Reservation', assigned_physical_copy_id: 31, deadline: null, email: null, user_role: 'Student', title: 'Clean Code' }]
    if (sql.includes('SELECT user_id,role,account_status FROM accounts')) return [{ user_id: 1, role: 'Librarian', account_status: 'Active' }]
    if (sql.includes('SELECT r.*,t.title')) return [heldRow]
    if (sql.includes('COUNT(*) AS total FROM (')) return [{ total: 1 }]
    if (sql.includes('SELECT pc.* FROM physical_copies pc JOIN titles')) return [{ physical_copy_id: 31 }]
    return undefined
  })
}
async function markReady(windowDays: number | null) {
  const { database, calls } = windowPool(windowDays)
  await createBookRequestService(database, () => at('2026-11-16T10:00')).adjustStatus(1, 501, { status: 'ready_for_pickup' })
  const update = calls.find((c) => c.sql.includes("SET reservation_status='ready_for_pickup'"))!
  const notice = calls.find((c) => c.sql.includes('INTO notifications') && String(c.params.at(-1)).startsWith('book-request:'))!
  return { deadline: (update.params[1] as Date).getTime(), body: String(notice.params[2]) }
}

test('Mark ready with window 3 stores the deadline three days later and the notice says within 3 days (AC 1, AC 19)', async () => {
  const { deadline, body } = await markReady(3)
  assert.equal(deadline, at('2026-11-19T10:00').getTime())
  assert.match(body, /within 3 days/)
  assert.doesNotMatch(body, /24 hours/)
})
test('Mark ready with no settings row keeps one day and says within 1 day (AC 2, AC 19)', async () => {
  const { deadline, body } = await markReady(null)
  assert.equal(deadline, at('2026-11-17T10:00').getTime())
  assert.match(body, /within 1 day\b/)
  assert.doesNotMatch(body, /1 days|24 hours/)
})
test('the next Mark ready after saving window 5 uses five days (R2)', async () => {
  assert.equal((await markReady(5)).deadline, at('2026-11-21T10:00').getTime())
})
test('a supplied pickup deadline is rejected with the saved window in the message', async () => {
  for (const [windowDays, text] of [[3, '3 days'], [null, '1 day']] as const) {
    const { database } = windowPool(windowDays)
    await assert.rejects(createBookRequestService(database).adjustStatus(1, 501, { status: 'ready_for_pickup', pickupDeadline: '2026-12-01T10:00:00Z' }),
      (e: any) => e.code === 'PICKUP_DEADLINE_FIXED' && e.message.includes(`fixed at ${text} from Mark ready`))
  }
})
