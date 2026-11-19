import assert from 'node:assert/strict'
import test from 'node:test'
import type { PoolConnection } from '../../config/db.js'
import { assertShelfCapacity, parseShelfConfiguration, summarizeShelf } from './shelf-capacity.service.ts'

test('shelf configuration requires actual capacity, valid dimensions and unique compartment exceptions', () => {
  assert.throws(() => parseShelfConfiguration({ label: 'A', columnCount: 2, rowCount: 3 }), /capacity/i)
  assert.throws(() => parseShelfConfiguration({ label: 'A', columnCount: 13, rowCount: 1, defaultCapacity: 20 }), /column/i)
  assert.throws(() => parseShelfConfiguration({ label: 'A', columnCount: 2, rowCount: 1, defaultCapacity: 20, overrides: [{ column: 3, row: 1, capacity: 5 }] }), /compartment/i)
  assert.throws(() => parseShelfConfiguration({ label: 'A', columnCount: 1, rowCount: 1, defaultCapacity: 20, overrides: [{ column: 1, row: 1, capacity: 5 }, { column: 1, row: 1, capacity: 6 }] }), /once/i)
  assert.equal(parseShelfConfiguration({ label: ' Shelf A ', columnCount: 2, rowCount: 3, defaultCapacity: 20 }).label, 'Shelf A')
})

test('shelf summary calculates exceptions, remaining space and exact warning boundaries', () => {
  const shelf = summarizeShelf({ location_id: 1, name: 'A', column_count: 2, row_count: 2, default_capacity: 10, row_version: 3, lifecycle_status: 'Active' }, [{ shelf_column: 2, shelf_row: 2, capacity: 5 }], [
    { shelf_column: 1, shelf_row: 1, used: 8 }, { shelf_column: 2, shelf_row: 1, used: 10 }, { shelf_column: 2, shelf_row: 2, used: 6 },
  ])
  assert.equal(shelf.capacity, 35)
  assert.equal(shelf.used, 24)
  assert.equal(shelf.remaining, 11)
  assert.deepEqual(shelf.compartments.map(cell => cell.status), ['Nearly full', 'Full', 'Available', 'Over capacity'])
  const legacy = summarizeShelf({ location_id: 2, name: 'B', column_count: 1, row_count: 1, default_capacity: null, row_version: 1, lifecycle_status: 'Active' }, [], [])
  assert.equal(legacy.capacityConfigured, false)
  assert.equal(legacy.capacity, null)
  assert.equal(legacy.compartments[0].status, 'Not configured')
})

function connection(capacity: number | null, used: number) {
  const statements: string[] = []
  return { statements, db: { async execute(sql: string) {
    statements.push(sql)
    if (sql.includes('FROM catalog_locations')) return [[{ location_id: 4, name: 'Shelf A', column_count: 2, row_count: 3, default_capacity: capacity, lifecycle_status: 'Active' }]]
    if (sql.includes('FROM catalog_location_capacities')) return [[]]
    if (sql.includes('AS used')) return [[{ used }]]
    return [[]]
  } } as unknown as PoolConnection }
}

test('capacity guard accepts exactly the remaining space and rejects overflow with structured details', async () => {
  const { db, statements } = connection(10, 6)
  const placement = await assertShelfCapacity(db, { locationId: 4, shelfColumn: 2, shelfRow: 3 }, 4)
  assert.deepEqual(placement, { locationId: 4, shelfLocation: 'Shelf A', shelfColumn: 2, shelfRow: 3 })
  assert.match(statements[0], /pg_advisory_xact_lock/)
  await assert.rejects(assertShelfCapacity(db, placement, 5), (error: any) => {
    assert.equal(error.code, 'SHELF_CAPACITY_EXCEEDED')
    assert.deepEqual(error.details, { ...placement, capacity: 10, used: 6, requested: 5, remaining: 4 })
    return true
  })
})

test('capacity guard blocks unconfigured shelves and out-of-grid positions', async () => {
  await assert.rejects(assertShelfCapacity(connection(null, 0).db, { shelfLocation: 'Shelf A' }, 1), (error: any) => error.code === 'SHELF_CAPACITY_NOT_CONFIGURED')
  await assert.rejects(assertShelfCapacity(connection(10, 0).db, { locationId: 4, shelfColumn: 3 }, 1), (error: any) => error.code === 'SHELF_POSITION_INVALID')
})
