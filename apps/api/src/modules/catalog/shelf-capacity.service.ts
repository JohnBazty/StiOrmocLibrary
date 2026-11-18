import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from '../../config/db.js'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryActor } from '../../core/library-permissions.ts'

type Query = Pick<PoolConnection, 'execute'>
export type ShelfPlacementInput = { locationId?: unknown; shelfLocation?: unknown; shelfColumn?: unknown; shelfRow?: unknown }
export type ShelfPlacement = { locationId: number; shelfLocation: string; shelfColumn: number; shelfRow: number }
type Exclusions = { bookCopyIds?: number[]; researchCopyIds?: number[] }
type Override = { column: number; row: number; capacity: number }
type Configuration = { label: string; columnCount: number; rowCount: number; defaultCapacity: number; overrides: Override[]; status: 'Active' | 'Archived' }

const invalid = (message: string, code = 'SHELF_CONFIGURATION_INVALID') => new HttpError(422, code, message)
const integer = (value: unknown, name: string, max = 2147483647) => {
  const number = typeof value === 'number' || typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  if (!Number.isSafeInteger(number) || number < 1 || number > max) throw invalid(`${name} must be a whole number from 1 to ${max}.`)
  return number
}
async function rows(query: Query, sql: string, values: unknown[] = []) {
  const [result] = await query.execute<RowDataPacket[]>(sql, values)
  return result
}

// One campus-wide transaction lock keeps capacity setup, placement and restoration in the same lock order.
export async function lockShelfCapacity(connection: Query) {
  await connection.execute('SELECT pg_advisory_xact_lock(734046)', [])
}

export function parseShelfConfiguration(input: Record<string, unknown>): Configuration {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Enter shelf configuration fields.')
  const label = typeof (input.label ?? input.name) === 'string' ? String(input.label ?? input.name).trim().replace(/\s+/g, ' ') : ''
  if (!label || label.length > 100) throw invalid('Enter a shelf name of 1–100 characters.')
  const columnCount = integer(input.columnCount, 'Columns', 12)
  const rowCount = integer(input.rowCount, 'Rows', 12)
  const defaultCapacity = integer(input.defaultCapacity, 'Compartment capacity')
  if (input.overrides !== undefined && !Array.isArray(input.overrides)) throw invalid('Choose valid compartment exceptions.')
  const overrides: Override[] = []
  const seen = new Set<string>()
  for (const item of (input.overrides ?? []) as unknown[]) {
    if (!item || typeof item !== 'object') throw invalid('Choose a valid compartment exception.')
    const cell = item as Record<string, unknown>
    const column = integer(cell.column, 'Compartment column', columnCount)
    const row = integer(cell.row, 'Compartment row', rowCount)
    const capacity = integer(cell.capacity, 'Compartment capacity')
    const key = `${column}:${row}`
    if (seen.has(key)) throw invalid('Set each compartment exception only once.')
    seen.add(key)
    if (capacity !== defaultCapacity) overrides.push({ column, row, capacity })
  }
  if (input.status !== undefined && !['Active', 'Archived'].includes(String(input.status))) throw invalid('Choose Active or Archived.')
  return { label, columnCount, rowCount, defaultCapacity, overrides, status: input.status === 'Archived' ? 'Archived' : 'Active' }
}

