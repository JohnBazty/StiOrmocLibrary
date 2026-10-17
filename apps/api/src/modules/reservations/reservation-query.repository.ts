import type { Pool, RowDataPacket } from 'mysql2/promise'
import { dateAddDays, isPostgres } from '../../config/sql-dialect.js'
import type { QueueFilters } from './reservation.validation.ts'
import { requestEventStatus, requestLabels } from './book-request-events.ts'

export function buildReservationQueueQuery(filters: QueueFilters) {
  const where = [isPostgres ? "r.request_kind='Reservation'" : '1 = 1']
  const parameters: Array<string | number> = []
  if (filters.status === 'active') where.push("r.reservation_status IN ('pending','approved','ready_for_pickup')")
  else if (filters.status) { where.push('r.reservation_status = ?'); parameters.push(filters.status) }
  if (filters.dateFrom) { where.push('r.reserved_at >= ?'); parameters.push(`${filters.dateFrom} 00:00:00`) }
  if (filters.dateTo) { where.push(`r.reserved_at < ${dateAddDays('?', 1)}`); parameters.push(`${filters.dateTo} 00:00:00`) }
  if (filters.role) { where.push('ro.role_name = ?'); parameters.push(filters.role) }
  if (filters.user) {
    const like = `%${filters.user}%`
    where.push('(u.full_name LIKE ? OR u.institutional_id LIKE ? OR u.email LIKE ?)')
    parameters.push(like, like, like)
  }
  const from = `FROM reservations r
    INNER JOIN users u ON u.user_id = r.user_id
    INNER JOIN roles ro ON ro.role_id = u.role_id
    INNER JOIN materials m ON m.material_id = r.material_id
    LEFT JOIN titles t ON t.title_id = r.book_title_id
    LEFT JOIN categories c ON c.category_id = m.category_id
    LEFT JOIN materials assigned ON assigned.material_id = r.accession_id
    LEFT JOIN physical_copies pc ON pc.physical_copy_id = r.assigned_physical_copy_id
      OR (r.assigned_physical_copy_id IS NULL AND pc.material_id = r.accession_id)`
  const whereSql = `WHERE ${where.join(' AND ')}`
  const safeLimit = Math.min(Math.max(Math.trunc(filters.limit), 1), 100)
  const safeOffset = Math.max((Math.trunc(filters.page) - 1) * safeLimit, 0)
  return {
    dataSql: `SELECT r.reservation_id, r.user_id, u.full_name, u.institutional_id, u.email,
       ro.role_name, r.material_id, r.book_title_id, COALESCE(t.title, m.title) AS title, m.material_type, c.category_name,
       r.accession_id, COALESCE(pc.accession_number, assigned.barcode) AS accession_number,
       COALESCE(pc.barcode,assigned.barcode) AS barcode, pc.shelf_location,
       r.assigned_physical_copy_id,r.queue_position, r.reservation_status, r.reserved_at,
       r.pickup_deadline, r.created_at, r.updated_at
       ${isPostgres ? `, (r.pickup_deadline AT TIME ZONE 'Asia/Manila') AS deadline_iso,
         (r.reserved_at AT TIME ZONE 'Asia/Manila') AS requested_iso,
         r.preparation_started_at,r.ready_at,
         (SELECT d.status FROM book_request_email_deliveries d JOIN book_request_events e ON e.event_id=d.event_id
          WHERE e.reservation_id=r.reservation_id ORDER BY e.event_id DESC LIMIT 1) AS email_status` : ''}
      ${from} ${whereSql}
      ORDER BY ${isPostgres
      ? `CASE r.reservation_status WHEN 'ready_for_pickup' THEN 1 WHEN 'approved' THEN 2 WHEN 'pending' THEN 3 WHEN 'claimed' THEN 4 WHEN 'expired' THEN 5 WHEN 'cancelled' THEN 6 ELSE 7 END`
      : `FIELD(r.reservation_status, 'ready_for_pickup','approved','pending','claimed','expired','cancelled')`},
        r.reserved_at ASC, r.reservation_id ASC LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    countSql: `SELECT COUNT(*) AS total ${from} ${whereSql}`,
    dataParameters: parameters,
    countParameters: parameters,
  }
}

export async function queryReservationQueue(database: Pool, filters: QueueFilters) {
  const query = buildReservationQueueQuery(filters)
  const [[rows], [counts]] = await Promise.all([
    database.execute<RowDataPacket[]>(query.dataSql, query.dataParameters),
    database.execute<RowDataPacket[]>(query.countSql, query.countParameters),
  ])
  const items = rows.map((row) => ({
    reservationId: Number(row.reservation_id), userId: Number(row.user_id), userName: row.full_name,
    institutionalId: row.institutional_id, email: row.email, userRole: row.role_name,
    materialId: Number(row.material_id), bookTitleId: row.book_title_id ? Number(row.book_title_id) : null,
    materialTitle: row.title, materialType: row.material_type,
    categoryName: row.category_name, accessionId: row.accession_id ? Number(row.accession_id) : null,
    accessionNumber: row.accession_number, barcode: row.barcode, queuePosition: Number(row.queue_position),
    status: row.reservation_status, reservedAt: isPostgres ? row.requested_iso : row.reserved_at,
    pickupDeadline: isPostgres ? row.deadline_iso : row.pickup_deadline,
    assignedCopyId: row.assigned_physical_copy_id ? Number(row.assigned_physical_copy_id) : null,
    shelfLocation:row.shelf_location??null,emailStatus:row.email_status??null,
    statusLabel:requestLabels[requestEventStatus(String(row.reservation_status),Boolean(row.assigned_physical_copy_id))],
  }))
  const total = Number(counts[0]?.total ?? 0)
  return { items, pagination: { page: filters.page, limit: filters.limit, total, pages: Math.ceil(total / filters.limit) } }
}
