import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import type { InventoryListFilters } from './inventory.validation.ts'

export type InventoryActor = { userId: number | null; label: string }

export type LockedInventoryCopy = RowDataPacket & {
  physical_copy_id: number
  title_id: number
  material_id: number | null
  barcode: string
  accession_number: string
  title: string
  condition_status: string
  availability_status: string
  lifecycle_status: string
  circulation_material_id: number
}

function copyDto(row: RowDataPacket) {
  return {
    physical_copy_id: Number(row.physical_copy_id),
    title_id: Number(row.title_id),
    item_title: String(row.item_title ?? row.title ?? ''),
    authors: row.authors ? String(row.authors).split(', ') : [],
    category_name: row.category_name ? String(row.category_name) : null,
    accession_number: String(row.accession_number ?? ''),
    barcode: String(row.barcode ?? ''),
    shelf_location: String(row.shelf_location ?? ''),
    condition_status: String(row.condition_status ?? ''),
    availability_status: String(row.availability_status ?? ''),
    last_verified_at: row.last_scanned_at ?? null,
    row_version: Number(row.row_version ?? 1),
  }
}

export async function getInventorySummary(database: Pool) {
  const [rows] = await database.execute<RowDataPacket[]>(`
    SELECT
      (SELECT COUNT(*) FROM titles WHERE lifecycle_status = 'Active') AS total_catalog_materials,
      (SELECT COUNT(*) FROM physical_copies WHERE lifecycle_status = 'Active') AS total_physical_copies,
      (SELECT COUNT(*) FROM physical_copies WHERE lifecycle_status = 'Active' AND condition_status = 'Damaged') AS damaged_copies_count,
      (SELECT COUNT(*) FROM physical_copies WHERE lifecycle_status = 'Active' AND condition_status = 'Lost') AS lost_copies_count`)
  const row = rows[0] ?? {}
  return {
    total_catalog_materials: Number(row.total_catalog_materials ?? 0),
    total_physical_copies: Number(row.total_physical_copies ?? 0),
    damaged_copies_count: Number(row.damaged_copies_count ?? 0),
    lost_copies_count: Number(row.lost_copies_count ?? 0),
  }
}

export async function listInventoryCopies(database: Pool, filters: InventoryListFilters) {
  const where = ["pc.lifecycle_status = 'Active'", "t.lifecycle_status = 'Active'"]
  const parameters: Array<string> = []
  if (filters.conditionState) { where.push('pc.condition_status = ?'); parameters.push(filters.conditionState) }
  if (filters.availabilityStatus) { where.push('pc.availability_status = ?'); parameters.push(filters.availabilityStatus) }
  if (filters.query) {
    const like = `%${filters.query}%`
    where.push(`(t.title LIKE ? OR pc.barcode LIKE ? OR pc.accession_number LIKE ? OR
      EXISTS (SELECT 1 FROM authors aq WHERE aq.title_id = t.title_id AND aq.author_name LIKE ?))`)
    parameters.push(like, like, like, like)
  }
  const whereSql = `WHERE ${where.join(' AND ')}`
  const offset = (filters.page - 1) * filters.limit
  const [[rows], [countRows]] = await Promise.all([
    database.execute<RowDataPacket[]>(`
      SELECT pc.physical_copy_id, pc.title_id, t.title AS item_title,
             (SELECT GROUP_CONCAT(a.author_name ORDER BY a.author_order SEPARATOR ', ')
                FROM authors a WHERE a.title_id = t.title_id) AS authors,
             c.category_name, pc.accession_number, pc.barcode, pc.shelf_location,
             pc.condition_status, pc.availability_status, pc.last_scanned_at, pc.row_version
        FROM physical_copies pc
        JOIN titles t ON t.title_id = pc.title_id
        LEFT JOIN categories c ON c.category_id = t.category_id
        ${whereSql}
       ORDER BY COALESCE(pc.last_scanned_at, pc.created_at) DESC, pc.physical_copy_id DESC
       LIMIT ${filters.limit} OFFSET ${offset}`, parameters),
    database.execute<RowDataPacket[]>(`
      SELECT COUNT(*) AS total
        FROM physical_copies pc
        JOIN titles t ON t.title_id = pc.title_id
        ${whereSql}`, parameters),
  ])
  const total = Number(countRows[0]?.total ?? 0)
  return {
    items: rows.map(copyDto),
    pagination: { page: filters.page, limit: filters.limit, total, total_pages: Math.ceil(total / filters.limit) },
  }
}

export async function lockInventoryCopy(connection: PoolConnection, barcode: string) {
  const [rows] = await connection.execute<LockedInventoryCopy[]>(`
    SELECT pc.physical_copy_id, pc.title_id, pc.material_id, pc.barcode, pc.accession_number,
           pc.condition_status, pc.availability_status, pc.lifecycle_status, t.title,
           COALESCE(pc.material_id, pc.physical_copy_id) AS circulation_material_id
      FROM physical_copies pc
      JOIN titles t ON t.title_id = pc.title_id
     WHERE pc.barcode = ?
     LIMIT 1 FOR UPDATE`, [barcode])
  return rows[0] ?? null
}

export async function findActiveLoan(connection: PoolConnection, materialId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(`
    SELECT transaction_id, transaction_status, due_at
      FROM borrow_transactions
     WHERE material_id = ? AND transaction_status IN ('Borrowed', 'Overdue')
     ORDER BY transaction_id DESC LIMIT 1 FOR UPDATE`, [materialId])
  return rows[0] ?? null
}

export async function findActiveReservation(connection: PoolConnection, physicalCopyId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(`
    SELECT reservation_id, reservation_status, pickup_deadline
      FROM reservations
     WHERE accession_id = ? AND reservation_status IN ('pending', 'approved', 'ready_for_pickup')
     ORDER BY reservation_id DESC LIMIT 1 FOR UPDATE`, [physicalCopyId])
  return rows[0] ?? null
}

export async function synchronizeLegacyAvailability(
  connection: PoolConnection,
  materialId: number | null,
  availabilityStatus: 'Available' | 'Unavailable',
) {
  if (materialId === null) return
  await connection.execute(
    'UPDATE materials SET availability_status = ?, updated_at = NOW() WHERE material_id = ?',
    [availabilityStatus, materialId],
  )
}

export async function releaseLostCopyReservations(connection: PoolConnection, physicalCopyId: number) {
  const [result] = await connection.execute(`
    UPDATE reservations
       SET accession_id = NULL, reservation_status = 'pending', pickup_deadline = NULL, updated_at = NOW()
     WHERE accession_id = ?
       AND reservation_status IN ('pending', 'approved', 'ready_for_pickup')`, [physicalCopyId])
  return Number((result as { affectedRows?: number }).affectedRows ?? 0)
}

export async function recordInventoryAudit(
  connection: PoolConnection,
  copy: LockedInventoryCopy,
  eventType: 'Verified' | 'Condition Changed' | 'Availability Changed' | 'Lost Override',
  actor: InventoryActor,
  nextCondition = copy.condition_status,
  nextAvailability = copy.availability_status,
) {
  await connection.execute(`
    INSERT INTO inventory_audit_events
      (physical_copy_id, barcode_snapshot, event_type, previous_condition, new_condition,
       previous_availability, new_availability, verified_by_user_id, verified_by_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    copy.physical_copy_id, copy.barcode, eventType, copy.condition_status, nextCondition,
    copy.availability_status, nextAvailability, actor.userId, actor.label,
  ])
}

export { copyDto }
