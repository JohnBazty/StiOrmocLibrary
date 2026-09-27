import type { PoolConnection } from 'mysql2/promise'
import { isPostgres } from '../../config/sql-dialect.js'

type Status = 'pending' | 'approved' | 'ready_for_pickup' | 'claimed' | 'cancelled' | 'expired'
const labels: Record<Status, string> = {
  pending: 'Reservation received', approved: 'Reservation approved', ready_for_pickup: 'Book ready for pickup',
  claimed: 'Reservation claimed', cancelled: 'Reservation cancelled', expired: 'Reservation expired',
}
export async function notifyReservationStatus(connection: PoolConnection, reservationId: number, userId: number, title: string, status: Status, deadline?: Date | null) {
  const body = `${title}: ${labels[status].toLowerCase()}.${deadline ? ` Pick up by ${new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(deadline)}.` : ''}`
  const sql = `INSERT ${isPostgres ? '' : 'IGNORE '}INTO notifications
    (user_id,message_title,message_body,trigger_type,source_type,source_id,action_path,priority,dedupe_key,scheduled_for,delivered_at)
    VALUES (?, ?, ?, 'Reservation Arrival', 'Reservation', ?, '/student/reservations', ?, ?, NOW(), NOW())
    ${isPostgres ? 'ON CONFLICT (user_id, dedupe_key) DO NOTHING' : ''}`
  await connection.execute(sql, [userId, labels[status], body, reservationId,
    status === 'ready_for_pickup' ? 'Urgent' : 'Important', `reservation:${reservationId}:${status}`])
}