export function summarizeShelf(location: RowDataPacket, overrides: RowDataPacket[], usage: RowDataPacket[]) {
  const columnCount = Number(location.column_count), rowCount = Number(location.row_count)
  const configured = location.default_capacity !== null && location.default_capacity !== undefined
  const defaultCapacity = configured ? Number(location.default_capacity) : null
  const compartments = Array.from({ length: columnCount * rowCount }, (_, index) => {
    const column = index % columnCount + 1, row = Math.floor(index / columnCount) + 1
    const exception = overrides.find(item => Number(item.shelf_column) === column && Number(item.shelf_row) === row)
    const capacity = configured ? Number(exception?.capacity ?? defaultCapacity) : null
    const used = Number(usage.find(item => Number(item.shelf_column) === column && Number(item.shelf_row) === row)?.used ?? 0)
    const status = capacity === null ? 'Not configured' : used > capacity ? 'Over capacity' : used === capacity ? 'Full' : used / capacity >= .8 ? 'Nearly full' : 'Available'
    return { column, row, capacity, used, remaining: capacity === null ? null : Math.max(0, capacity - used), status }
  })
  const used = usage.reduce((total, item) => total + Number(item.used), 0)
  const capacity = configured ? compartments.reduce((total, item) => total + item.capacity!, 0) : null
  return { id: Number(location.location_id), label: String(location.name), columnCount, rowCount, defaultCapacity,
    capacityConfigured: configured, version: Number(location.row_version), status: String(location.lifecycle_status), used, capacity,
    remaining: capacity === null ? null : Math.max(0, capacity - used), compartments }
}

const occupancy = `SELECT pc.shelf_location,pc.shelf_column,pc.shelf_row FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id
  WHERE pc.lifecycle_status='Active' AND t.lifecycle_status='Active' AND t.record_type='Book'
  UNION ALL SELECT ri.shelf_location,ri.shelf_column,ri.shelf_row FROM research_inventory ri JOIN titles t ON t.title_id=ri.title_id
  WHERE ri.lifecycle_status='Active' AND t.lifecycle_status='Active' AND t.record_type='Research/Thesis'`

export async function listManagedShelves(database: Query = db, includeArchived = false) {
  try {
    const [locations, overrides, usage] = await Promise.all([
      rows(database, `SELECT * FROM catalog_locations ${includeArchived ? '' : "WHERE lifecycle_status='Active'"} ORDER BY name`),
      rows(database, 'SELECT * FROM catalog_location_capacities'),
      rows(database, `SELECT shelf_location,shelf_column,shelf_row,COUNT(*) AS used FROM (${occupancy}) occupied GROUP BY shelf_location,shelf_column,shelf_row`),
    ])
    return locations.map(location => summarizeShelf(location, overrides.filter(item => Number(item.location_id) === Number(location.location_id)), usage.filter(item => item.shelf_location === location.name)))
  } catch (error) {
    if (['42703', '42P01'].includes(String((error as { code?: string }).code))) throw new HttpError(503, 'SHELF_MIGRATION_REQUIRED', 'Shelf capacity setup needs database migration 046. Ask the administrator to complete the approved setup.')
    throw error
  }
}

export async function resolveShelfPlacement(connection: Query, input: ShelfPlacementInput): Promise<ShelfPlacement & { defaultCapacity: number | null; columnCount: number; rowCount: number }> {
  await lockShelfCapacity(connection)
  const locationId = input.locationId == null || input.locationId === '' ? null : integer(input.locationId, 'Shelf ID')
  const label = typeof input.shelfLocation === 'string' ? input.shelfLocation.trim() : ''
  if (!locationId && !label) throw invalid('Choose an active managed shelf.', 'SHELF_NOT_FOUND')
  const location = (await rows(connection, `SELECT * FROM catalog_locations WHERE ${locationId ? 'location_id=?' : 'name=?'} AND lifecycle_status='Active' LIMIT 1 FOR UPDATE`, [locationId ?? label]))[0]
  if (!location) throw invalid('Choose an active managed shelf.', 'SHELF_NOT_FOUND')
  if (locationId && label && location.name !== label) throw invalid('The shelf selection changed. Choose the shelf again.', 'SHELF_SELECTION_CHANGED')
  const shelfColumn = integer(input.shelfColumn ?? 1, 'Column', 12), shelfRow = integer(input.shelfRow ?? 1, 'Row', 12)
  if (shelfColumn > Number(location.column_count) || shelfRow > Number(location.row_count)) throw invalid('Choose a column and row that exist on the selected shelf.', 'SHELF_POSITION_INVALID')
  return { locationId: Number(location.location_id), shelfLocation: String(location.name), shelfColumn, shelfRow,
    defaultCapacity: location.default_capacity == null ? null : Number(location.default_capacity), columnCount: Number(location.column_count), rowCount: Number(location.row_count) }
}

