import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
import { updatePhysicalCopy } from './physical-copy.service.ts'

function fixture(used: number) {
  const state = { commits: 0, rollbacks: 0, calls: [] as Array<{ sql: string; values: unknown[] }> }
  const connection = {
    beginTransaction: async () => {}, commit: async () => { state.commits += 1 }, rollback: async () => { state.rollbacks += 1 }, release() {},
    execute: async (sql: string, values: unknown[] = []) => {
      state.calls.push({ sql, values })
      if (sql.includes('pg_advisory_xact_lock')) return [[]]
      if (sql.includes('FROM physical_copies pc JOIN titles t') && sql.includes('LIMIT 1 FOR UPDATE')) return [[{ physical_copy_id: 7, material_id: 8, shelf_location: 'Shelf A', shelf_column: 1, shelf_row: 1, lifecycle_status: 'Active', title_lifecycle_status: 'Active', availability_status: 'Borrowed' }]]
      if (sql.includes('SELECT * FROM catalog_locations')) return [[{ location_id: 2, name: 'Shelf B', column_count: 2, row_count: 3, default_capacity: 2 }]]
      if (sql.includes('FROM catalog_location_capacities')) return [[]]
      if (sql.includes(') AS used')) return [[{ used }]]
      if (sql.includes('UPDATE')) return [{ affectedRows: 1 }]
      throw new Error(`Unexpected query: ${sql}`)
    },
  }
  return { state, database: { getConnection: async () => connection } as unknown as Pool }
}

test('legacy physical-copy edit checks capacity and synchronizes precise coordinates without changing circulation', async () => {
  const { state, database } = fixture(1)
  await updatePhysicalCopy(database, 7, { locationId: 2, shelfLocation: 'Shelf B', shelfColumn: 2, shelfRow: 3 })
  const update = state.calls.find(call => call.sql.includes('UPDATE physical_copies'))!
  assert.deepEqual(update.values, ['Shelf B', 2, 3, 7])
  assert.doesNotMatch(update.sql, /availability_status\s*=/)
  assert.ok(state.calls.some(call => call.sql.includes('NOT IN (?)') && call.values.includes(7)))
  assert.deepEqual(state.calls.find(call => call.sql.includes('UPDATE materials'))!.values, ['Shelf B', 8])
  assert.equal(state.commits, 1)
})

test('legacy physical-copy edit cannot bypass a full destination', async () => {
  const { state, database } = fixture(2)
  await assert.rejects(updatePhysicalCopy(database, 7, { locationId: 2, shelfLocation: 'Shelf B', shelfColumn: 2, shelfRow: 3 }), { code: 'SHELF_CAPACITY_EXCEEDED' })
  assert.equal(state.calls.some(call => call.sql.includes('UPDATE physical_copies')), false)
  assert.equal(state.rollbacks, 1)
  assert.equal(state.commits, 0)
})
