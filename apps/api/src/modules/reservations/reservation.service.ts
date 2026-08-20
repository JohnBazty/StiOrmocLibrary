import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { parseQueueFilters, positiveId, validateReservationRequest, validateStatusAdjustment, type ReservationStatus } from './reservation.validation.ts'
import { queryReservationQueue } from './reservation-query.repository.ts'

const ACTIVE_STATUSES = "('pending','approved','ready_for_pickup','claimed')"
const TRANSITIONS: Record<string, ReservationStatus[]> = {
  pending: ['approved', 'cancelled'], approved: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['claimed', 'cancelled'], claimed: [], cancelled: [], expired: [],
}

export function createReservationService(database: Pool = db) {
  return {
    queue: (query: Record<string, unknown>) => queryReservationQueue(database, parseQueueFilters(query)),

    async create(userIdValue: unknown, body: unknown) {
      const userId = positiveId(userIdValue, 'userId')
      const { materialId } = validateReservationRequest(body)
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const [users] = await connection.execute<RowDataPacket[]>(
          `SELECT u.user_id, u.account_status, ro.role_name FROM users u
            JOIN roles ro ON ro.role_id = u.role_id WHERE u.user_id = ? LIMIT 1 FOR UPDATE`, [userId],
        )
        const user = users[0]
        if (!user) throw new HttpError(404, 'RESERVATION_USER_NOT_FOUND', 'The requesting user does not exist.')
        if (user.account_status !== 'Active') throw new HttpError(422, 'RESERVATION_ACCOUNT_INACTIVE', 'Only active accounts may create reservations.')

        const [materials] = await connection.execute<RowDataPacket[]>(
          `SELECT material_id, title, isbn, material_type FROM materials
            WHERE material_id = ? LIMIT 1 FOR UPDATE`, [materialId],
        )
        const material = materials[0]
        if (!material) throw new HttpError(404, 'RESERVATION_MATERIAL_NOT_FOUND', 'The requested material does not exist.')

        // Lock every physical row for the title in stable ID order. This
        // serializes duplicate checks and queue-position assignment even when
        // two clients reserve different copies of the same title concurrently.
        await connection.execute<RowDataPacket[]>(
          `SELECT material_id FROM materials
            WHERE (isbn IS NOT NULL AND ? IS NOT NULL AND isbn = ?)
               OR LOWER(TRIM(title)) = LOWER(TRIM(?))
            ORDER BY material_id ASC FOR UPDATE`,
          [material.isbn, material.isbn, material.title],
        )

        const [duplicates] = await connection.execute<RowDataPacket[]>(
          `SELECT r.reservation_id FROM reservations r
            JOIN materials rm ON rm.material_id = r.material_id
           WHERE r.user_id = ? AND r.reservation_status IN ${ACTIVE_STATUSES}
             AND (r.material_id = ? OR (rm.isbn IS NOT NULL AND ? IS NOT NULL AND rm.isbn = ?)
               OR LOWER(TRIM(rm.title)) = LOWER(TRIM(?)))
           LIMIT 1 FOR UPDATE`, [userId, materialId, material.isbn, material.isbn, material.title],
        )
        if (duplicates[0]) throw new HttpError(422, 'DUPLICATE_ACTIVE_RESERVATION', 'You already have an active reservation for this title.')

        if (user.role_name === 'Student' && material.material_type === 'Book') {
          const [activeRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COUNT(DISTINCT active.material_id) AS active_count
               FROM (
                 SELECT material_id FROM reservations WHERE user_id = ? AND reservation_status IN ${ACTIVE_STATUSES}
                 UNION ALL
                 SELECT material_id FROM borrow_transactions WHERE user_id = ? AND transaction_status IN ('Pending','Borrowed','Overdue')
               ) active JOIN materials am ON am.material_id = active.material_id
              WHERE am.material_type = 'Book'`, [userId, userId],
          )
          const activeCount = Number(activeRows[0]?.active_count ?? 0)
          if (activeCount >= 2) {
            throw new HttpError(422, 'STUDENT_BORROW_LIMIT_REACHED', 'Transaction Blocked: Students cannot exceed 2 books', { activeCount, limit: 2 })
          }
        }

        const [queueRows] = await connection.execute<RowDataPacket[]>(
          `SELECT COALESCE(MAX(r.queue_position), 0) + 1 AS next_position
             FROM reservations r JOIN materials qm ON qm.material_id = r.material_id
            WHERE r.reservation_status IN ('pending','approved','ready_for_pickup')
              AND ((qm.isbn IS NOT NULL AND ? IS NOT NULL AND qm.isbn = ?) OR LOWER(TRIM(qm.title)) = LOWER(TRIM(?)))
            `, [material.isbn, material.isbn, material.title],
        )
        const queuePosition = Number(queueRows[0]?.next_position ?? 1)
        const [insert] = await connection.execute<ResultSetHeader>(
          `INSERT INTO reservations (user_id, material_id, accession_id, queue_position,
             reservation_status, reserved_at, pickup_deadline, created_at)
           VALUES (?, ?, NULL, ?, 'pending', NOW(), NULL, NOW())`, [userId, materialId, queuePosition],
        )
        await connection.commit()
        return { reservationId: insert.insertId, userId, materialId, queuePosition, status: 'pending' }
      } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
    },

    async adjustStatus(adminUserIdValue: unknown, reservationIdValue: unknown, body: unknown) {
      const adminUserId = positiveId(adminUserIdValue, 'adminUserId')
      const reservationId = positiveId(reservationIdValue, 'reservationId')
      const adjustment = validateStatusAdjustment(body)
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const [rows] = await connection.execute<RowDataPacket[]>(
          `SELECT r.*, m.title, m.isbn, m.material_type FROM reservations r
             JOIN materials m ON m.material_id = r.material_id
            WHERE r.reservation_id = ? LIMIT 1 FOR UPDATE`, [reservationId],
        )
        const reservation = rows[0]
        if (!reservation) throw new HttpError(404, 'RESERVATION_NOT_FOUND', 'The reservation does not exist.')
        if (!TRANSITIONS[String(reservation.reservation_status)]?.includes(adjustment.status)) {
          throw new HttpError(422, 'RESERVATION_TRANSITION_INVALID', `Cannot move a ${reservation.reservation_status} reservation to ${adjustment.status}.`)
        }

        if (adjustment.status === 'ready_for_pickup') {
          const [copies] = await connection.execute<RowDataPacket[]>(
            `SELECT candidate.material_id, candidate.barcode
               FROM materials candidate
              WHERE candidate.availability_status = 'Available' AND candidate.material_type = ?
                AND ((candidate.isbn IS NOT NULL AND ? IS NOT NULL AND candidate.isbn = ?)
                  OR LOWER(TRIM(candidate.title)) = LOWER(TRIM(?)))
                AND NOT EXISTS (SELECT 1 FROM reservations active
                  WHERE active.accession_id = candidate.material_id
                    AND active.reservation_status IN ('ready_for_pickup','claimed'))
              ORDER BY candidate.material_id ASC LIMIT 1 FOR UPDATE`,
            [reservation.material_type, reservation.isbn, reservation.isbn, reservation.title],
          )
          const copy = copies[0]
          if (!copy) throw new HttpError(422, 'NO_AVAILABLE_ACCESSION', 'No available physical copy can be assigned to this reservation.')
          const deadline = adjustment.pickupDeadline ?? new Date(Date.now() + 24 * 60 * 60 * 1000)
          if (deadline.getTime() <= Date.now()) throw new HttpError(422, 'PICKUP_DEADLINE_INVALID', 'Pickup deadline must be in the future.')
          await connection.execute(
            `UPDATE reservations SET reservation_status = 'ready_for_pickup', accession_id = ?,
               pickup_deadline = ?, updated_at = NOW() WHERE reservation_id = ?`, [copy.material_id, deadline, reservationId],
          )
          await connection.execute("UPDATE materials SET availability_status = 'Reserved', updated_at = NOW() WHERE material_id = ?", [copy.material_id])
          await connection.execute("UPDATE physical_copies SET availability_status = 'Reserved', updated_at = NOW() WHERE material_id = ? AND lifecycle_status = 'Active'", [copy.material_id])
        } else if (adjustment.status === 'claimed') {
          await connection.execute("UPDATE reservations SET reservation_status = 'claimed', updated_at = NOW() WHERE reservation_id = ?", [reservationId])
          await connection.execute("UPDATE materials SET availability_status = 'Borrowed', updated_at = NOW() WHERE material_id = ?", [reservation.accession_id])
          await connection.execute("UPDATE physical_copies SET availability_status = 'Borrowed', updated_at = NOW() WHERE material_id = ?", [reservation.accession_id])
        } else if (adjustment.status === 'cancelled') {
          await connection.execute("UPDATE reservations SET reservation_status = 'cancelled', accession_id = NULL, pickup_deadline = NULL, updated_at = NOW() WHERE reservation_id = ?", [reservationId])
          if (reservation.accession_id) {
            await connection.execute("UPDATE materials SET availability_status = 'Available', updated_at = NOW() WHERE material_id = ? AND availability_status = 'Reserved'", [reservation.accession_id])
            await connection.execute("UPDATE physical_copies SET availability_status = 'Available', updated_at = NOW() WHERE material_id = ? AND availability_status = 'Reserved'", [reservation.accession_id])
          }
        } else {
          await connection.execute("UPDATE reservations SET reservation_status = 'approved', updated_at = NOW() WHERE reservation_id = ?", [reservationId])
        }
        await connection.commit()
        return { reservationId, status: adjustment.status, processedByUserId: adminUserId }
      } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
    },
  }
}

export const reservationService = createReservationService()
