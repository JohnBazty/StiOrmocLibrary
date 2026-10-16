import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { HttpError } from '../../core/http-error.ts'
import { localTimestamp } from '../attendance/attendance-intervals.ts'

/** Staff may identify a borrower from a stored queue entry without receiving their QR secret. */
export async function loadDeskRequest(q: Pick<PoolConnection, 'execute'>, input: Record<string, unknown>, now: Date, confirming = false) {
  const reservationId = input.reservationId == null ? null : Number(input.reservationId)
  const transactionId = input.transactionId == null ? null : Number(input.transactionId)
  if ((reservationId === null) === (transactionId === null) || !Number.isSafeInteger(reservationId ?? transactionId) || Number(reservationId ?? transactionId) < 1) {
    throw new HttpError(422, 'DESK_REQUEST_INVALID', 'Choose a valid pickup request.')
  }
  const [rows] = await q.execute<RowDataPacket[]>(reservationId !== null
    ? `SELECT r.user_id,r.reservation_id,r.request_kind,r.reservation_status,r.pickup_deadline,r.assigned_physical_copy_id AS copy_id,pc.barcode
         FROM reservations r LEFT JOIN physical_copies pc ON pc.physical_copy_id=r.assigned_physical_copy_id
         WHERE r.reservation_id=? FOR UPDATE OF r`
    : `SELECT bt.user_id,bt.reservation_id,bt.transaction_status,r.request_kind,r.reservation_status,r.pickup_deadline,
              bt.physical_copy_id AS copy_id,pc.barcode,r.assigned_physical_copy_id
         FROM borrow_transactions bt LEFT JOIN reservations r ON r.reservation_id=bt.reservation_id
         LEFT JOIN physical_copies pc ON pc.physical_copy_id=bt.physical_copy_id
         WHERE bt.transaction_id=? FOR UPDATE OF bt`, [reservationId ?? transactionId])
  const row = rows[0]
  if (!row || (transactionId !== null && row.transaction_status !== 'Pending')) {
    throw new HttpError(409, 'DESK_REQUEST_STALE', 'This pickup changed. Refresh the list before starting checkout.')
  }
  const cartHandover = row.request_kind === 'CartHandover' && row.reservation_status === 'approved'
  if (row.reservation_id && !cartHandover && (row.reservation_status !== 'ready_for_pickup' || !row.pickup_deadline || localTimestamp(row.pickup_deadline) <= now.getTime())) {
    throw new HttpError(409, 'DESK_REQUEST_NOT_READY', 'This request is not ready for pickup or its pickup time has passed.')
  }
  if (!row.copy_id || !row.barcode || (transactionId !== null && row.reservation_id && Number(row.copy_id) !== Number(row.assigned_physical_copy_id))) {
    throw new HttpError(409, 'DESK_REQUEST_COPY_MISMATCH', 'The assigned copy changed. Refresh this pickup before continuing.')
  }
  if (confirming && (!Number.isSafeInteger(Number(input.expectedCopyId)) || Number(input.expectedCopyId) !== Number(row.copy_id)
    || String(input.barcode ?? '').trim().toUpperCase() !== String(row.barcode).toUpperCase())) {
    throw new HttpError(409, 'DESK_REQUEST_COPY_MISMATCH', 'The assigned copy changed. Review the current borrower and book before confirming handover.')
  }
  return { userId: Number(row.user_id), copyId: Number(row.copy_id), barcode: String(row.barcode), reservationId: row.reservation_id == null ? null : Number(row.reservation_id) }
}
