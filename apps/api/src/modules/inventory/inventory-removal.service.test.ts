import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { HttpError } from '../../core/http-error.ts'
import type { PhysicalCopyMutationTransaction } from './physical-copy-mutation.middleware.ts'
import { archivePhysicalCopy, deletePhysicalCopy } from './physical-copy.service.ts'
import { archiveThesisInventory, deleteThesisInventory } from './thesis-inventory.service.ts'

const actor = { userId: 1, label: 'Inventory Admin' }

function physicalTransaction(options: { history?: boolean; condition?: string } = {}) {
  const statements: string[] = []
  const connection = {
    async execute(sql: string) {
      statements.push(sql)
      if (sql.includes('FROM borrow_transactions')) return [options.history ? [{ transaction_id: 9 }] : []]
      if (sql.includes('FROM reservations')) return [[]]
      if (sql.includes('FROM inventory_audit_events')) return [[]]
      return [{ affectedRows: 1 }]
    },
  } as unknown as PoolConnection
  const transaction = {
    action: 'delete', connection, completed: false,
    copy: {
      physical_copy_id: 7, material_id: 42, circulation_material_id: 42,
      accession_number: 'ACC-007', barcode: 'BOOK-007', title: 'Clean Code',
      lifecycle_status: 'Active', condition_status: options.condition ?? 'Lost', availability_status: 'Unavailable',
    },
  } as PhysicalCopyMutationTransaction
  return { transaction, statements }
}

test('permanently deletes a never-used physical copy and its compatibility material after retaining a snapshot', async () => {
  const { transaction, statements } = physicalTransaction()
  const result = await deletePhysicalCopy(transaction, actor)
  assert.equal(result.deleted, true)
  assert.ok(statements.some((sql) => sql.includes("'Deleted'")))
  assert.ok(statements.some((sql) => sql.includes('DELETE FROM physical_copies')))
  assert.ok(statements.some((sql) => sql.includes('DELETE FROM materials')))
})

test('rejects direct deletion until the physical copy is marked Lost', async () => {
  const { transaction, statements } = physicalTransaction({ condition: 'Good' })
  await assert.rejects(deletePhysicalCopy(transaction, actor), (error: unknown) =>
    error instanceof HttpError && error.status === 422 && error.code === 'PHYSICAL_COPY_NOT_LOST')
  assert.equal(statements.some((sql) => sql.includes('DELETE FROM physical_copies')), false)
})

test('physical copy history requires archive fallback', async () => {
  const { transaction, statements } = physicalTransaction({ history: true })
  await assert.rejects(deletePhysicalCopy(transaction, actor), (error: unknown) =>
    error instanceof HttpError && error.code === 'PHYSICAL_COPY_REQUIRES_ARCHIVE' && error.details?.canArchive === true)
  assert.equal(statements.some((sql) => sql.includes('DELETE FROM physical_copies')), false)
})

test('archives a physical copy, synchronizes legacy availability, and records the reason', async () => {
  const { transaction, statements } = physicalTransaction()
  const result = await archivePhysicalCopy(transaction, 'Worn cover retained for history', actor)
  assert.equal(result.lifecycleStatus, 'Archived')
  assert.ok(statements.some((sql) => sql.includes("lifecycle_status = 'Archived'")))
  assert.ok(statements.some((sql) => sql.includes('UPDATE materials')))
  assert.ok(statements.some((sql) => sql.includes("'Archived'")))
})

function thesisDatabase(options: { auditHistory?: boolean; activeReservation?: boolean; condition?: string } = {}) {
  const state = { commits: 0, rollbacks: 0, statements: [] as string[] }
  const thesis = {
    research_inventory_id: 8, title: 'SmartLib Study', authors: 'Researchers', adviser: 'Adviser',
    publication_year: 2026, accession_number: 'TH-008', barcode: 'THESIS-008', condition_state: options.condition ?? 'lost',
    availability_status: 'unavailable', lifecycle_status: 'Active', shelf_location: 'Shelf R-1',
  }
  const connection = {
    async beginTransaction() {}, async commit() { state.commits += 1 },
    async rollback() { state.rollbacks += 1 }, release() {},
    async execute(sql: string) {
      state.statements.push(sql)
      if (sql.includes('FROM research_inventory WHERE research_inventory_id')) return [[thesis]]
      if (sql.includes('FROM materials WHERE')) return [[{ material_id: 88, availability_status: 'Available' }]]
      if (sql.includes("transaction_status IN ('Borrowed', 'Overdue')")) return [[]]
      if (sql.includes("reservation_status IN ('pending', 'approved', 'ready_for_pickup')")) {
        return [options.activeReservation ? [{ reservation_id: 91, reservation_status: 'approved' }] : []]
      }
      if (sql.includes('FROM research_inventory_audit_events')) return [options.auditHistory ? [{ research_inventory_audit_event_id: 3 }] : []]
      if (sql.includes('FROM borrow_transactions')) return [[]]
      if (sql.includes('FROM reservations')) return [[]]
      return [{ affectedRows: 1 }]
    },
  }
  return { state, database: { async getConnection() { return connection } } as unknown as Pool }
}

test('permanently deletes a never-used thesis copy and compatibility material', async () => {
  const { database, state } = thesisDatabase()
  const result = await deleteThesisInventory(8, actor, database)
  assert.equal(result.deleted, true)
  assert.equal(state.commits, 1)
  assert.ok(state.statements.some((sql) => sql.includes('INSERT INTO research_inventory_audit_events')))
  assert.ok(state.statements.some((sql) => sql.includes('DELETE FROM research_inventory')))
  assert.ok(state.statements.some((sql) => sql.includes('DELETE FROM materials')))
})

test('rejects direct thesis deletion until the copy is marked Lost', async () => {
  const { database, state } = thesisDatabase({ condition: 'damaged' })
  await assert.rejects(deleteThesisInventory(8, actor, database), (error: unknown) =>
    error instanceof HttpError && error.status === 422 && error.code === 'THESIS_NOT_LOST')
  assert.equal(state.rollbacks, 1)
  assert.equal(state.statements.some((sql) => sql.includes('DELETE FROM research_inventory')), false)
})

test('thesis audit history requires archive fallback and rolls back deletion', async () => {
  const { database, state } = thesisDatabase({ auditHistory: true })
  await assert.rejects(deleteThesisInventory(8, actor, database), (error: unknown) =>
    error instanceof HttpError && error.code === 'THESIS_REQUIRES_ARCHIVE' && error.details?.canArchive === true)
  assert.equal(state.rollbacks, 1)
  assert.equal(state.statements.some((sql) => sql.includes('DELETE FROM research_inventory')), false)
})

test('active thesis reservation blocks archive and preserves the row', async () => {
  const { database, state } = thesisDatabase({ activeReservation: true })
  await assert.rejects(archiveThesisInventory(8, 'Superseded edition', actor, database), (error: unknown) =>
    error instanceof HttpError && error.code === 'THESIS_HAS_ACTIVE_RESERVATION')
  assert.equal(state.rollbacks, 1)
  assert.equal(state.statements.some((sql) => sql.includes('UPDATE research_inventory')), false)
})
