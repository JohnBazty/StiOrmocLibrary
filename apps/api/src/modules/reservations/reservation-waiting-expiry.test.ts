import assert from 'node:assert/strict'
import test from 'node:test'
import { createBookRequestService } from './book-request.service.ts'
import { fakePool, type Call } from './book-request.test-helpers.ts'
import { waitingExpiresAt, waitingExpiryCutoff, type ReservationSettings } from './reservation-settings.service.ts'

const at = (iso: string) => new Date(`${iso}+08:00`)
const DAY = 86_400_000, MINUTE = 60_000
const T = at('2026-11-16T10:00')
const plus = (d: Date, ms: number) => new Date(d.getTime() + ms)
const limit = (days: number | null, savedAt: Date | null = T): ReservationSettings => ({ pickupWindowDays: 1, waitingExpiryDays: days, waitingExpirySavedAt: days == null ? null : savedAt })
const waitingRow = (id: number, position: number, extra: Record<string, unknown> = {}) => ({ reservation_id: id, user_id: 4, material_id: 17, book_title_id: 9,
  reservation_status: 'pending', request_kind: 'Reservation', queue_position: position, assigned_physical_copy_id: null, accession_id: null, pickup_deadline: null, ...extra })

const isWaitingSelect = (sql: string) => sql.includes("request_kind='Reservation'") && sql.includes('reserved_at<=(') && !sql.startsWith('SELECT r.* FROM reservations r')
const isReRead = (sql: string) => sql.includes('SELECT * FROM reservations WHERE reservation_id=? FOR UPDATE')
const expiredIds = (calls: Call[]) => calls.filter((c) => c.sql.includes('SET reservation_status=?') && c.params[0] === 'expired').map((c) => c.params[1])

type Options = { settings?: { days: number | null; savedAt: Date } | null; candidates?: Record<string, unknown>[]; fresh?: (id: number) => Record<string, unknown> | undefined;
  eventInserted?: () => boolean; pickupRows?: Record<string, unknown>[]; userRow?: Record<string, unknown> }
function expiryPool(o: Options = {}) {
  return fakePool((sql, params) => {
    if (o.settings && sql.includes('to_regclass')) return [{ present: true }]
    if (o.settings && sql.includes('FROM reservation_settings')) return [{ pickup_window_days: 1, waiting_expiry_days: o.settings.days, waiting_expiry_saved_at: o.settings.days == null ? null : o.settings.savedAt }]
    if (sql.startsWith('SELECT r.* FROM reservations r')) return o.pickupRows ?? []
    if (isWaitingSelect(sql)) return o.candidates ?? []
    if (isReRead(sql)) { const id = Number(params[0]); const row = o.fresh ? o.fresh(id) : o.candidates?.find((c) => c.reservation_id === id); return row ? [row] : [] }
    if (sql.includes('SELECT r.user_id,r.request_kind')) return [o.userRow ?? { user_id: 4, request_kind: 'Reservation', assigned_physical_copy_id: null, deadline: null, email: null, user_role: 'Student', title: 'Clean Code' }]
    if (sql.includes('INSERT INTO book_request_events')) return o.eventInserted && !o.eventInserted() ? { affectedRows: 0, insertId: 0 } : { affectedRows: 1, insertId: 1 }
    return undefined
  })
}

// ---- Pure helpers (SPEC R4, R6)
test('waitingExpiresAt is max(reserved, saved) + L days, null when the limit is off', () => {
  assert.equal(waitingExpiresAt(plus(T, -3 * DAY), limit(7))!.getTime(), plus(T, 7 * DAY).getTime())
  assert.equal(waitingExpiresAt(plus(T, 3 * DAY), limit(7))!.getTime(), plus(T, 10 * DAY).getTime())
  assert.equal(waitingExpiresAt(T, limit(null)), null)
})
test('waitingExpiryCutoff is null before saved + L and now - L from then on (AC 8)', () => {
  assert.equal(waitingExpiryCutoff(plus(T, 7 * DAY - MINUTE), limit(7)), null)
  assert.equal(waitingExpiryCutoff(plus(T, 7 * DAY), limit(7))!.getTime(), T.getTime())
  assert.equal(waitingExpiryCutoff(T, limit(7)), null)
  assert.equal(waitingExpiryCutoff(plus(T, 400 * DAY), limit(null)), null)
})
test('a request reserved after the save expires at reserved + L (AC 9)', () => {
  const R = plus(T, 3 * DAY)
  assert.equal(waitingExpiryCutoff(plus(R, 7 * DAY - MINUTE), limit(7))!.getTime(), R.getTime() - MINUTE)
  assert.equal(waitingExpiryCutoff(plus(R, 7 * DAY), limit(7))!.getTime(), R.getTime())
})
test('cutoff and expiry date agree on every case (property)', () => {
  const year = 365 * DAY, base = at('2026-01-01T00:00').getTime()
  for (let i = 0; i < 500; i++) {
    const L = 7 + Math.floor(Math.random() * 84)
    const R = new Date(base + Math.floor(Math.random() * year)), S = new Date(base + Math.floor(Math.random() * year))
    const now = new Date(Math.max(R.getTime(), S.getTime()) + Math.floor((Math.random() * 2 - 0.5) * L * DAY))
    const s: ReservationSettings = { pickupWindowDays: 1, waitingExpiryDays: L, waitingExpirySavedAt: S }
    const cutoff = waitingExpiryCutoff(now, s)
    assert.equal(cutoff !== null && R.getTime() <= cutoff.getTime(), waitingExpiresAt(R, s)!.getTime() <= now.getTime())
  }
})

