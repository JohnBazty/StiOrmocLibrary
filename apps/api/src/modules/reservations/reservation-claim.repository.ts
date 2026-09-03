import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'

export async function createPendingCounterClaim(
  connection: PoolConnection,
  reservation: { reservation_id: number; user_id: number },
  copy: { material_id: number; physical_copy_id: number },
) {
  const [existing] = await connection.execute<RowDataPacket[]>(
    'SELECT transaction_id, transaction_status FROM borrow_transactions WHERE reservation_id = ? LIMIT 1 FOR UPDATE',
    [reservation.reservation_id],
  )
  if (existing[0]) return Number(existing[0].transaction_id)
  const [insert] = await connection.execute<ResultSetHeader>(
    `INSERT INTO borrow_transactions
       (user_id, material_id, physical_copy_id, reservation_id, request_group_id, transaction_status, created_at)
     VALUES (?, ?, ?, ?, UUID(), 'Pending', NOW())`,
    [reservation.user_id, copy.material_id, copy.physical_copy_id, reservation.reservation_id],
  )
  return Number(insert.insertId)
}

export async function cancelPendingCounterClaim(connection: PoolConnection, reservationId: number, actorUserId: number | null, reason: string) {
  await connection.execute(
    `UPDATE borrow_transactions
        SET transaction_status = 'Cancelled', cancelled_at = NOW(), cancelled_by_user_id = ?,
            cancellation_reason = ?, updated_at = NOW()
      WHERE reservation_id = ? AND transaction_status = 'Pending'`,
    [actorUserId, reason, reservationId],
  )
}
