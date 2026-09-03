import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import type { InventoryActor } from './inventory.repository.ts'
import type { ThesisAvailability, ThesisCondition, ThesisInventoryFilters } from './thesis-inventory.validation.ts'

export type LockedThesisInventory = RowDataPacket & {
  research_inventory_id: number
  title: string
  authors: string
  adviser: string
  publication_year: number
  accession_number: string
  barcode: string
  condition_state: ThesisCondition
  availability_status: 'available' | 'unavailable' | 'borrowed' | 'reserved'
  lifecycle_status: 'Active' | 'Archived'
  shelf_location: string
}

export function thesisInventoryDto(row: RowDataPacket) {
  return {
    research_inventory_id: Number(row.research_inventory_id),
    item_title: String(row.title ?? ''),
    title: String(row.title ?? ''),
    authors: String(row.authors ?? ''),
    adviser: String(row.adviser ?? ''),
    publication_year: Number(row.publication_year),
    accession_number: String(row.accession_number ?? ''),
    barcode: String(row.barcode ?? ''),
    condition_state: String(row.condition_state ?? ''),
    availability_status: String(row.availability_status ?? ''),
    shelf_location: String(row.shelf_location ?? ''),
    last_audited_at: row.last_audited_at ?? null,
    row_version: Number(row.row_version ?? 1),
  }
}

export async function getThesisInventorySummary(database: Pool) {
  const [rows] = await database.execute<RowDataPacket[]>(`
    SELECT COUNT(DISTINCT title) AS total_thesis_materials,
           COALESCE(SUM(CASE WHEN condition_state = 'damaged' THEN 1 ELSE 0 END), 0) AS damaged_thesis_count,
           COALESCE(SUM(CASE WHEN condition_state = 'lost' THEN 1 ELSE 0 END), 0) AS lost_thesis_count
      FROM research_inventory
     WHERE lifecycle_status = 'Active'`)
  const row = rows[0] ?? {}
  return {
    total_thesis_materials: Number(row.total_thesis_materials ?? 0),
    damaged_thesis_count: Number(row.damaged_thesis_count ?? 0),
    lost_thesis_count: Number(row.lost_thesis_count ?? 0),
  }
}

