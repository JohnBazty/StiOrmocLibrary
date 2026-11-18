import type { Pool, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'

export const activityCategories = ['all', 'borrowing', 'reservations', 'attendance', 'printing'] as const
export type ActivityCategory = typeof activityCategories[number]
export type LibraryActivity = {
  id: string; category: string; title: string; body: string; person: string; schoolId: string
  resource: string; reference: string; createdAt: string; actionPath: string
}

export function parseActivityCategory(value: unknown): ActivityCategory {
  if (value === undefined) return 'all'
  if (typeof value !== 'string' || !activityCategories.includes(value as ActivityCategory)) {
    throw new HttpError(422, 'ACTIVITY_FILTER_INVALID', 'Choose a valid activity type.')
  }
  return value as ActivityCategory
}

/** Read committed source ledgers: never invent a loan from a cart or reservation. */
export function createLibraryActivityService(database: Pick<Pool, 'execute'> = db, postgres = true) {
  // The hosted pooler stores server NOW() audit timestamps in UTC. Attendance
  // and Date-bound receipt fields are campus wall time; request events are zoned.
  const instant = (column: string, zone = 'UTC') => postgres ? `(${column} AT TIME ZONE '${zone}')` : column
  const person = "COALESCE(u.full_name,'Library user')"
  const schoolId = "COALESCE(u.school_id,'')"
  const branches = [
    {
      category: 'borrowing', sql: `SELECT CONCAT('desk:',n.admin_notification_id) id,'borrowing' category,
        n.message_title title,n.message_body body,${person} person,${schoolId} school_id,
        COALESCE(t.title,m.title,'') resource,CASE WHEN n.borrow_transaction_id IS NULL THEN 'Library counter' ELSE CONCAT('Loan ',n.borrow_transaction_id) END reference,
        ${instant('n.created_at')} occurred_at,
        CASE WHEN n.event_type='return_completed' THEN 'reports:returns'
          WHEN n.event_type IN ('in_library_handback_missing','return_condition_assessment') THEN 'reports:inlibrary'
          ELSE 'circulation' END destination
        FROM admin_notifications n LEFT JOIN users u ON u.user_id=n.actor_user_id
        LEFT JOIN borrow_transactions b ON b.transaction_id=n.borrow_transaction_id
        LEFT JOIN materials m ON m.material_id=b.material_id
        LEFT JOIN titles t ON t.title_id=n.book_title_id
        WHERE n.event_type IN ('checkout_confirmed','return_completed','overdue_detected','in_library_handback_missing','return_condition_assessment')`,
    },
    {
      category: 'attendance', sql: `SELECT CONCAT('entry:',a.log_id) id,'attendance' category,'Library entry' title,
        CONCAT('Checked in for ',a.reason_for_visit,'.') body,${person} person,${schoolId} school_id,
        a.reason_for_visit resource,CONCAT('Visit ',a.log_id) reference,
        ${instant(postgres ? 'COALESCE(a.checked_in_at,a.attendance_date+a.time_in)' : 'COALESCE(a.checked_in_at,TIMESTAMP(a.attendance_date,a.time_in))', 'Asia/Manila')} occurred_at,
        'attendance' destination FROM attendance_logs a JOIN users u ON u.user_id=a.user_id`,
    },
    {
      category: 'attendance', sql: `SELECT CONCAT('exit:',a.log_id) id,'attendance' category,'Library exit' title,
        'Checked out of the library. Book returns are recorded separately.' body,${person} person,${schoolId} school_id,
        a.reason_for_visit resource,CONCAT('Visit ',a.log_id) reference,
        ${instant(postgres ? 'COALESCE(a.checked_out_at,a.attendance_date+a.time_out)' : 'COALESCE(a.checked_out_at,TIMESTAMP(a.attendance_date,a.time_out))', 'Asia/Manila')} occurred_at,
        'attendance' destination FROM attendance_logs a JOIN users u ON u.user_id=a.user_id
        WHERE a.time_out IS NOT NULL OR a.checked_out_at IS NOT NULL`,
    },
    {
      category: 'printing', sql: `SELECT CONCAT('print:',h.print_status_history_id) id,'printing' category,
        CONCAT('Printing: ',h.to_status) title,CONCAT('Print request ',p.request_id,' changed to ',h.to_status,'.') body,
        ${person} person,${schoolId} school_id,p.file_name resource,CONCAT('Print request ',p.request_id) reference,
        ${instant('h.created_at')} occurred_at,'printing' destination
        FROM print_status_history h JOIN print_requests p ON p.request_id=h.request_id JOIN users u ON u.user_id=p.user_id`,
    },
    {
      category: 'printing', sql: `SELECT CONCAT('payment:',r.print_receipt_id) id,'printing' category,
        'Printing payment received' title,CONCAT('Payment of PHP ',r.amount_received,' received.') body,
        r.student_name_snapshot person,r.school_id_snapshot school_id,r.file_name_snapshot resource,
        CONCAT('Print request ',r.request_id) reference,${instant('r.received_at','Asia/Manila')} occurred_at,'printing' destination
        FROM print_payment_receipts r`,
    },
    {
      category: 'printing', sql: `SELECT CONCAT('payment-reversed:',r.print_receipt_id) id,'printing' category,
        'Printing payment reversed' title,'A previous payment was reversed. Review the payment history.' body,
        r.student_name_snapshot person,r.school_id_snapshot school_id,r.file_name_snapshot resource,
        CONCAT('Print request ',r.request_id) reference,${instant('r.reversed_at')} occurred_at,'printing' destination
        FROM print_payment_receipts r WHERE r.reversed_at IS NOT NULL`,
    },
  ]
  if (postgres) branches.push({
    category: 'reservations', sql: `SELECT CONCAT('reservation:',e.event_id) id,'reservations' category,
      CASE WHEN r.request_kind='CartHandover' THEN 'Cart awaiting handover'
        WHEN e.event_status='ready_for_pickup' THEN 'Reservation ready for pickup'
        WHEN e.event_status='expired' THEN 'Reservation expired'
        ELSE CONCAT('Reservation: ',REPLACE(e.event_status,'_',' ')) END title,
      CASE WHEN e.event_status='claimed' THEN 'Staff confirmed physical handover. See the loan record for its deadline.'
        ELSE 'Reservation activity only. A loan starts after staff confirm physical handover.' END body,
      ${person} person,${schoolId} school_id,COALESCE(t.title,m.title) resource,
      CONCAT('Request ',r.reservation_id) reference,e.occurred_at,
      CASE WHEN r.request_kind='CartHandover' THEN 'circulation' ELSE 'reservations' END destination
      FROM book_request_events e JOIN reservations r ON r.reservation_id=e.reservation_id
      JOIN users u ON u.user_id=r.user_id JOIN materials m ON m.material_id=r.material_id
      LEFT JOIN titles t ON t.title_id=r.book_title_id
      WHERE r.request_kind='Reservation' OR (r.request_kind='CartHandover' AND e.event_status='received')`,
  })

  return {
    async list(role: string | undefined, value?: unknown) {
      if (role !== 'Librarian') throw new HttpError(403, 'LIBRARY_ACTIVITY_FORBIDDEN', 'Only the Librarian can view all library activity.')
      const category = parseActivityCategory(value)
      const selected = branches.filter(branch => category === 'all' || branch.category === category)
      if (!selected.length) return {items: [], hasMore: false, category, timezone: 'Asia/Manila'}
      // Each ledger contributes at most 51 rows; the global result is bounded too.
      const sql = selected.map(branch => `(SELECT * FROM (${branch.sql}) source ORDER BY occurred_at DESC,id DESC LIMIT 51)`).join('\nUNION ALL\n')
      const [rows] = await database.execute<RowDataPacket[]>(`SELECT * FROM (${sql}) activity ORDER BY occurred_at DESC,id DESC LIMIT 51`, [])
      return {
        items: rows.slice(0,50).map((row): LibraryActivity => {
          const school = String(row.school_id ?? '')
          const createdAt = new Date(row.occurred_at).toISOString()
          const destination = String(row.destination)
          const target = destination.startsWith('reports:') ? 'reports' : destination
          const params = new URLSearchParams(target === 'reservations' ? { user: school, status: '' } : { q: school })
          if (target === 'reports') {params.set('kind',destination.split(':')[1]);params.set('period','all')}
          if (target === 'attendance') params.set('date',new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(createdAt)))
          return { id: String(row.id), category: String(row.category), title: String(row.title), body: String(row.body),
            person: String(row.person), schoolId: school, resource: String(row.resource ?? ''), reference: String(row.reference),
            createdAt, actionPath: `/librarian/${target}?${params}` }
        }),
        hasMore: rows.length > 50, category, timezone: 'Asia/Manila',
      }
    },
  }
}

export const libraryActivityService = createLibraryActivityService()
