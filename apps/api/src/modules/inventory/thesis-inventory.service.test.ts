import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { HttpError } from '../../core/http-error.ts'
import { auditThesisCondition, setThesisAvailability } from './thesis-inventory.service.ts'

function fakeDatabase(options: { loan?: boolean; condition?: string; availability?: string } = {}) {
  const state = { commits: 0, rollbacks: 0, updates: [] as unknown[][], materialUpdates: 0, reservationUpdates: 0, audits: [] as unknown[][] }
  const thesis = {
    research_inventory_id: 8, title: 'Smart Campus Research', authors: 'STI Researchers', adviser: 'Prof. Adviser',
    publication_year: 2026, accession_number: 'TH-008', barcode: 'THESIS-008',
    condition_state: options.condition ?? 'good', availability_status: options.availability ?? 'available', shelf_location: 'Shelf R-1',
  }
  const connection = {
    async beginTransaction() {}, async commit() { state.commits += 1 }, async rollback() { state.rollbacks += 1 }, release() {},
    async execute(sql: string, parameters: unknown[] = []) {
      if (sql.includes('FROM research_inventory WHERE')) return [[thesis]]
      if (sql.includes('FROM materials WHERE')) return [[{ material_id: 42, availability_status: options.availability ?? 'Available' }]]
      if (sql.includes('FROM borrow_transactions')) return [options.loan ? [{ transaction_id: 77, transaction_status: 'Borrowed', user_id: 3 }] : []]
      if (sql.includes('FROM reservations')) return [[]]
      if (sql.includes('UPDATE research_inventory')) { state.updates.push(parameters); return [{ affectedRows: 1 }] }
      if (sql.includes('UPDATE materials')) { state.materialUpdates += 1; return [{ affectedRows: 1 }] }
      if (sql.includes('UPDATE reservations')) { state.reservationUpdates += 1; return [{ affectedRows: 1 }] }
      if (sql.includes('INSERT INTO research_inventory_audit_events')) { state.audits.push(parameters); return [{ insertId: 1 }] }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  return { state, database: { async getConnection() { return connection } } as unknown as Pool }
}

test('lost thesis commits unavailable when no open loan exists', async () => {
  const { database, state } = fakeDatabase()
  const result = await auditThesisCondition('THESIS-008', 'lost', { userId: 1, label: 'Admin' }, database)
  assert.equal(result.condition_state, 'lost')
  assert.equal(result.availability_status, 'unavailable')
  assert.deepEqual(state.updates[0]?.slice(0, 2), ['lost', 'unavailable'])
  assert.equal(state.audits[0]?.[2], 'lost_override')
  assert.equal(state.materialUpdates, 1)
  assert.equal(state.reservationUpdates, 1)
  assert.equal(state.commits, 1)
})

test('open student loan blocks a lost audit and rolls back', async () => {
  const { database, state } = fakeDatabase({ loan: true })
  await assert.rejects(auditThesisCondition('THESIS-008', 'lost', { userId: 1, label: 'Admin' }, database),
    (error: unknown) => error instanceof HttpError && error.status === 422 && error.code === 'THESIS_HAS_ACTIVE_LOAN')
  assert.equal(state.updates.length, 0)
  assert.equal(state.rollbacks, 1)
})

test('for-repair condition preserves manual availability', async () => {
  const { database, state } = fakeDatabase({ availability: 'available' })
  const result = await auditThesisCondition('THESIS-008', 'for_repair', { userId: 1, label: 'Admin' }, database)
  assert.equal(result.availability_status, 'available')
  assert.equal(result.availability_preserved, true)
  assert.deepEqual(state.updates[0]?.slice(0, 2), ['for_repair', 'available'])
})

test('lost thesis cannot be manually published as available', async () => {
  const { database } = fakeDatabase({ condition: 'lost', availability: 'unavailable' })
  await assert.rejects(setThesisAvailability('THESIS-008', 'available', { userId: 1, label: 'Admin' }, database),
    (error: unknown) => error instanceof HttpError && error.code === 'LOST_THESIS_MUST_REMAIN_UNAVAILABLE')
})