export async function assertShelfCapacity(connection: Query, input: ShelfPlacementInput, quantity: number, exclude: Exclusions = {}): Promise<ShelfPlacement> {
  const { defaultCapacity, columnCount: _columns, rowCount: _rows, ...placement } = await resolveShelfPlacement(connection, input)
  if (defaultCapacity === null) throw new HttpError(422, 'SHELF_CAPACITY_NOT_CONFIGURED', `Configure capacity for ${placement.shelfLocation} before placing more copies there.`, placement)
  integer(quantity, 'Number of copies')
  const exception = (await rows(connection, 'SELECT capacity FROM catalog_location_capacities WHERE location_id=? AND shelf_column=? AND shelf_row=?', [placement.locationId, placement.shelfColumn, placement.shelfRow]))[0]
  const capacity = Number(exception?.capacity ?? defaultCapacity)
  const excludeClause = (ids: number[], alias: string, field: string) => ids.length ? ` AND ${alias}.${field} NOT IN (${ids.map(() => '?').join(',')})` : ''
  const books = (exclude.bookCopyIds ?? []).map(value => integer(value, 'Copy ID'))
  const research = (exclude.researchCopyIds ?? []).map(value => integer(value, 'Copy ID'))
  const counts = (await rows(connection, `SELECT (
    (SELECT COUNT(*) FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id WHERE pc.lifecycle_status='Active' AND t.lifecycle_status='Active' AND t.record_type='Book' AND pc.shelf_location=? AND pc.shelf_column=? AND pc.shelf_row=?${excludeClause(books, 'pc', 'physical_copy_id')}) +
    (SELECT COUNT(*) FROM research_inventory ri JOIN titles t ON t.title_id=ri.title_id WHERE ri.lifecycle_status='Active' AND t.lifecycle_status='Active' AND t.record_type='Research/Thesis' AND ri.shelf_location=? AND ri.shelf_column=? AND ri.shelf_row=?${excludeClause(research, 'ri', 'research_inventory_id')})
    ) AS used`, [placement.shelfLocation, placement.shelfColumn, placement.shelfRow, ...books, placement.shelfLocation, placement.shelfColumn, placement.shelfRow, ...research]))[0]
  const used = Number(counts?.used ?? 0), remaining = Math.max(0, capacity - used)
  if (used + quantity > capacity) throw new HttpError(422, 'SHELF_CAPACITY_EXCEEDED', `Column ${placement.shelfColumn}, Row ${placement.shelfRow} on ${placement.shelfLocation} has ${remaining} spaces remaining. You are adding ${quantity} copies. Choose another compartment or reduce the quantity.`, { ...placement, capacity, used, requested: quantity, remaining })
  return placement
}

