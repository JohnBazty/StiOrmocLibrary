import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { HttpError } from '../../core/http-error.ts'
import { overrideInventoryCondition, setInventoryAvailability, verifyInventoryBarcode } from './inventory.service.ts'

type Scenario = { activeLoan?: boolean; activeReservation?: boolean; availability?: string; condition?: string; materialId?: number | null }

function fakeDatabase(scenario: Scenario = {}) {
  const state = {
    committed: 0, rolledBack: 0, copyUpdates: [] as unknown[][], materialUpdates: [] as unknown[][],
    reservationReleases: 0, audits: [] as unknown[][],
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
      if (sql.includes('FROM physical_copies pc')) return [[copy]]
      if (sql.includes('FROM borrow_transactions')) return [scenario.activeLoan ? [{ transaction_id: 9, transaction_status: 'Borrowed' }] : []]
      if (sql.includes('FROM reservations')) return [scenario.activeReservation ? [{ reservation_id: 11, reservation_status: 'ready_for_pickup' }] : []]
      if (sql.includes('UPDATE physical_copies')) { state.copyUpdates.push(parameters); return [{ affectedRows: 1 }] }
      if (sql.includes('UPDATE materials')) { state.materialUpdates.push(parameters); return [{ affectedRows: 1 }] }
      if (sql.includes('UPDATE reservations')) { state.reservationReleases += 1; return [{ affectedRows: 1 }] }
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
  const { database, state } = fakeDatabase({ availability: 'Borrowed', activeLoan: true, activeReservation: true })
  const result = await overrideInventoryCondition('BC-42', 'Lost', { userId: 1, label: 'Librarian' }, database)
  assert.equal(result.availability_status, 'Unavailable')
  assert.equal(result.released_reservations, 1)
  assert.deepEqual(state.materialUpdates[0], ['Unavailable', 42])
  assert.equal(state.reservationReleases, 1)
  assert.equal(state.audits[0]?.[2], 'Lost Override')
  assert.equal(state.committed, 1)
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
