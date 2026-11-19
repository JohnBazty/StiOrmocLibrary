import assert from 'node:assert/strict'
import test from 'node:test'
import { shelfFixture } from './shelf-capacity.test-fixture.ts'
import { listManagedShelves } from './shelf-capacity.service.ts'
import { moveShelfCopies, restoreShelfCopies } from './shelf-copy-placement.service.ts'

test('moving selected copies preserves circulation state, updates legacy shelf labels and handles a same-compartment move', async (t) => {
  const { sql, pool, connection } = await shelfFixture()
  t.after(() => sql.close())
  await sql.exec(`
    INSERT INTO catalog_locations(name,column_count,row_count,default_capacity) VALUES ('Gamma',1,1,4);
    INSERT INTO materials(material_id,shelf_location,availability_status) VALUES (201,'Alpha','Borrowed'),(202,'Alpha','Unavailable');
    UPDATE physical_copies SET material_id=201 WHERE physical_copy_id=1;
    UPDATE physical_copies SET material_id=202 WHERE physical_copy_id=2;
  `)
  const before = (await sql.query('SELECT physical_copy_id,availability_status,condition_status,lifecycle_status,row_version FROM physical_copies ORDER BY physical_copy_id')).rows
  const moved = await moveShelfCopies({ kind: 'Book', copyIds: [1, 2], shelfLocation: 'Gamma', shelfColumn: 1, shelfRow: 1 }, 1, pool)
  assert.equal(moved.moved, 2)
  const copies = (await sql.query<Record<string, any>>('SELECT * FROM physical_copies ORDER BY physical_copy_id')).rows
  for (const copy of copies.slice(0, 2)) {
    assert.equal(copy.shelf_location, 'Gamma')
    assert.equal(copy.row_version, 2)
  }
  assert.deepEqual(copies.slice(0, 2).map(copy => [copy.availability_status, copy.condition_status]), [['Borrowed', 'Good'], ['Unavailable', 'Damaged']])
  assert.deepEqual(copies.slice(2).map(copy => ({ physical_copy_id: copy.physical_copy_id, availability_status: copy.availability_status, condition_status: copy.condition_status, lifecycle_status: copy.lifecycle_status, row_version: copy.row_version })), before.slice(2))
  assert.deepEqual((await sql.query('SELECT shelf_location,availability_status FROM materials WHERE material_id IN (201,202) ORDER BY material_id')).rows, [{ shelf_location: 'Gamma', availability_status: 'Borrowed' }, { shelf_location: 'Gamma', availability_status: 'Unavailable' }])
  const same = await moveShelfCopies({ kind: 'Book', copyIds: [5], locationId: 1, shelfColumn: 2, shelfRow: 1 }, 1, pool)
  assert.equal(same.moved, 1)
  assert.equal((await listManagedShelves(connection)).find(shelf => shelf.label === 'Alpha')?.compartments.find(cell => cell.column === 2 && cell.row === 1)?.used, 1)
  assert.equal((await sql.query<{ n: number }>('SELECT count(*)::int AS n FROM floor_plan_events')).rows[0].n, 2)
})

test('a capacity failure rolls back every selected move and rejects archived or mixed-kind selections', async (t) => {
  const { sql, pool } = await shelfFixture()
  t.after(() => sql.close())
  const before = (await sql.query('SELECT * FROM physical_copies ORDER BY physical_copy_id')).rows
  await assert.rejects(moveShelfCopies({ kind: 'Book', copyIds: [1, 2], locationId: 2 }, 1, pool), (error: any) => error.code === 'SHELF_CAPACITY_EXCEEDED')
  assert.deepEqual((await sql.query('SELECT * FROM physical_copies ORDER BY physical_copy_id')).rows, before)
  await assert.rejects(moveShelfCopies({ kind: 'Book', copyIds: [3], locationId: 2 }, 1, pool), (error: any) => error.code === 'COPY_PLACEMENT_INVALID')
  await assert.rejects(moveShelfCopies({ kind: 'Book', copyIds: [4], locationId: 2 }, 1, pool), (error: any) => error.code === 'COPY_PLACEMENT_INVALID')
  await assert.rejects(moveShelfCopies({ kind: 'Book', copyIds: [999], locationId: 2 }, 1, pool), (error: any) => error.code === 'COPY_PLACEMENT_INVALID')
  await assert.rejects(moveShelfCopies({ kind: 'Book', copyIds: [1], locationId: 2 }, 2, pool), (error: any) => error.code === 'JWT_ROLE_FORBIDDEN')
  assert.equal((await sql.query<{ n: number }>('SELECT count(*)::int AS n FROM floor_plan_events')).rows[0].n, 0)
})

