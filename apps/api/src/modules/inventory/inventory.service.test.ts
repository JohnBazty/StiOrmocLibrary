import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { overrideInventoryCondition, setInventoryAvailability, verifyInventoryBarcode } from './inventory.service.ts'

type Scenario = { activeLoan?: boolean; activeReservation?: boolean; availability?: string; condition?: string; materialId?: number | null; requestKind?: string }

function fakeDatabase(scenario: Scenario = {}) {
  const state = {
    committed: 0, rolledBack: 0, copyUpdates: [] as unknown[][], materialUpdates: [] as unknown[][],
    reservationReleases: 0, audits: [] as unknown[][],
    reservationSql: [] as Array<{ sql: string; parameters: unknown[] }>, lockOrder: [] as string[], notifications: [] as unknown[][], claimCancels: [] as unknown[][],
  }
  const materialId = scenario.materialId === undefined ? 42 : scenario.materialId
  const copy = {
    physical_copy_id: 7, title_id: 3, material_id: materialId, barcode: 'BC-42', accession_number: 'ACC-42',
    title: 'Database Systems', condition_status: scenario.condition ?? 'Good',
    availability_status: scenario.availability ?? 'Available', lifecycle_status: 'Active', circulation_material_id: materialId ?? 7,
  }
  const connection = {
    async beginTransaction() {}, async commit() { state.committed += 1 }, async rollback() { state.rolledBack += 1 }, release() {},
    async execute(sql: string, parameters: unknown[] = []) {
      if (sql.includes('FROM library_profile_settings')) { state.lockOrder.push('circulation'); return [[{ settings_id: 1 }]] }
      if (sql.includes("pc.availability_status='Available'")) { state.lockOrder.push('allocate'); return [[]] } // no spare copy
      if (sql.includes('INSERT INTO notifications')) { state.notifications.push(parameters); return [{ affectedRows: 1 }] }
      if (sql.includes('FROM physical_copies pc')) { state.lockOrder.push('copy'); return [[copy]] }
      if (sql.includes('UPDATE borrow_transactions')) { state.claimCancels.push(parameters); return [{ affectedRows: 0 }] }
      if (sql.includes('INSERT INTO book_request_events')) return [{ affectedRows: 1, insertId: 99 }]
      if (sql.includes('FROM borrow_transactions')) return [scenario.activeLoan ? [{ transaction_id: 9, transaction_status: 'Borrowed' }] : []]
      if (sql.includes('FROM reservations')) {
        state.reservationSql.push({ sql, parameters })
        return [scenario.activeReservation ? [{ reservation_id: 11, user_id: 5, reservation_status: scenario.requestKind === 'CartHandover' ? 'approved' : 'ready_for_pickup', request_kind: scenario.requestKind ?? 'Reservation', book_title_id: 3, queue_position: 1, accession_id: 42, assigned_physical_copy_id: 7 }] : []]
      }
      if (sql.includes('UPDATE physical_copies')) { state.copyUpdates.push(parameters); return [{ affectedRows: 1 }] }
      if (sql.includes('UPDATE materials')) { state.materialUpdates.push(parameters); return [{ affectedRows: 1 }] }
      if (sql.includes('UPDATE reservations')) { state.reservationReleases += 1; state.reservationSql.push({ sql, parameters }); return [{ affectedRows: 1 }] }
      if (sql.includes('INSERT INTO inventory_audit_events')) { state.audits.push(parameters); return [{ insertId: 1 }] }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  return { state, database: { async getConnection() { return connection } } as unknown as Pool }
}

test('scanner verification updates the copy and appends an audit event atomically', async () => {
  const { database, state } = fakeDatabase()
  const result = await verifyInventoryBarcode('BC-42', { userId: 1, label: 'Librarian' }, database)
  assert.equal(result.accession_number, 'ACC-42')
  assert.equal(state.copyUpdates.length, 1)
  assert.equal(state.audits.length, 1)
  assert.equal(state.committed, 1)
})

test('good, fair, for-repair, and damaged preserve current availability', async () => {
  for (const condition of ['Good', 'Fair', 'For Repair', 'Damaged'] as const) {
    const { database, state } = fakeDatabase({ availability: 'Available' })
    const result = await overrideInventoryCondition('BC-42', condition, { userId: 1, label: 'Librarian' }, database)
    assert.equal(result.availability_status, 'Available')
    assert.equal(result.availability_preserved, true)
    assert.equal(state.materialUpdates.length, 0)
    assert.equal(state.reservationReleases, 0)
    assert.equal(state.audits[0]?.[2], 'Condition Changed')
  }
})

test('for-repair preserves a manually unavailable state', async () => {
  const { database } = fakeDatabase({ availability: 'Unavailable' })
  const result = await overrideInventoryCondition('BC-42', 'For Repair', { userId: 1, label: 'Librarian' }, database)
  assert.equal(result.availability_status, 'Unavailable')
})

test('lost forces unavailable, synchronizes legacy status, and releases reservations', async () => {
  const { database, state } = fakeDatabase({ availability: 'Reserved', activeReservation: true })
  const result = await overrideInventoryCondition('BC-42', 'Lost', { userId: 1, label: 'Librarian' }, database)
  assert.equal(result.availability_status, 'Unavailable')
  assert.equal(result.released_reservations, 1)
  assert.deepEqual(state.materialUpdates[0], ['Unavailable', 42])
  assert.equal(state.reservationReleases, 1)
  assert.equal(state.audits[0]?.[2], 'Lost Override')
  assert.equal(state.committed, 1)
})

test('lost copy releases the hold assigned to that physical copy and keeps the borrower waiting', async () => {
  // Copy 7 belongs to material 42; the hold stores accession_id=42, so matching accession_id=7 misses it.
  const { database, state } = fakeDatabase({ availability: 'Reserved', activeReservation: true })
  await overrideInventoryCondition('BC-42', 'Lost', { userId: 1, label: 'Librarian' }, database)
  assert.deepEqual(state.lockOrder.slice(0, 2), ['circulation', 'copy'])
  const lookup = state.reservationSql.find(({ sql }) => sql.includes('FOR UPDATE') && sql.includes('ready_for_pickup'))
  assert.match(lookup?.sql ?? '', /assigned_physical_copy_id\s*=\s*\?/)
  assert.deepEqual(lookup?.parameters, [7])
  const release = state.reservationSql.find(({ sql }) => sql.includes('UPDATE reservations'))
  assert.match(release?.sql ?? '', /reservation_status\s*=\s*'pending'/)
  assert.match(release?.sql ?? '', /assigned_physical_copy_id\s*=\s*NULL/)
  assert.deepEqual(release?.parameters, [11])
  assert.ok(state.lockOrder.includes('allocate'), 'waiting list is offered another copy')
  assert.deepEqual(state.notifications[0], ['book-request:11:copy-lost:7', 11])
  const librarianAlert = state.notifications.find((parameters) => parameters.includes('library:reservation:11:copy-lost:7'))
  assert.ok(librarianAlert, 'librarians are told the held copy is gone')
  assert.equal(librarianAlert?.at(-1), 5)
  assert.equal(state.claimCancels.length, 1)
})

test('lost copy cancels a cart handover instead of queueing it', async () => {
  const { database, state } = fakeDatabase({ availability: 'Reserved', activeReservation: true, requestKind: 'CartHandover' })
  const result = await overrideInventoryCondition('BC-42', 'Lost', { userId: 1, label: 'Librarian' }, database)
  assert.equal(result.released_reservations, 1)
  const updates = state.reservationSql.filter(({ sql }) => sql.includes('UPDATE reservations'))
  assert.deepEqual(updates[0]?.parameters, ['cancelled', 11])
  assert.ok(!updates.some(({ sql }) => /reservation_status\s*=\s*'pending'/.test(sql)), 'cart is not put back on the waiting list')
  assert.ok(!state.notifications.some((parameters) => parameters.some((value) => String(value).includes('copy-lost'))))
  assert.equal(state.claimCancels.length, 1)
})

test('re-marking an already lost copy still releases holds left on it', async () => {
  const { database, state } = fakeDatabase({ condition: 'Lost', availability: 'Unavailable', activeReservation: true })
  const result = await overrideInventoryCondition('BC-42', 'Lost', { userId: 1, label: 'Librarian' }, database)
  assert.equal(result.already_reported, true)
  assert.equal(result.released_reservations, 1)
  assert.equal(state.reservationReleases, 1)
})

test('availability guard finds a hold by its assigned physical copy', async () => {
  const { database, state } = fakeDatabase({ activeReservation: true })
  await assert.rejects(setInventoryAvailability('BC-42', 'Unavailable', { userId: 1, label: 'Librarian' }, database),
    (error: unknown) => error instanceof HttpError && error.code === 'PHYSICAL_COPY_HAS_ACTIVE_RESERVATION')
  assert.match(state.reservationSql[0]?.sql ?? '', /assigned_physical_copy_id\s*=\s*\?/)
  assert.deepEqual(state.reservationSql[0]?.parameters, [7])
})

test('borrowed copy must use the circulation lost-report workflow', async () => {
  const { database, state } = fakeDatabase({ availability: 'Borrowed', activeLoan: true })
  await assert.rejects(overrideInventoryCondition('BC-42', 'Lost', { userId: 1, label: 'Librarian' }, database),
    (error: unknown) => error instanceof HttpError && error.code === 'PHYSICAL_COPY_HAS_ACTIVE_LOAN')
  assert.equal(state.copyUpdates.length, 0)
})

test('manual availability synchronizes legacy row and writes audit history', async () => {
  const { database, state } = fakeDatabase()
  const result = await setInventoryAvailability('BC-42', 'Unavailable', { userId: 1, label: 'Librarian' }, database)
  assert.equal(result.availability_status, 'Unavailable')
  assert.deepEqual(state.materialUpdates[0], ['Unavailable', 42])
  assert.equal(state.audits[0]?.[2], 'Availability Changed')
})

test('lost copy cannot be manually made available', async () => {
  const { database, state } = fakeDatabase({ condition: 'Lost', availability: 'Unavailable' })
  await assert.rejects(setInventoryAvailability('BC-42', 'Available', { userId: 1, label: 'Librarian' }, database),
    (error: unknown) => error instanceof HttpError && error.code === 'LOST_COPY_MUST_REMAIN_UNAVAILABLE')
  assert.equal(state.copyUpdates.length, 0)
  assert.equal(state.rolledBack, 1)
})

test('active circulation blocks a manual availability toggle', async () => {
  const loan = fakeDatabase({ activeLoan: true })
  await assert.rejects(setInventoryAvailability('BC-42', 'Unavailable', { userId: 1, label: 'Librarian' }, loan.database),
    (error: unknown) => error instanceof HttpError && error.code === 'PHYSICAL_COPY_HAS_ACTIVE_LOAN')
  const reservation = fakeDatabase({ activeReservation: true })
  await assert.rejects(setInventoryAvailability('BC-42', 'Unavailable', { userId: 1, label: 'Librarian' }, reservation.database),
    (error: unknown) => error instanceof HttpError && error.code === 'PHYSICAL_COPY_HAS_ACTIVE_RESERVATION')
})
