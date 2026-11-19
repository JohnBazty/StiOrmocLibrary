import type { Pool, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'

export type AuditLogCategory =
  | 'All'
  | 'Circulation'
  | 'Reservations'
  | 'Catalog & Inventory'
  | 'Policies & Setup'
  | 'Accounts'
  | 'Printing'
  | 'Attendance'

export type AuditLogEntry = {
  id: string
  occurredAt: string
  category: Exclude<AuditLogCategory, 'All'>
  action: string
  actor: string
  target: string
  details: string
  status: string
}

export async function readAuditLogs(
  database: Pool = db,
  query: Record<string, unknown> = {},
): Promise<{
  items: AuditLogEntry[]
  summary: {
    total: number
    circulationAndReservations: number
    catalogAndPolicies: number
    accountsPrintingAttendance: number
  }
}> {
  const q = String(query.q ?? '').trim().toLowerCase()
  const categoryFilter = String(query.category ?? 'All').trim()
  const fromDate = String(query.from ?? '').trim()
  const toDate = String(query.to ?? '').trim()

  const sql = `
    SELECT * FROM (
      SELECT
        'acc-' || e.event_id::text AS id,
        e.created_at::timestamptz AS occurred_at,
        'Accounts' AS category,
        e.action_code AS action,
        COALESCE(actor_u.full_name, actor.school_id, 'System Administrator') AS actor,
        COALESCE(target_u.full_name || ' (' || target.school_id || ')', target.school_id, 'Account #' || e.account_id::text) AS target,
        COALESCE(NULLIF(TRIM(e.reason), ''), 'Status: ' || COALESCE(e.previous_status, '—') || ' → ' || COALESCE(e.new_status, '—')) AS details,
        COALESCE(e.new_status, 'Recorded') AS status
      FROM account_management_events e
      LEFT JOIN accounts actor ON actor.account_id = e.actor_account_id
      LEFT JOIN users actor_u ON actor_u.user_id = actor.user_id
      LEFT JOIN accounts target ON target.account_id = e.account_id
      LEFT JOIN users target_u ON target_u.user_id = target.user_id

      UNION ALL

      SELECT
        'inv-' || i.inventory_audit_event_id::text AS id,
        i.created_at::timestamptz AS occurred_at,
        'Catalog & Inventory' AS category,
        i.event_type AS action,
        COALESCE(NULLIF(TRIM(i.verified_by_label), ''), u.full_name, 'Librarian') AS actor,
        COALESCE(i.barcode_snapshot, 'Copy #' || COALESCE(i.physical_copy_id::text, '—')) AS target,
        COALESCE(
          NULLIF(TRIM(i.action_reason), ''),
          'Condition: ' || COALESCE(i.previous_condition, '—') || ' → ' || COALESCE(i.new_condition, '—') ||
          ' · Availability: ' || COALESCE(i.previous_availability, '—') || ' → ' || COALESCE(i.new_availability, '—')
        ) AS details,
        COALESCE(i.new_condition, i.new_availability, 'Verified') AS status
      FROM inventory_audit_events i
      LEFT JOIN users u ON u.user_id = i.verified_by_user_id

      UNION ALL

      SELECT
        'cir-' || bt.transaction_id::text AS id,
        COALESCE(bt.updated_at, bt.borrowed_at, bt.created_at)::timestamptz AS occurred_at,
        'Circulation' AS category,
        'Loan ' || bt.transaction_status AS action,
        COALESCE(staff.full_name, 'Circulation Counter') AS actor,
        COALESCE(borrower.full_name || ' (' || borrower.school_id || ')', 'User #' || bt.user_id::text) AS target,
        COALESCE(m.title, 'Material #' || COALESCE(bt.material_id::text, '—')) ||
          CASE WHEN bt.renewal_count > 0 THEN ' · Renewed ' || bt.renewal_count::text || 'x' ELSE '' END ||
          CASE WHEN bt.cancellation_reason IS NOT NULL THEN ' · ' || bt.cancellation_reason ELSE '' END AS details,
        bt.transaction_status AS status
      FROM borrow_transactions bt
      LEFT JOIN users borrower ON borrower.user_id = bt.user_id
      LEFT JOIN users staff ON staff.user_id = bt.processed_by_user_id
      LEFT JOIN materials m ON m.material_id = bt.material_id

      UNION ALL

      SELECT
        'res-' || ra.audit_event_id::text AS id,
        ra.created_at::timestamptz AS occurred_at,
        'Reservations' AS category,
        ra.action AS action,
        COALESCE(u.full_name, 'Queue Engine') AS actor,
        'Reservation #' || ra.reservation_id::text AS target,
        COALESCE(NULLIF(TRIM(ra.reason), ''), 'Queue position ' || COALESCE(ra.from_position::text, '—') || ' → ' || COALESCE(ra.to_position::text, '—')) AS details,
        'Completed' AS status
      FROM reservation_audit_events ra
      LEFT JOIN users u ON u.user_id = ra.actor_user_id

      UNION ALL

      SELECT
        'prt-' || ph.print_status_history_id::text AS id,
        ph.created_at::timestamptz AS occurred_at,
        'Printing' AS category,
        'Print job ' || COALESCE(ph.to_status, 'Updated') AS action,
        COALESCE(u.full_name, 'Print Counter') AS actor,
        'Print Request #' || ph.request_id::text AS target,
        COALESCE(NULLIF(TRIM(ph.reason), ''), 'Transition: ' || COALESCE(ph.from_status, 'New') || ' → ' || COALESCE(ph.to_status, 'Updated')) AS details,
        COALESCE(ph.to_status, 'Updated') AS status
      FROM print_status_history ph
      LEFT JOIN users u ON u.user_id = ph.changed_by_user_id

      UNION ALL

      SELECT
        'pol-b-' || bp.borrowing_policy_version_id::text AS id,
        bp.created_at::timestamptz AS occurred_at,
        'Policies & Setup' AS category,
        'Published Borrowing Policy v' || bp.borrowing_policy_version_id::text AS action,
        COALESCE(u.full_name, 'Librarian') AS actor,
        'Student max books: ' || bp.student_max_active_books::text || ' · Waitlist cap: ' || bp.student_max_active_reservations::text AS target,
        COALESCE(bp.change_reason, 'Policy update') || ' (Effective ' || bp.effective_on::text || ')' AS details,
        'Published' AS status
      FROM borrowing_policy_versions bp
      LEFT JOIN users u ON u.user_id = bp.created_by_user_id

      UNION ALL

      SELECT
        'pol-f-' || fp.fine_policy_id::text AS id,
        fp.created_at::timestamptz AS occurred_at,
        'Policies & Setup' AS category,
        'Published Fine Rule #' || fp.fine_policy_id::text AS action,
        COALESCE(u.full_name, 'Librarian') AS actor,
        'PHP ' || fp.hourly_rate::text || '/hr · PHP ' || fp.daily_rate::text || '/day · Cap PHP ' || fp.maximum_penalty::text AS target,
        COALESCE(fp.change_reason, 'Original fine rule') AS details,
        CASE WHEN fp.is_active = 1 THEN 'Active' ELSE 'Historical' END AS status
      FROM fine_policy_versions fp
      LEFT JOIN users u ON u.user_id = fp.created_by_user_id

      UNION ALL

      SELECT
        'att-' || al.log_id::text AS id,
        COALESCE(al.checked_in_at, al.created_at)::timestamptz AS occurred_at,
        'Attendance' AS category,
        CASE WHEN al.checked_out_at IS NOT NULL THEN 'Library Visit Completed' ELSE 'Library Check-In' END AS action,
        COALESCE(scanner.full_name, al.scan_method, 'QR Scanner') AS actor,
        COALESCE(visitor.full_name || ' (' || visitor.school_id || ')', 'User #' || al.user_id::text) AS target,
        'Purpose: ' || COALESCE(al.reason_for_visit, 'Library visit') AS details,
        CASE WHEN al.checked_out_at IS NOT NULL THEN 'Checked Out' ELSE 'Inside Library' END AS status
      FROM attendance_logs al
      LEFT JOIN users visitor ON visitor.user_id = al.user_id
      LEFT JOIN users scanner ON scanner.user_id = al.checked_in_by_user_id
    ) unified
    ORDER BY occurred_at DESC
    LIMIT 250
  `

  const [rows] = await database.execute<RowDataPacket[]>(sql)
  const allItems: AuditLogEntry[] = rows.map((row) => ({
    id: String(row.id),
    occurredAt: row.occurred_at ? new Date(row.occurred_at).toISOString() : new Date().toISOString(),
    category: row.category as Exclude<AuditLogCategory, 'All'>,
    action: String(row.action ?? 'System event'),
    actor: String(row.actor ?? 'System'),
    target: String(row.target ?? '—'),
    details: String(row.details ?? '—'),
    status: String(row.status ?? 'Recorded'),
  }))

  const filtered = allItems.filter((item) => {
    if (categoryFilter && categoryFilter !== 'All' && item.category !== categoryFilter) return false
    if (fromDate) {
      const itemDate = item.occurredAt.slice(0, 10)
      if (itemDate < fromDate) return false
    }
    if (toDate) {
      const itemDate = item.occurredAt.slice(0, 10)
      if (itemDate > toDate) return false
    }
    if (q) {
      const hay = `${item.category} ${item.action} ${item.actor} ${item.target} ${item.details} ${item.status}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  return {
    items: filtered,
    summary: {
      total: allItems.length,
      circulationAndReservations: allItems.filter((i) =>
        ['Circulation', 'Reservations'].includes(i.category),
      ).length,
      catalogAndPolicies: allItems.filter((i) =>
        ['Catalog & Inventory', 'Policies & Setup'].includes(i.category),
      ).length,
      accountsPrintingAttendance: allItems.filter((i) =>
        ['Accounts', 'Printing', 'Attendance'].includes(i.category),
      ).length,
    },
  }
}