function thesisWhere(filters: ThesisInventoryFilters) {
  const where: string[] = ["lifecycle_status = 'Active'"]
  const parameters: Array<string | number> = []
  if (filters.conditionState) { where.push('condition_state = ?'); parameters.push(filters.conditionState) }
  if (filters.availabilityStatus) { where.push('availability_status = ?'); parameters.push(filters.availabilityStatus) }
  if (filters.publicationYear) { where.push('publication_year = ?'); parameters.push(filters.publicationYear) }
  if (filters.query) {
    const like = `%${filters.query}%`
    where.push('(title LIKE ? OR authors LIKE ? OR adviser LIKE ? OR accession_number LIKE ? OR barcode LIKE ?)')
    parameters.push(like, like, like, like, like)
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', parameters }
}

export async function listThesisInventory(database: Pool, filters: ThesisInventoryFilters) {
  const where = thesisWhere(filters)
  const offset = (filters.page - 1) * filters.limit
  const [[rows], [countRows]] = await Promise.all([
    database.execute<RowDataPacket[]>(`
      SELECT research_inventory_id, title, authors, adviser, publication_year, accession_number,
             barcode, condition_state, availability_status, lifecycle_status, shelf_location, last_audited_at, row_version
        FROM research_inventory ${where.sql}
       ORDER BY title ASC, research_inventory_id ASC
       LIMIT ${filters.limit} OFFSET ${offset}`, where.parameters),
    database.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM research_inventory ${where.sql}`, where.parameters),
  ])
  const total = Number(countRows[0]?.total ?? 0)
  return {
    items: rows.map(thesisInventoryDto),
    pagination: { page: filters.page, limit: filters.limit, total, total_pages: Math.ceil(total / filters.limit) },
  }
}

export async function lockThesisInventory(connection: PoolConnection, barcode: string) {
  const [rows] = await connection.execute<LockedThesisInventory[]>(`
    SELECT research_inventory_id, title, authors, adviser, publication_year, accession_number,
           barcode, condition_state, availability_status, lifecycle_status, shelf_location
      FROM research_inventory WHERE barcode = ? LIMIT 1 FOR UPDATE`, [barcode])
  return rows[0] ?? null
}

export async function lockThesisInventoryById(connection: PoolConnection, researchInventoryId: number) {
  const [rows] = await connection.execute<LockedThesisInventory[]>(`
    SELECT research_inventory_id, title, authors, adviser, publication_year, accession_number,
           barcode, condition_state, availability_status, lifecycle_status, shelf_location
      FROM research_inventory WHERE research_inventory_id = ? LIMIT 1 FOR UPDATE`, [researchInventoryId])
  return rows[0] ?? null
}

export async function lockThesisCirculationMaterial(connection: PoolConnection, barcode: string) {
  const [rows] = await connection.execute<RowDataPacket[]>(`
    SELECT material_id, availability_status
      FROM materials WHERE barcode = ? LIMIT 1 FOR UPDATE`, [barcode])
  return rows[0] ?? null
}

export async function findOpenThesisLoan(connection: PoolConnection, materialId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(`
    SELECT transaction_id, transaction_status, user_id, due_at
      FROM borrow_transactions
     WHERE material_id = ? AND transaction_status IN ('Borrowed', 'Overdue')
     ORDER BY transaction_id DESC LIMIT 1 FOR UPDATE`, [materialId])
  return rows[0] ?? null
}

export async function synchronizeThesisCirculationAvailability(
  connection: PoolConnection,
  materialId: number | null,
  availabilityStatus: ThesisAvailability,
) {
  if (materialId === null) return
  await connection.execute(
    'UPDATE materials SET availability_status = ?, updated_at = NOW() WHERE material_id = ?',
    [availabilityStatus === 'available' ? 'Available' : 'Unavailable', materialId],
  )
}

export async function cancelLostThesisReservations(connection: PoolConnection, materialId: number | null) {
  if (materialId === null) return 0
  const [result] = await connection.execute(`
    UPDATE reservations
       SET accession_id = NULL, reservation_status = 'cancelled', pickup_deadline = NULL, updated_at = NOW()
     WHERE (material_id = ? OR accession_id = ?)
       AND reservation_status IN ('pending', 'approved', 'ready_for_pickup')`, [materialId, materialId])
  return Number((result as { affectedRows?: number }).affectedRows ?? 0)
}

export async function findActiveThesisReservation(connection: PoolConnection, materialId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(`
    SELECT reservation_id, reservation_status
      FROM reservations
     WHERE (material_id = ? OR accession_id = ?)
       AND reservation_status IN ('pending', 'approved', 'ready_for_pickup')
     ORDER BY reservation_id DESC LIMIT 1 FOR UPDATE`, [materialId, materialId])
  return rows[0] ?? null
}

export async function recordThesisInventoryAudit(
  connection: PoolConnection,
  thesis: LockedThesisInventory,
  eventType: 'verified' | 'condition_changed' | 'availability_changed' | 'lost_override' | 'archived' | 'deleted',
  actor: InventoryActor,
  nextCondition: ThesisCondition = thesis.condition_state,
  nextAvailability: ThesisAvailability | 'borrowed' | 'reserved' = thesis.availability_status,
  actionReason: string | null = null,
) {
  await connection.execute(`
    INSERT INTO research_inventory_audit_events
      (research_inventory_id, barcode_snapshot, event_type, previous_condition, new_condition,
       previous_availability, new_availability, action_reason, performed_by_id, performed_by_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    thesis.research_inventory_id, thesis.barcode, eventType, thesis.condition_state, nextCondition,
    thesis.availability_status, nextAvailability, actionReason, actor.userId, actor.label,
  ])
}

export async function* iterateThesisInventoryRows(database: Pool, batchSize = 250) {
  const safeBatchSize = Math.min(Math.max(Math.trunc(batchSize), 1), 1000)
  let cursor = 0
  for (;;) {
    const [rows] = await database.execute<RowDataPacket[]>(`
      SELECT research_inventory_id, title, authors, adviser, publication_year, accession_number,
             barcode, condition_state, availability_status, lifecycle_status, shelf_location, last_audited_at
        FROM research_inventory
       WHERE lifecycle_status = 'Active' AND research_inventory_id > ?
       ORDER BY research_inventory_id ASC LIMIT ${safeBatchSize}`, [cursor])
    if (!rows.length) break
    for (const row of rows) yield thesisInventoryDto(row)
    cursor = Number(rows[rows.length - 1].research_inventory_id)
  }
}