// ---- Off and gate (AC 6, AC 8, AC 10)
test('with no settings row or the limit off no waiting request is selected or expired, even one reserved 365 days ago (AC 6)', async () => {
  const old = waitingRow(801, 1, { reserved_at: plus(T, -365 * DAY) })
  for (const settings of [null, { days: null, savedAt: T }]) {
    const { database, calls } = expiryPool({ settings, candidates: [old] })
    const result = await createBookRequestService(database).expire(plus(T, 400 * DAY))
    assert.equal(calls.filter((c) => isWaitingSelect(c.sql)).length, 0)
    assert.deepEqual(expiredIds(calls), [])
    assert.equal(result.expiredCount, 0)
  }
})
test('no waiting SELECT at the moment of saving or one minute before saved + L (AC 8, AC 10)', async () => {
  for (const now of [T, plus(T, 7 * DAY - MINUTE)]) {
    const { database, calls } = expiryPool({ settings: { days: 7, savedAt: T }, candidates: [waitingRow(801, 1)] })
    await createBookRequestService(database).expire(now)
    assert.equal(calls.filter((c) => isWaitingSelect(c.sql)).length, 0)
    assert.deepEqual(expiredIds(calls), [])
  }
})
test('at saved + L the waiting SELECT is locked and shaped, and the candidate expires (AC 8)', async () => {
  const { database, calls } = expiryPool({ settings: { days: 7, savedAt: T }, candidates: [waitingRow(801, 1)] })
  const result = await createBookRequestService(database).expire(plus(T, 7 * DAY))
  const selects = calls.filter((c) => isWaitingSelect(c.sql))
  assert.equal(selects.length, 1)
  for (const part of ["request_kind='Reservation'", "reservation_status IN ('pending','approved')", 'assigned_physical_copy_id IS NULL',
    "reserved_at<=(?::timestamptz AT TIME ZONE 'Asia/Manila')", 'FOR UPDATE']) assert.ok(selects[0].sql.includes(part), part)
  assert.equal((selects[0].params[0] as Date).getTime(), T.getTime())
  assert.ok(calls.some((c) => isReRead(c.sql) && c.params[0] === 801))
  assert.deepEqual(expiredIds(calls), [801])
  assert.deepEqual(result, { expiredCount: 1, releasedAccessions: [] })
})

// ---- Concurrency: re-read before release (AC 11)
test('a candidate that got a copy or left the waiting list is not expired (AC 11)', async () => {
  const changed = [{ assigned_physical_copy_id: 31, reservation_status: 'approved' }, { reservation_status: 'ready_for_pickup', assigned_physical_copy_id: 31 },
    { reservation_status: 'claimed' }, { reservation_status: 'cancelled' }, { reservation_status: 'expired' }, { request_kind: 'CartHandover', reservation_status: 'approved' }]
  for (const change of changed) {
    const { database, calls } = expiryPool({ settings: { days: 7, savedAt: T }, candidates: [waitingRow(801, 1)], fresh: (id) => waitingRow(id, 1, change) })
    const result = await createBookRequestService(database).expire(plus(T, 8 * DAY))
    assert.deepEqual(expiredIds(calls), [], JSON.stringify(change))
    assert.equal(result.expiredCount, 0)
  }
})

