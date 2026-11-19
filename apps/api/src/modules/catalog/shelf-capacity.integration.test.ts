import assert from 'node:assert/strict'
import test from 'node:test'
import type { PoolConnection } from '../../config/db.js'
import { shelfFixture } from './shelf-capacity.test-fixture.ts'
import { assertShelfCapacity, listManagedShelves, saveManagedShelf } from './shelf-capacity.service.ts'


const placement = { locationId: 1, shelfColumn: 1, shelfRow: 1 }
const configuration = { label: 'Alpha', columnCount: 2, rowCount: 2, defaultCapacity: 4, overrides: [{ column: 2, row: 1, capacity: 1 }], version: 1 }

test('real SQL counts book and research home spaces regardless of borrowing or damage and excludes archives', async (t) => {
  const { sql, connection } = await shelfFixture()
  t.after(() => sql.close())
  const shelves = await listManagedShelves(connection)
  const alpha = shelves.find(shelf => shelf.label === 'Alpha')!
  assert.equal(alpha.used, 4)
  assert.equal(alpha.capacity, 13)
  assert.equal(alpha.compartments.find(cell => cell.column === 1 && cell.row === 1)?.used, 3)
  assert.equal(alpha.compartments.find(cell => cell.column === 2 && cell.row === 1)?.status, 'Full')
  assert.equal(shelves.some(shelf => shelf.label === 'Retired'), false)
  assert.equal((await listManagedShelves(connection, true)).some(shelf => shelf.label === 'Retired'), true)
  assert.deepEqual(await assertShelfCapacity(connection, placement, 1), { ...placement, shelfLocation: 'Alpha' })
  await assert.rejects(assertShelfCapacity(connection, placement, 2), (error: any) => {
    assert.equal(error.code, 'SHELF_CAPACITY_EXCEEDED')
    assert.deepEqual(error.details, { ...placement, shelfLocation: 'Alpha', capacity: 4, used: 3, requested: 2, remaining: 1 })
    return true
  })
  await assert.rejects(assertShelfCapacity(connection, { ...placement, shelfColumn: 2 }, 1), (error: any) => error.code === 'SHELF_CAPACITY_EXCEEDED')
  assert.deepEqual(await assertShelfCapacity(connection, { ...placement, shelfColumn: 2 }, 1, { bookCopyIds: [5] }), { ...placement, shelfColumn: 2, shelfLocation: 'Alpha' })
  assert.deepEqual(await assertShelfCapacity(connection, placement, 4, { bookCopyIds: [1, 2], researchCopyIds: [1] }), { ...placement, shelfLocation: 'Alpha' })
  await assert.rejects(assertShelfCapacity(connection, { shelfLocation: 'Needs setup' }, 1), (error: any) => error.code === 'SHELF_CAPACITY_NOT_CONFIGURED')
  await assert.rejects(assertShelfCapacity(connection, { shelfLocation: 'Retired' }, 1), (error: any) => error.code === 'SHELF_NOT_FOUND')
  await assert.rejects(assertShelfCapacity(connection, { ...placement, shelfLocation: 'Beta' }, 1), (error: any) => error.code === 'SHELF_SELECTION_CHANGED')
})

test('shelf setup records existing overfill, prevents unsafe reductions and preserves failed transactions', async (t) => {
  const { sql, pool, connection } = await shelfFixture()
  t.after(() => sql.close())
  await sql.exec('UPDATE catalog_locations SET default_capacity=NULL WHERE location_id=1')
  const first = await saveManagedShelf(1, { ...configuration, defaultCapacity: 2 }, 1, pool)
  assert.equal(first.version, 2)
  assert.equal(first.compartments.find(cell => cell.column === 1 && cell.row === 1)?.status, 'Over capacity')
  await assert.rejects(saveManagedShelf(1, { ...configuration, version: 2, defaultCapacity: 1 }, 1, pool), (error: any) => error.code === 'SHELF_CAPACITY_BELOW_USAGE')
  const unchanged = (await listManagedShelves(connection)).find(shelf => shelf.id === 1)!
  assert.equal(unchanged.defaultCapacity, 2)
  assert.equal(unchanged.version, 2)
  const repaired = await saveManagedShelf(1, { ...configuration, version: 2 }, 1, pool)
  assert.equal(repaired.version, 3)
  await assert.rejects(saveManagedShelf(1, { ...configuration, version: 3, columnCount: 1, overrides: [] }, 1, pool), (error: any) => error.code === 'SHELF_GRID_OCCUPIED')
  await assert.rejects(saveManagedShelf(1, { ...configuration, version: 3, rowCount: 1 }, 1, pool), (error: any) => error.code === 'SHELF_GRID_OCCUPIED')
  await assert.rejects(saveManagedShelf(1, { ...configuration, version: 3, overrides: [{ column: 1, row: 1, capacity: 2 }] }, 1, pool), (error: any) => error.code === 'SHELF_CAPACITY_BELOW_USAGE')
  assert.equal((await sql.query<{ n: number }>('SELECT count(*)::int AS n FROM floor_plan_events')).rows[0].n, 2)
  assert.equal((await sql.query<{ n: number }>('SELECT count(*)::int AS n FROM physical_copies')).rows[0].n, 5)
})

