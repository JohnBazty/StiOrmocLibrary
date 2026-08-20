import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { HttpError } from '../../core/http-error.ts'
import { overrideInventoryCondition, verifyInventoryBarcode } from './inventory.service.ts'

type Scenario = { activeLoan?: boolean; activeReservation?: boolean; availability?: string }

function fakeDatabase(scenario: Scenario = {}) {
  const state = { began: 0, committed: 0, rolledBack: 0, released: 0, updates: 0, audits: 0 }
  const copy = {
    physical_copy_id: 7, title_id: 3, material_id: 42, barcode: 'BC-42', accession_number: 'ACC-42',
    title: 'Database Systems', condition_status: 'Good', availability_status: scenario.availability ?? 'Available',
    lifecycle_status: 'Active', circulation_material_id: 42,
  }
  const connection = {
    async beginTransaction() { state.began += 1 },
    async commit() { state.committed += 1 },
    async rollback() { state.rolledBack += 1 },
    release() { state.released += 1 },
    async execute(sql: string) {
      if (sql.includes('FROM physical_copies pc')) return [[copy]]
      if (sql.includes('FROM borrow_transactions')) return [scenario.activeLoan ? [{ transaction_id: 9, transaction_status: 'Borrowed' }] : []]
      if (sql.includes('FROM reservations')) return [scenario.activeReservation ? [{ reservation_id: 11, reservation_status: 'ready_for_pickup' }] : []]
      if (sql.includes('UPDATE physical_copies')) { state.updates += 1; return [{ affectedRows: 1 }] }
      if (sql.includes('INSERT INTO inventory_audit_events')) { state.audits += 1; return [{ insertId: 1 }] }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  return { state, database: { async getConnection() { return connection } } as unknown as Pool }
}

test('scanner verification updates the copy and appends an audit event atomically', async () => {
  const { database, state } = fakeDatabase()
  const result = await verifyInventoryBarcode('BC-42', { userId: 1, label: 'Librarian' }, database)
  assert.equal(result.accession_number, 'ACC-42')
  assert.equal(state.updates, 1)
  assert.equal(state.audits, 1)
  assert.equal(state.committed, 1)
  assert.equal(state.rolledBack, 0)
  assert.equal(state.released, 1)
})

test('condition override makes the copy unavailable and writes history', async () => {
  const { database, state } = fakeDatabase()
  const result = await overrideInventoryCondition('BC-42', 'Damaged', { userId: null, label: 'admin_authenticated' }, database)
  assert.equal(result.condition_status, 'Damaged')
  assert.equal(result.availability_status, 'Unavailable')
  assert.equal(result.reservations_blocked, true)
  assert.equal(state.updates, 1)
  assert.equal(state.audits, 1)
  assert.equal(state.committed, 1)
})

test('borrowed copy blocks condition override and rolls back before update', async () => {
  const { database, state } = fakeDatabase({ activeLoan: true })
  await assert.rejects(
    overrideInventoryCondition('BC-42', 'Lost', { userId: 1, label: 'Librarian' }, database),
    (error: unknown) => error instanceof HttpError && error.status === 422 && error.code === 'PHYSICAL_COPY_HAS_ACTIVE_LOAN',
  )
  assert.equal(state.updates, 0)
  assert.equal(state.audits, 0)
  assert.equal(state.rolledBack, 1)
})

test('reserved copy blocks condition override and preserves availability', async () => {
  const { database, state } = fakeDatabase({ activeReservation: true })
  await assert.rejects(
    overrideInventoryCondition('BC-42', 'Damaged', { userId: 1, label: 'Librarian' }, database),
    (error: unknown) => error instanceof HttpError && error.code === 'PHYSICAL_COPY_HAS_ACTIVE_RESERVATION',
  )
  assert.equal(state.updates, 0)
  assert.equal(state.rolledBack, 1)
})
