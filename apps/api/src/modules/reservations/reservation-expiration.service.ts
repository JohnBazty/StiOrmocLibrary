import type { Pool, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'

export async function expireReadyReservations(database: Pool = db, now: Date = new Date(), batchSize = 100) {
  const safeBatchSize = Math.min(Math.max(Math.trunc(batchSize), 1), 500)
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT reservation_id, accession_id FROM reservations
        WHERE reservation_status = 'ready_for_pickup' AND pickup_deadline IS NOT NULL
          AND pickup_deadline < ?
        ORDER BY pickup_deadline ASC, reservation_id ASC LIMIT ${safeBatchSize} FOR UPDATE`,
      [now],
    )
    const releasedAccessions: number[] = []
    for (const reservation of rows) {
      const accessionId = reservation.accession_id ? Number(reservation.accession_id) : null
      await connection.execute(
        `UPDATE reservations SET reservation_status = 'expired', accession_id = NULL,
           updated_at = NOW() WHERE reservation_id = ? AND reservation_status = 'ready_for_pickup'`,
        [reservation.reservation_id],
      )
      if (accessionId !== null) {
        await connection.execute("UPDATE materials SET availability_status = 'Available', updated_at = NOW() WHERE material_id = ? AND availability_status = 'Reserved'", [accessionId])
        await connection.execute("UPDATE physical_copies SET availability_status = 'Available', updated_at = NOW() WHERE material_id = ? AND availability_status = 'Reserved'", [accessionId])
        releasedAccessions.push(accessionId)
      }
    }
    await connection.commit()
    return { expiredCount: rows.length, releasedAccessions }
  } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
}
