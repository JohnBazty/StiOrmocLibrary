import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { HttpError } from '../../core/http-error.ts'
import { allocateWaitingRequests, createBookRequestService, releaseLostCopyHolds } from './book-request.service.ts'
import { createReservationService } from './reservation.service.ts'
import { createReservationController } from './reservation.controller.ts'
import { createReservationsRouter, createUserReservationsV1Router } from './reservations.routes.ts'
import { fakePool } from './book-request.test-helpers.ts'

const at = (iso: string) => new Date(`${iso}+08:00`)
const staff = [{ user_id: 1, role: 'Librarian', account_status: 'Active' }]
const base = { user_id: 4, material_id: 17, book_title_id: 9, request_kind: 'Reservation' }

// ---- A1 concurrency (SQL-shape tested: the repo has no Postgres harness)
test('allocation and release never touch a copy held by another request', async () => {
  const held = { ...base, reservation_id: 600, reservation_status: 'approved', queue_position: 1, assigned_physical_copy_id: 31 }
  const waiting = { ...base, user_id: 9, reservation_id: 601, reservation_status: 'pending', queue_position: 2, assigned_physical_copy_id: null }
  let candidateSql = ''
  const { database, calls } = fakePool((sql, params) => {
    if (sql.includes('SELECT pc.*,t.title FROM physical_copies')) { candidateSql = sql; return [{ physical_copy_id: 32, material_id: 18, title: 'Clean Code', barcode: 'B-32' }] }
    if (sql.includes('SELECT * FROM reservations WHERE book_title_id=?')) return [waiting]
    if (sql.includes('SELECT * FROM reservations WHERE assigned_physical_copy_id')) return params[0] === 31 ? [held] : [{ ...waiting, reservation_status: 'approved', assigned_physical_copy_id: 32 }]
    return undefined
  })
  const q = await database.getConnection()
  assert.deepEqual(await allocateWaitingRequests(q, 9, at('2026-11-16T10:00')), [601])
  assert.match(candidateSql, /FOR UPDATE OF pc/)
  assert.match(candidateSql, /NOT EXISTS\(SELECT 1 FROM reservations r WHERE r\.assigned_physical_copy_id=pc\.physical_copy_id AND r\.reservation_status IN/)
  const assign = calls.find((c) => c.sql.includes("reservation_status='approved'"))!
  assert.equal(assign.params[1], 32)
  await releaseLostCopyHolds(q, 32, 1, at('2026-11-16T10:00'), 'unusable')
  const lookups = calls.filter((c) => c.sql.includes('WHERE assigned_physical_copy_id = ?'))
  assert.deepEqual(lookups.map((c) => c.params), [[32]])
  assert.ok(!calls.some((c) => c.sql.startsWith('UPDATE reservations') && c.params.includes(600)), 'the hold on copy 31 is never changed')
})

test('swapping onto a copy another request holds is a 409', async () => {
  const { database } = fakePool((sql) => {
    if (sql.includes('SELECT user_id,role,account_status FROM accounts')) return staff
    if (sql.includes('SELECT r.*,t.title')) return [{ ...base, reservation_id: 601, reservation_status: 'approved', queue_position: 2, assigned_physical_copy_id: 32 }]
    if (sql.includes('FROM physical_copies WHERE physical_copy_id IN')) return [{ physical_copy_id: 31, title_id: 9, material_id: 17 }, { physical_copy_id: 32, title_id: 9, material_id: 18 }]
    if (sql.includes('assigned_physical_copy_id=? AND reservation_status IN')) return [{ reservation_id: 600 }]
    return undefined
  })
  await assert.rejects(createReservationService(database).swapCopy(1, 601, { physicalCopyId: 31 }), (e: unknown) => e instanceof HttpError && e.status === 409)
})

// ---- A2 re-ready on a new copy
test('re-readying a hold on a new copy records two ready events and two notices', async () => {
  let copy = 31
  const events = new Set<string>(), notices = new Set<string>()
  let eventInserts = 0
  const { database } = fakePool((sql, params) => {
    if (sql.includes('SELECT user_id,role,account_status FROM accounts')) return staff
    if (sql.includes('SELECT r.*,t.title')) return [{ ...base, reservation_id: 501, reservation_status: 'approved', queue_position: 1, assigned_physical_copy_id: copy, accession_id: 17, title: 'Clean Code' }]
    if (sql.includes('COUNT(*) AS total FROM (')) return [{ total: 1 }]
    if (sql.includes('SELECT pc.* FROM physical_copies pc JOIN titles')) return [{ physical_copy_id: copy }]
    if (sql.includes('SELECT r.user_id,r.request_kind')) return [{ user_id: 4, request_kind: 'Reservation', assigned_physical_copy_id: copy, deadline: null, email: null, user_role: 'Student', title: 'Clean Code' }]
    if (sql.includes('INSERT INTO book_request_events')) {
      const key = `${params[0]}:${params[1]}:${params[2]}`
      if (events.has(key)) return { affectedRows: 0, insertId: 0 }
      events.add(key); eventInserts++
      return { affectedRows: 1, insertId: eventInserts }
    }
    if (sql.includes('INTO notifications')) { notices.add(String(params.at(-1))); return { affectedRows: 1 } }
    return undefined
  })
  const service = createBookRequestService(database, () => at('2026-11-16T10:00'))
  await service.adjustStatus(1, 501, { status: 'ready_for_pickup' })
  copy = 32 // the first copy became unusable; the hold was re-assigned and is prepared again
  await service.adjustStatus(1, 501, { status: 'ready_for_pickup' })
  assert.equal([...events].filter((k) => k.includes('ready_for_pickup')).length, 2)
  assert.ok(notices.has('book-request:501:ready_for_pickup:copy:31') && notices.has('book-request:501:ready_for_pickup:copy:32'))
})

// ---- A3
test('staff cannot supply a pickup deadline', async () => {
  const { database } = fakePool(() => undefined)
  await assert.rejects(createBookRequestService(database).adjustStatus(1, 501, { status: 'ready_for_pickup', pickupDeadline: '2026-12-01T10:00:00Z' }),
    (e: unknown) => e instanceof HttpError && e.code === 'PICKUP_DEADLINE_FIXED')
})

// ---- A5 deadline cleared on release, fresh on the next Mark ready
test('a released ready hold loses its deadline and the next Mark ready sets a fresh one', async () => {
  const hold = { ...base, reservation_id: 501, reservation_status: 'ready_for_pickup', queue_position: 1, assigned_physical_copy_id: 31, accession_id: 17, pickup_deadline: at('2026-11-17T10:00') }
  const released = fakePool((sql) => sql.includes('SELECT * FROM reservations WHERE assigned_physical_copy_id') ? [hold] : undefined)
  await releaseLostCopyHolds(await released.database.getConnection(), 31, 1, at('2026-11-16T12:00'), 'unusable')
  const release = released.calls.find((c) => c.sql.includes("reservation_status='pending'"))!
  assert.match(release.sql, /pickup_deadline=NULL/)
  assert.match(release.sql, /ready_at=NULL/)
  const later = fakePool((sql) => {
    if (sql.includes('SELECT user_id,role,account_status FROM accounts')) return staff
    if (sql.includes('SELECT r.*,t.title')) return [{ ...hold, reservation_status: 'approved', pickup_deadline: null, assigned_physical_copy_id: 32, title: 'Clean Code' }]
    if (sql.includes('COUNT(*) AS total FROM (')) return [{ total: 1 }]
    if (sql.includes('SELECT pc.* FROM physical_copies pc JOIN titles')) return [{ physical_copy_id: 32 }]
    return undefined
  })
  await createBookRequestService(later.database, () => at('2026-11-18T09:00')).adjustStatus(1, 501, { status: 'ready_for_pickup' })
  const ready = later.calls.find((c) => c.sql.includes("SET reservation_status='ready_for_pickup'"))!
  assert.equal((ready.params[1] as Date).getTime(), at('2026-11-19T09:00').getTime())
})

// ---- A6 student NOT
const queueRow = { reservation_id: 81, user_id: 7, full_name: 'Sample', institutional_id: 'S-7', email: 'a@b.c', role_name: 'Student', material_id: 17, book_title_id: 9, title: 'Clean Code',
  queue_position: 1, reservation_status: 'pending', request_kind: 'Reservation', requested_iso: '2026-11-18T01:00:00Z', last_skip_reason: 'SECRET-BALANCE-REASON', last_skipped_at: '2026-11-18T02:00:00Z' }
function routed(role: string) {
  const { database } = fakePool((sql) => {
    if (sql.includes('SELECT user_id FROM accounts')) return [{ user_id: 7 }]
    if (sql.includes('SELECT COUNT(*) AS total')) return [{ total: 1 }]
    if (sql.includes('FROM reservations r')) return [queueRow]
    return undefined
  })
  const controller = createReservationController(createReservationService(database) as never)
  const app = express(); app.use(express.json())
  app.use((req, res, next) => { Object.defineProperty(req, 'session', { configurable: true, value: { user: { id: 7, role } } }); res.locals.authenticatedUser = { id: 7, role }; next() })
  app.use('/api/reservations', createReservationsRouter(controller))
  app.use('/api/v1/reservations', createUserReservationsV1Router(controller))
  return app
}
test('a student never receives a skip reason from any reservation route', async () => {
  const app = routed('Student')
  for (const url of ['/api/reservations/admin/queue', '/api/v1/reservations']) {
    const response = await request(app).get(url)
    assert.doesNotMatch(response.text, /lastSkipReason|last_skip_reason|SECRET-BALANCE-REASON/)
  }
})
test('a librarian does receive the skip reason', async () => {
  const response = await request(routed('Librarian')).get('/api/reservations/admin/queue')
  assert.equal(response.status, 200)
  assert.equal(response.body.data.items[0].lastSkipReason, 'SECRET-BALANCE-REASON')
})

// ---- A7 two-pass allocation
test('a blocked request gets a skip reason, and the later assignment clears it', async () => {
  let blocked = true
  const row: { reason: string | null; at: Date | null } = { reason: null, at: null }
  const { database, calls } = fakePool((sql, params) => {
    if (sql.includes('SELECT pc.*,t.title FROM physical_copies')) return [{ physical_copy_id: 31, material_id: 17, title: 'Clean Code', barcode: 'B-31' }]
    if (sql.includes('SELECT * FROM reservations WHERE book_title_id=?')) return [{ ...base, reservation_id: 501, reservation_status: 'pending', queue_position: 1 }]
    if (sql.includes('FROM fines f LEFT JOIN')) return [{ balance: blocked ? 50 : 0 }]
    if (sql.startsWith('UPDATE reservations SET last_skip_reason=?')) { row.reason = String(params[0]); row.at = params[1] as Date; return { affectedRows: 1 } }
    if (sql.includes("reservation_status='approved'") && sql.includes('last_skip_reason=NULL')) { row.reason = null; row.at = null; return { affectedRows: 1 } }
    return undefined
  })
  const q = await database.getConnection()
  assert.deepEqual(await allocateWaitingRequests(q, 9, at('2026-11-16T10:00')), [])
  assert.match(String(row.reason), /outstanding library balance/)
  assert.ok(row.at)
  blocked = false
  assert.deepEqual(await allocateWaitingRequests(q, 9, at('2026-11-16T11:00')), [501])
  assert.deepEqual(row, { reason: null, at: null })
  assert.ok(calls.length)
})

// ---- B8
test('repeating the same skip reason does not rewrite the row', async () => {
  const { database, calls } = fakePool((sql) => {
    if (sql.includes('SELECT pc.*,t.title FROM physical_copies')) return [{ physical_copy_id: 31, material_id: 17, title: 'Clean Code', barcode: 'B-31' }]
    if (sql.includes('SELECT * FROM reservations WHERE book_title_id=?')) return [{ ...base, reservation_id: 501, reservation_status: 'pending', queue_position: 1 }]
    if (sql.includes('FROM fines f LEFT JOIN')) return [{ balance: 50 }]
    return undefined
  })
  await allocateWaitingRequests(await database.getConnection(), 9, at('2026-11-16T10:00'))
  const skip = calls.find((c) => c.sql.startsWith('UPDATE reservations SET last_skip_reason=?'))!
  assert.match(skip.sql, /last_skip_reason IS DISTINCT FROM \?/)
  assert.match(skip.sql, /last_skipped_at IS NULL/)
  assert.doesNotMatch(skip.sql, /updated_at/)
  assert.equal(skip.params[0], skip.params[3])
})

// ---- B9 legacy carts
test('expire also releases legacy cart handovers that never got a deadline', async () => {
  const { database, calls } = fakePool((sql) => {
    if (sql.includes('SELECT r.* FROM reservations r')) return [{ reservation_id: 77, user_id: 4, accession_id: 17, assigned_physical_copy_id: 31, book_title_id: 9, reservation_status: 'approved', request_kind: 'CartHandover', queue_position: 1 }]
    return undefined
  })
  const result = await createBookRequestService(database).expire(at('2026-11-18T10:00'))
  assert.equal(result.expiredCount, 1)
  const select = calls.find((c) => c.sql.includes('SELECT r.* FROM reservations r'))!
  assert.match(select.sql, /pickup_deadline IS NULL/)
  assert.match(select.sql, /reserved_at<=/)
})

// ---- B10 swap candidates
function candidatePool(reservation: object) {
  return fakePool((sql) => {
    if (sql.includes('SELECT user_id,role,account_status FROM accounts')) return staff
    if (sql.includes('SELECT r.*,t.title')) return [{ ...base, reservation_id: 501, reservation_status: 'approved', queue_position: 1, assigned_physical_copy_id: 31, ...reservation }]
    if (sql.includes('SELECT pc.* FROM physical_copies pc JOIN titles')) return [{ physical_copy_id: 32, barcode: 'B-32' }]
    return undefined
  })
}
test('swap candidates are listed without locking the copies', async () => {
  const { database, calls } = candidatePool({})
  const list = await createReservationService(database).swapCandidates(1, 501)
  assert.equal(list[0].physicalCopyId, 32)
  const select = calls.find((c) => c.sql.includes('SELECT pc.* FROM physical_copies pc JOIN titles'))!
  assert.doesNotMatch(select.sql, /FOR UPDATE/)
})
test('swap candidates are refused for a pending request or a cart handover', async () => {
  for (const reservation of [{ reservation_status: 'pending', assigned_physical_copy_id: null }, { request_kind: 'CartHandover' }]) {
    await assert.rejects(createReservationService(candidatePool(reservation).database).swapCandidates(1, 501), (e: unknown) => e instanceof HttpError && e.code === 'SWAP_NOT_ALLOWED')
  }
})

// ---- B11 lock order
test('swap locks the old and new copy together in id order', async () => {
  const { database, calls } = fakePool((sql) => {
    if (sql.includes('SELECT user_id,role,account_status FROM accounts')) return staff
    if (sql.includes('SELECT r.*,t.title')) return [{ ...base, reservation_id: 501, reservation_status: 'approved', queue_position: 1, assigned_physical_copy_id: 31, pickup_deadline: null }]
    if (sql.includes('FROM physical_copies WHERE physical_copy_id IN')) return [{ physical_copy_id: 31, title_id: 9, material_id: 17 }, { physical_copy_id: 32, title_id: 9, material_id: 18 }]
    if (sql.includes('SELECT pc.* FROM physical_copies pc JOIN titles')) return [{ physical_copy_id: 32, material_id: 18 }]
    return undefined
  })
  await createReservationService(database).swapCopy(1, 501, { physicalCopyId: 32 })
  const lock = calls.find((c) => c.sql.includes('FROM physical_copies WHERE physical_copy_id IN'))!
  assert.match(lock.sql, /IN \(\?,\?\) ORDER BY physical_copy_id FOR UPDATE/)
  assert.deepEqual(lock.params, [31, 32])
})

// ---- B13 move down next to an assigned request