test('shelf saving rejects stale edits and duplicates, enforces authority and returns the saved grid', async (t) => {
  const { sql, pool } = await shelfFixture()
  t.after(() => sql.close())
  await assert.rejects(saveManagedShelf(1, { ...configuration, version: 0 }, 1, pool), (error: any) => error.code === 'SHELF_VERSION_CONFLICT')
  await assert.rejects(saveManagedShelf(999, configuration, 1, pool), (error: any) => error.code === 'SHELF_VERSION_CONFLICT')
  await assert.rejects(saveManagedShelf(null, { ...configuration, label: ' alpha ' }, 1, pool), (error: any) => error.code === 'SHELF_EXISTS')
  await assert.rejects(saveManagedShelf(1, { ...configuration, label: 'Renamed' }, 1, pool), /used by existing holdings/)
  await assert.rejects(saveManagedShelf(null, { ...configuration, label: 'New shelf' }, 2, pool), (error: any) => error.code === 'JWT_ROLE_FORBIDDEN')
  const created = await saveManagedShelf(null, { label: 'New shelf', columnCount: 2, rowCount: 1, defaultCapacity: 10, overrides: [{ column: 2, row: 1, capacity: 5 }] }, 1, pool)
  assert.equal(created.label, 'New shelf')
  assert.equal(created.capacity, 15)
  assert.equal(created.remaining, 15)
  assert.deepEqual(created.compartments.map(cell => cell.capacity), [10, 5])
  assert.equal((await sql.query<{ n: number }>('SELECT count(*)::int AS n FROM floor_plan_events')).rows[0].n, 1)
})

test('transaction-lock contract permits only one request to claim the final space', async () => {
  // PGlite has one backend, so separate PostgreSQL-session contention is tested with a lock-contract double.
  let used = 0, locked = false
  const waiting: Array<() => void> = []
  function connection() {
    let ownsLock = false
    return {
      async execute(statement: string) {
        if (statement.includes('pg_advisory_xact_lock')) {
          if (!ownsLock) {
            if (locked) await new Promise<void>(resolve => waiting.push(resolve))
            locked = true
            ownsLock = true
          }
          return [[]]
        }
        if (statement.includes('FROM catalog_locations')) return [[{ location_id: 1, name: 'Final space', lifecycle_status: 'Active', column_count: 1, row_count: 1, default_capacity: 1 }]]
        if (statement.includes('FROM catalog_location_capacities')) return [[]]
        if (statement.includes('AS used')) return [[{ used }]]
        throw new Error(`Unexpected query: ${statement}`)
      },
      releaseLock() {
        if (!ownsLock) return
        ownsLock = false
        const next = waiting.shift()
        if (next) next()
        else locked = false
      },
    }
  }
  const attempt = async () => {
    const query = connection()
    try {
      await assertShelfCapacity(query as unknown as PoolConnection, { locationId: 1 }, 1)
      used += 1
      return 'saved'
    } catch (error: any) {
      assert.equal(error.code, 'SHELF_CAPACITY_EXCEEDED')
      return 'full'
    } finally { query.releaseLock() }
  }
  assert.deepEqual(await Promise.all([attempt(), attempt()]), ['saved', 'full'])
  assert.equal(used, 1)
})