test('restoring archived copies reserves real capacity and keeps failures archived until an alternate position is chosen', async (t) => {
  const { sql, pool, connection } = await shelfFixture()
  t.after(() => sql.close())
  await sql.exec('UPDATE catalog_locations SET default_capacity=3 WHERE location_id=1')
  const before = (await sql.query('SELECT * FROM physical_copies WHERE physical_copy_id=3')).rows
  await assert.rejects(restoreShelfCopies({ kind: 'Book', copyIds: [3] }, 1, pool), (error: any) => error.code === 'SHELF_CAPACITY_EXCEEDED')
  assert.deepEqual((await sql.query('SELECT * FROM physical_copies WHERE physical_copy_id=3')).rows, before)
  await assert.rejects(restoreShelfCopies({ kind: 'Book', copyIds: [3], locationId: 3 }, 1, pool), (error: any) => error.code === 'SHELF_CAPACITY_NOT_CONFIGURED')
  const restored = await restoreShelfCopies({ kind: 'Book', copyIds: [3], locationId: 1, shelfColumn: 1, shelfRow: 2 }, 1, pool)
  assert.equal(restored.restored, 1)
  assert.deepEqual((await sql.query('SELECT lifecycle_status,availability_status,shelf_location,shelf_column,shelf_row FROM physical_copies WHERE physical_copy_id=3')).rows, [{ lifecycle_status: 'Active', availability_status: 'Available', shelf_location: 'Alpha', shelf_column: 1, shelf_row: 2 }])
  assert.equal((await listManagedShelves(connection)).find(shelf => shelf.id === 1)?.used, 5)
  assert.equal((await sql.query<{ n: number }>('SELECT count(*)::int AS n FROM floor_plan_events')).rows[0].n, 1)
})

test('title restoration checks every compartment before writing and supports one reviewed alternate destination', async (t) => {
  const { sql, pool } = await shelfFixture()
  t.after(() => sql.close())
  await sql.exec(`
    INSERT INTO physical_copies(physical_copy_id,title_id,shelf_location,shelf_column,shelf_row,lifecycle_status,availability_status,condition_status)
      VALUES (6,2,'Beta',1,1,'Archived','Unavailable','Good'),(7,1,'Beta',1,1,'Active','Available','Good');
  `)
  const before = (await sql.query('SELECT * FROM physical_copies WHERE title_id=2 ORDER BY physical_copy_id')).rows
  await assert.rejects(restoreShelfCopies({ kind: 'Book', titleId: 2 }, 1, pool), (error: any) => error.code === 'SHELF_CAPACITY_EXCEEDED')
  assert.deepEqual((await sql.query('SELECT * FROM physical_copies WHERE title_id=2 ORDER BY physical_copy_id')).rows, before)
  assert.equal((await sql.query<{ lifecycle_status: string }>('SELECT lifecycle_status FROM titles WHERE title_id=2')).rows[0].lifecycle_status, 'Archived')
  assert.equal((await sql.query<{ n: number }>('SELECT count(*)::int AS n FROM floor_plan_events')).rows[0].n, 0)
  const result = await restoreShelfCopies({ kind: 'Book', titleId: 2, locationId: 1, shelfColumn: 1, shelfRow: 2 }, 1, pool)
  assert.equal(result.restored, 2)
  assert.equal((await sql.query<{ lifecycle_status: string }>('SELECT lifecycle_status FROM titles WHERE title_id=2')).rows[0].lifecycle_status, 'Active')
  assert.deepEqual((await sql.query('SELECT lifecycle_status,shelf_location,shelf_column,shelf_row FROM physical_copies WHERE title_id=2 ORDER BY physical_copy_id')).rows, [
    { lifecycle_status: 'Active', shelf_location: 'Alpha', shelf_column: 1, shelf_row: 2 },
    { lifecycle_status: 'Active', shelf_location: 'Alpha', shelf_column: 1, shelf_row: 2 },
  ])
})

test('research moves and restoration use the same physical capacity without changing other copies', async (t) => {
  const { sql, pool, connection } = await shelfFixture()
  t.after(() => sql.close())
  await sql.exec(`INSERT INTO research_records(title_id,viewing_status) VALUES (4,'Archived')`)
  await moveShelfCopies({ kind: 'Research/Thesis', copyIds: [1], locationId: 2 }, 1, pool)
  assert.deepEqual((await sql.query("SELECT shelf_location,availability_status FROM materials WHERE barcode='R1'")).rows,[{shelf_location:'Beta',availability_status:'Available'}])
  const beta = (await listManagedShelves(connection)).find(shelf => shelf.id === 2)!
  assert.equal(beta.used, 1)
  assert.equal(beta.compartments[0].status, 'Full')
  await assert.rejects(restoreShelfCopies({ kind: 'Research/Thesis', titleId: 4, locationId: 2 }, 1, pool), (error: any) => error.code === 'SHELF_CAPACITY_EXCEEDED')
  const restored = await restoreShelfCopies({ kind: 'Research/Thesis', titleId: 4, locationId: 1, shelfColumn: 1, shelfRow: 2 }, 1, pool)
  assert.equal(restored.restored, 1)
  assert.deepEqual((await sql.query("SELECT shelf_location,availability_status FROM materials WHERE barcode='R3'")).rows,[{shelf_location:'Alpha',availability_status:'Available'}])
  assert.deepEqual((await sql.query('SELECT lifecycle_status,availability_status,shelf_column,shelf_row FROM research_inventory WHERE research_inventory_id=3')).rows, [{ lifecycle_status: 'Active', availability_status: 'available', shelf_column: 1, shelf_row: 2 }])
  assert.equal((await sql.query<{ viewing_status: string }>('SELECT viewing_status FROM research_records WHERE title_id=4')).rows[0].viewing_status, 'Available for Viewing')
  assert.equal((await sql.query<{ lifecycle_status: string }>('SELECT lifecycle_status FROM research_inventory WHERE research_inventory_id=2')).rows[0].lifecycle_status, 'Archived')
})
