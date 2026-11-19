import type { Pool, PoolConnection, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { assertShelfCapacity, lockShelfCapacity, type ShelfPlacement, type ShelfPlacementInput } from './shelf-capacity.service.ts'

const kinds = { Book: { table: 'physical_copies', id: 'physical_copy_id' }, 'Research/Thesis': { table: 'research_inventory', id: 'research_inventory_id' } } as const
type Kind = keyof typeof kinds
const failure = (message: string) => new HttpError(422, 'COPY_PLACEMENT_INVALID', message)
function positiveId(value: unknown) {
  if (!['string', 'number'].includes(typeof value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw failure('Choose valid copies and a destination.')
  return Number(value)
}
function selection(body: Record<string, unknown>) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw failure('Choose copies and a destination.')
  if (!Object.hasOwn(kinds, String(body.kind))) throw failure('Choose books or research copies.')
  const kind = body.kind as Kind
  if (body.copyIds !== undefined && (!Array.isArray(body.copyIds) || body.copyIds.length > 1000)) throw failure('Select 1–1000 copies.')
  const copyIds = [...new Set((body.copyIds as unknown[] ?? []).map(positiveId))]
  return { kind, copyIds, ...kinds[kind] }
}
async function rows(connection: PoolConnection, sql: string, values: unknown[] = []) {
  const [result] = await connection.execute<RowDataPacket[]>(sql, values)
  return result
}
async function transaction<T>(actor: number, database: Pool, work: (connection: PoolConnection) => Promise<T>) {
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    await lockShelfCapacity(connection)
    await requireLibraryActor(connection, actor, 'library.manage')
    const result = await work(connection)
    await connection.commit()
    return result
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}
async function audit(connection: PoolConnection, actor: number, event: string, details: unknown) {
  await connection.execute('INSERT INTO floor_plan_events (account_id,event_type,details) VALUES (?,?,?)', [actor, event, JSON.stringify(details)])
}

export async function moveShelfCopies(body: Record<string, unknown>, actor: number, database: Pool = db) {
  const { kind, copyIds, table, id } = selection(body)
  if (!copyIds.length) throw failure('Select at least one copy to move.')
  return transaction(actor, database, async connection => {
    const copies = await rows(connection, `SELECT p.*,t.lifecycle_status AS title_status FROM ${table} p JOIN titles t ON t.title_id=p.title_id WHERE p.${id} IN (${copyIds.map(() => '?').join(',')}) AND t.record_type=? ORDER BY p.${id} FOR UPDATE OF p`, [...copyIds, kind])
    if (copies.length !== copyIds.length || copies.some(copy => copy.lifecycle_status !== 'Active' || copy.title_status !== 'Active')) throw failure('Only active copies can be moved. Refresh your selection.')
    const destination = await assertShelfCapacity(connection, body, copies.length, kind === 'Book' ? { bookCopyIds: copyIds } : { researchCopyIds: copyIds })
    for (const copy of copies) {
      await connection.execute(`UPDATE ${table} SET shelf_location=?,shelf_column=?,shelf_row=?,row_version=row_version+1,updated_at=NOW() WHERE ${id}=?`, [destination.shelfLocation, destination.shelfColumn, destination.shelfRow, copy[id]])
      if (copy.material_id) await connection.execute('UPDATE materials SET shelf_location=?,updated_at=NOW() WHERE material_id=?', [destination.shelfLocation, copy.material_id])
      else if (copy.barcode) await connection.execute('UPDATE materials SET shelf_location=?,updated_at=NOW() WHERE barcode=?', [destination.shelfLocation, copy.barcode])
    }
    await audit(connection, actor, 'Copies relocated', { kind, destination, before: copies.map(copy => ({ id: copy[id], shelfLocation: copy.shelf_location, shelfColumn: copy.shelf_column, shelfRow: copy.shelf_row })) })
    return { moved: copies.length, ...destination }
  })
}

export async function restoreShelfCopies(body: Record<string, unknown>, actor: number, database: Pool = db) {
  const { kind, copyIds, table, id } = selection(body)
  const titleId = body.titleId == null ? null : positiveId(body.titleId)
  if ((!titleId && !copyIds.length) || titleId && copyIds.length) throw failure('Choose one archived title or its individual archived copies.')
  return transaction(actor, database, async connection => {
    const title = titleId ? (await rows(connection, 'SELECT * FROM titles WHERE title_id=? AND record_type=? FOR UPDATE', [titleId, kind]))[0] : null
    if (titleId && (!title || title.lifecycle_status !== 'Archived')) throw failure('Choose an archived title to restore.')
    const copies = await rows(connection, `SELECT p.*,t.lifecycle_status AS title_status FROM ${table} p JOIN titles t ON t.title_id=p.title_id WHERE ${titleId ? 'p.title_id=?' : `p.${id} IN (${copyIds.map(() => '?').join(',')})`} AND t.record_type=? ORDER BY p.${id} FOR UPDATE OF p`, [...(titleId ? [titleId] : copyIds), kind])
    if (!titleId && (copies.length !== copyIds.length || copies.some(copy => copy.lifecycle_status !== 'Archived' || copy.title_status !== 'Active'))) throw failure('Restore the archived title first, or select archived copies belonging to an active title.')
    const groups = new Map<string, { input: ShelfPlacementInput; copies: RowDataPacket[] }>()
    for (const copy of copies) {
      const input: ShelfPlacementInput = body.locationId != null || body.shelfLocation ? body : { shelfLocation: copy.shelf_location, shelfColumn: copy.shelf_column, shelfRow: copy.shelf_row }
      const key = JSON.stringify([input.locationId, input.shelfLocation, input.shelfColumn, input.shelfRow])
      const group = groups.get(key) ?? { input, copies: [] as RowDataPacket[] }
      group.copies.push(copy); groups.set(key, group)
    }
    const placements = new Map<number, ShelfPlacement>()
    for (const group of groups.values()) {
      const placement = await assertShelfCapacity(connection, group.input, group.copies.length)
      for (const copy of group.copies) placements.set(Number(copy[id]), placement)
    }
    if (titleId) {
      await connection.execute("UPDATE titles SET lifecycle_status='Active',archived_at=NULL,archive_reason=NULL,archived_by_account_id=NULL,row_version=row_version+1,updated_at=NOW() WHERE title_id=?", [titleId])
      if (kind === 'Research/Thesis') await connection.execute("UPDATE research_records SET viewing_status='Available for Viewing',updated_at=NOW() WHERE title_id=?", [titleId])
    }
    for (const copy of copies) {
      const destination = placements.get(Number(copy[id]))!
      const good = kind === 'Book' ? !['Lost', 'Damaged', 'For Repair'].includes(copy.condition_status) : ['good', 'fair'].includes(copy.condition_state)
      const availability = kind === 'Book' ? good ? 'Available' : 'Unavailable' : good ? 'available' : 'unavailable'
      await connection.execute(`UPDATE ${table} SET lifecycle_status='Active',availability_status=?,archived_at=NULL,archive_reason=NULL,shelf_location=?,shelf_column=?,shelf_row=?,row_version=row_version+1,updated_at=NOW() WHERE ${id}=?`, [availability, destination.shelfLocation, destination.shelfColumn, destination.shelfRow, copy[id]])
      if (copy.material_id) await connection.execute('UPDATE materials SET shelf_location=?,availability_status=?,updated_at=NOW() WHERE material_id=?', [destination.shelfLocation, good ? 'Available' : 'Unavailable', copy.material_id])
      else if (copy.barcode) await connection.execute('UPDATE materials SET shelf_location=?,availability_status=?,updated_at=NOW() WHERE barcode=?', [destination.shelfLocation, good ? 'Available' : 'Unavailable', copy.barcode])
    }
    await audit(connection, actor, 'Archived holdings restored', { kind, titleId, copyIds: copies.map(copy => copy[id]), placements: [...placements.values()] })
    return { restored: copies.length, titleId }
  })
}