// ---- Ordering: queue moves up (AC 12)
test('when two waiting requests expire the third moves to position 1 (AC 12)', async () => {
  const rows = new Map([1, 2, 3].map((p) => [800 + p, waitingRow(800 + p, p)]))
  const activeStates = ['pending', 'approved', 'ready_for_pickup']
  const { database } = fakePool((sql, params) => {
    if (sql.includes('to_regclass')) return [{ present: true }]
    if (sql.includes('FROM reservation_settings')) return [{ pickup_window_days: 1, waiting_expiry_days: 7, waiting_expiry_saved_at: T }]
    if (sql.startsWith('SELECT r.* FROM reservations r')) return []
    if (isWaitingSelect(sql)) return [801, 802].map((id) => ({ ...rows.get(id) }))
    if (isReRead(sql)) return [{ ...rows.get(Number(params[0])) }]
    if (sql.includes('SET reservation_status=?')) { rows.get(Number(params[1]))!.reservation_status = String(params[0]); return { affectedRows: 1 } }
    if (sql.includes('SET queue_position=queue_position-1')) {
      for (const r of rows.values()) if (r.book_title_id === params[0] && r.request_kind === 'Reservation' && activeStates.includes(r.reservation_status) && r.queue_position > Number(params[1]) && params[2] === 'Reservation') r.queue_position--
      return { affectedRows: 1 }
    }
    if (sql.includes('SELECT r.user_id,r.request_kind')) return [{ user_id: 4, request_kind: 'Reservation', assigned_physical_copy_id: null, deadline: null, email: null, user_role: 'Student', title: 'Clean Code' }]
    return undefined
  })
  const result = await createBookRequestService(database).expire(plus(T, 8 * DAY))
  assert.equal(result.expiredCount, 2)
  assert.equal(rows.get(803)!.queue_position, 1)
  assert.equal(rows.get(803)!.reservation_status, 'pending')
})

// ---- Notice (AC 13, R5 adjacency)
test('a waiting-list expiry sends one waiting-list notice and no librarian alert; a re-run sends nothing (AC 13)', async () => {
  let inserted = false
  const pool = expiryPool({ settings: { days: 7, savedAt: T }, candidates: [waitingRow(801, 1)], eventInserted: () => { const first = !inserted; inserted = true; return first } })
  await createBookRequestService(pool.database).expire(plus(T, 8 * DAY))
  const notices = pool.calls.filter((c) => c.sql.includes('INTO notifications'))
  assert.equal(notices.length, 1)
  assert.equal(notices[0].params.at(-1), 'book-request:801:expired')
  assert.match(String(notices[0].params[2]), /waiting-list limit/)
  assert.doesNotMatch(String(notices[0].params[2]), /pickup deadline/i)
  assert.ok(!JSON.stringify(pool.calls.map((c) => c.params)).includes('reservation:801:expired"'), 'no librarian alert')
  const before = pool.calls.length
  await createBookRequestService(pool.database).expire(plus(T, 8 * DAY))
  assert.equal(pool.calls.slice(before).filter((c) => c.sql.includes('INTO notifications')).length, 0)
})
test('an expired ready hold keeps pickup text without restoring suppressed librarian alerts', async () => {
  const hold = waitingRow(701, 1, { reservation_status: 'ready_for_pickup', assigned_physical_copy_id: 31, accession_id: 17 })
  const { database, calls } = expiryPool({ settings: { days: 7, savedAt: T }, pickupRows: [hold],
    userRow: { user_id: 4, request_kind: 'Reservation', assigned_physical_copy_id: 31, deadline: at('2026-11-17T10:00'), email: null, user_role: 'Student', title: 'Clean Code' } })
  const result = await createBookRequestService(database).expire(at('2026-11-17T10:01'))
  assert.deepEqual(result, { expiredCount: 1, releasedAccessions: [17] })
  const student = calls.find((c) => c.sql.includes('INTO notifications') && c.params.at(-1) === 'book-request:701:expired')!
  assert.match(String(student.params[2]), /The pickup deadline passed/)
  assert.equal(JSON.stringify(calls.map((c) => c.params)).includes('reservation:701:expired'), false, 'routine librarian alert stays suppressed')
})

// ---- Review fixes (2026-11-19)
test('a waiting request whose title has a free, unallocated copy is left for allocation, not expired', async () => {
  const { database, calls } = expiryPool({ settings: { days: 7, savedAt: T }, candidates: [waitingRow(811, 1)] })
  await createBookRequestService(database).expire(plus(T, 7 * DAY))
  const select = calls.find((c) => isWaitingSelect(c.sql))!
  assert.match(select.sql, /NOT EXISTS\s*\(SELECT 1 FROM physical_copies pc WHERE pc\.title_id=reservations\.book_title_id[^)]*availability_status='Available'/)
})
test('a waiting-list expiry cancels a pending counter claim with the waiting-list reason, not the pickup one', async () => {
  const { database, calls } = expiryPool({ settings: { days: 7, savedAt: T }, candidates: [waitingRow(812, 1)] })
  await createBookRequestService(database).expire(plus(T, 7 * DAY))
  const cancel = calls.find((c) => c.sql.includes('UPDATE borrow_transactions'))!
  assert.equal(cancel.params[1], 'Waiting-list limit passed.')
})