export async function saveManagedShelf(value: unknown, body: Record<string, unknown>, actor: number, database: Pool = db) {
  const configuration = parseShelfConfiguration(body)
  const locationId = value == null ? null : integer(value, 'Shelf ID')
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    await lockShelfCapacity(connection)
    await requireLibraryActor(connection, actor, 'library.manage')
    const old = locationId ? (await rows(connection, 'SELECT * FROM catalog_locations WHERE location_id=? FOR UPDATE', [locationId]))[0] : null
    if (locationId && (!old || Number(old.row_version) !== Number(body.version))) throw new HttpError(409, 'SHELF_VERSION_CONFLICT', 'This shelf changed. Refresh before editing it again.')
    if ((await rows(connection, 'SELECT location_id FROM catalog_locations WHERE LOWER(name)=LOWER(?) AND location_id<>? LIMIT 1', [configuration.label, locationId ?? 0])).length) throw invalid('A shelf with this name already exists.', 'SHELF_EXISTS')
    if (old) {
      if (old.name !== configuration.label && (await rows(connection, 'SELECT 1 FROM physical_copies WHERE shelf_location=? UNION SELECT 1 FROM research_inventory WHERE shelf_location=? UNION SELECT 1 FROM categories WHERE shelf_location=? LIMIT 1', [old.name, old.name, old.name])).length) throw invalid('This location is used by existing holdings. Create a new location and relocate copies before renaming it.')
      const occupied = await rows(connection, `SELECT shelf_column,shelf_row,COUNT(*) AS used FROM (${occupancy}) occupied WHERE shelf_location=? GROUP BY shelf_column,shelf_row`, [old.name])
      const defaults = await rows(connection, 'SELECT shelf_column,shelf_row FROM categories WHERE shelf_location=?', [old.name])
      if ([...occupied, ...defaults].some(cell => Number(cell.shelf_column) > configuration.columnCount || Number(cell.shelf_row) > configuration.rowCount)) throw invalid('Move the copies and category defaults out of the rows or columns being removed first.', 'SHELF_GRID_OCCUPIED')
      if (old.default_capacity != null) {
        const next = summarizeShelf({ ...old, column_count: configuration.columnCount, row_count: configuration.rowCount, default_capacity: configuration.defaultCapacity }, configuration.overrides.map(cell => ({ shelf_column: cell.column, shelf_row: cell.row, capacity: cell.capacity })), occupied)
        if (next.compartments.some(cell => cell.used > cell.capacity!)) {
          const previous = (await listManagedShelves(connection, true)).find(item => item.id === locationId)!
          if (next.compartments.some(cell => cell.used > cell.capacity! && cell.capacity! < (previous.compartments.find(prior => prior.column === cell.column && prior.row === cell.row)?.capacity ?? 0))) throw invalid('Capacity cannot be reduced below the copies already assigned. Move copies first.', 'SHELF_CAPACITY_BELOW_USAGE')
        }
      }
    }
    let savedId = locationId
    if (savedId) await connection.execute('UPDATE catalog_locations SET name=?,column_count=?,row_count=?,default_capacity=?,lifecycle_status=?,row_version=row_version+1,updated_at=NOW() WHERE location_id=?', [configuration.label, configuration.columnCount, configuration.rowCount, configuration.defaultCapacity, configuration.status, savedId])
    else {
      const [result] = await connection.execute<ResultSetHeader>('INSERT INTO catalog_locations (name,column_count,row_count,default_capacity,lifecycle_status) VALUES (?,?,?,?,?)', [configuration.label, configuration.columnCount, configuration.rowCount, configuration.defaultCapacity, configuration.status])
      savedId = Number(result.insertId)
    }
    await connection.execute('DELETE FROM catalog_location_capacities WHERE location_id=?', [savedId])
    for (const cell of configuration.overrides) await connection.execute('INSERT INTO catalog_location_capacities (location_id,shelf_column,shelf_row,capacity) VALUES (?,?,?,?)', [savedId, cell.column, cell.row, cell.capacity])
    await connection.execute('INSERT INTO floor_plan_events (account_id,event_type,details) VALUES (?,?,?)', [actor, old ? 'Shelf configuration changed' : 'Shelf created', JSON.stringify({ locationId: savedId, before: old ? { name: old.name, columnCount: old.column_count, rowCount: old.row_count, defaultCapacity: old.default_capacity } : null, after: configuration })])
    const result = (await listManagedShelves(connection, true)).find(item => item.id === savedId)!
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    if ((error as { code?: string }).code === '23505') throw invalid('A shelf with this name already exists.', 'SHELF_EXISTS')
    throw error
  } finally { connection.release() }
}
