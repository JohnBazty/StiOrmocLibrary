import type { PoolConnection, ResultSetHeader, RowDataPacket } from '../../config/db.js'
import { requireVerificationSender } from '../auth/school-email.sender.ts'
import { notifyLibrarians } from '../notifications/library-alerts.ts'
import { dayCount } from './reservation-settings.service.ts'

export type RequestEventStatus = 'received' | 'waiting' | 'preparing' | 'ready_for_pickup' | 'claimed' | 'cancelled' | 'expired'
export const requestLabels: Record<RequestEventStatus, string> = {
  received: 'Request received', waiting: 'Waiting for a copy', preparing: 'Preparing',
  ready_for_pickup: 'Ready for pickup', claimed: 'Collected', cancelled: 'Cancelled', expired: 'Expired',
}
export function requestEventStatus(status: string, assigned = false): RequestEventStatus {
  if (status === 'pending' || (status === 'approved' && !assigned)) return 'waiting'
  if (status === 'approved') return 'preparing'
  return status as RequestEventStatus
}
export type InstructionOptions = { pickupWindowDays?: number; waitingList?: boolean }
export function requestInstructions(status: RequestEventStatus, deadline: Date | null = null, options: InstructionOptions = {}) {
  switch (status) {
    case 'received': return 'Your request was received. Check your book requests for progress.'
    case 'waiting': return 'You are on the ordered waiting list. We will notify you when a copy is being prepared.'
    case 'preparing': return 'Staff are preparing your copy. Wait for the Ready for pickup notice before travelling to collect it.'
    case 'ready_for_pickup': return `Check in for Borrow books, show your QR and collect your copy${options.pickupWindowDays ? ` within ${dayCount(options.pickupWindowDays)}` : ''}.${deadline ? ` Pick up by ${new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(deadline)} (Philippine time).` : ''}`
    case 'claimed': return 'Your copy has been checked out. See borrowing history for the return deadline.'
    case 'cancelled': return 'Your request is cancelled. Any held copy has been released to the waiting list.'
    case 'expired': return options.waitingList ? 'Your reservation passed the waiting-list limit and was removed from the queue. Reserve the book again if you still need it.'
      : 'The pickup deadline passed. Your hold has been released; request again if you still need the book.'
  }
}

/** Event + notification + email outbox are committed with the copy allocation. */
export async function recordRequestEvent(q: PoolConnection, id: number, status: RequestEventStatus, now = new Date(), pickupWindowDays?: number) {
  const [rows] = await q.execute<RowDataPacket[]>(`SELECT r.user_id,r.request_kind,r.assigned_physical_copy_id,
      (r.pickup_deadline AT TIME ZONE 'Asia/Manila') AS deadline,u.email,u.user_role,COALESCE(t.title,m.title) AS title
    FROM reservations r JOIN users u ON u.user_id=r.user_id JOIN materials m ON m.material_id=r.material_id
    LEFT JOIN titles t ON t.title_id=r.book_title_id WHERE r.reservation_id=?`, [id])
  const r = rows[0]
  if (!r) return
  // No conflict target: works with the 025 and the 041 uniqueness rule (older code only works with 025).
  const [insert] = await q.execute<ResultSetHeader>(`INSERT INTO book_request_events
    (reservation_id,event_status,physical_copy_id,occurred_at,pickup_deadline) VALUES (?,?,?,?,?)
    ON CONFLICT DO NOTHING`, [id,status,r.assigned_physical_copy_id,now,r.deadline])
  if (!insert.affectedRows) return
  // A hold set aside again on another copy (after a lost copy) must notify again.
  const copyKey = r.assigned_physical_copy_id && (status === 'preparing' || status === 'ready_for_pickup') ? `:copy:${r.assigned_physical_copy_id}` : ''
  const cart = r.request_kind === 'CartHandover'
  const label = cart && status === 'received' ? 'Cart sent to library desk' : requestLabels[status]
  const cartText = status === 'received' ? 'Bring the selected book to the library desk. Your loan starts only when staff confirm handover.'
    : status === 'expired' ? 'Your cart handover expired at closing. Add the books again if you still want them.' : null
  // A pickup expiry always has a copy and a deadline; without both it is a waiting-list expiry and no copy was released.
  const waitingList = status === 'expired' && !cart && !r.assigned_physical_copy_id && !r.deadline
  const instructions = cart && cartText ? cartText : requestInstructions(status, r.deadline ? new Date(r.deadline) : null, { pickupWindowDays, waitingList })
  const body = `${r.title}: ${instructions}`
  if (!cart && !waitingList && (status === 'ready_for_pickup' || status === 'expired')) {
    await notifyLibrarians(q, {key:`reservation:${id}:${status}${copyKey}`, title: status === 'expired' ? 'Reservation pickup expired' : 'Reservation ready for pickup',
      body:`${r.title}: request ${id} is ${status === 'expired' ? 'expired. Review the released copy and waiting list.' : 'ready for collection.'}`,
      sourceId:id,personUserId:Number(r.user_id),path:`/librarian/reservations?status=${status}`,type:'Reservation Arrival'})
  }
  const path = r.user_role === 'Faculty' ? '/faculty/reservations' : '/student/reservations'
  await q.execute(`INSERT INTO notifications(user_id,message_title,message_body,trigger_type,source_type,source_id,
    action_path,priority,dedupe_key,scheduled_for,delivered_at) VALUES (?,?,?,'Reservation Arrival','Reservation',?,?,?, ?,NOW(),NOW())
    ON CONFLICT(user_id,dedupe_key) DO NOTHING`, [r.user_id,label,body,id,path,
      status === 'ready_for_pickup' ? 'Urgent' : 'Important',`book-request:${id}:${status}${copyKey}`])
  if (r.email) {
    let deliveryStatus = 'Pending'
    try { requireVerificationSender(String(r.email)) } catch { deliveryStatus = 'Disabled' }
    await q.execute(`INSERT INTO book_request_email_deliveries(event_id,recipient,subject,message_body,status)
      VALUES (?,?,?,?,?)`, [insert.insertId,r.email,`Library book update — ${label}`,body,deliveryStatus])
  }
}
