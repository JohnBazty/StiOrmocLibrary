import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { parseQueueFilters, positiveId, validateReservationRequest, validateStatusAdjustment, type ReservationStatus } from './reservation.validation.ts'
import { queryReservationQueue } from './reservation-query.repository.ts'
import { cancelPendingCounterClaim, createPendingCounterClaim } from './reservation-claim.repository.ts'

// Claimed reservations are represented by their authoritative open loan and
// must not remain in a user's capacity forever after that loan is returned.
const ACTIVE_STATUSES = "('pending','approved','ready_for_pickup')"
const TRANSITIONS: Record<string, ReservationStatus[]> = {
  pending: ['approved', 'cancelled'], approved: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['cancelled'], claimed: [], cancelled: [], expired: [],
}

type ActiveBorrowConflict = RowDataPacket & { transaction_id: number; transaction_status: string }

async function findActiveBorrowConflict(connection: import('mysql2/promise').PoolConnection, input: {
  userId: number
  titleId: number | null
  isbn: string | null
  title: string
  excludedReservationId?: number
}) {
  const [rows] = await connection.execute<ActiveBorrowConflict[]>(
    `SELECT bt.transaction_id, bt.transaction_status
       FROM borrow_transactions bt
       INNER JOIN materials borrowed_material ON borrowed_material.material_id = bt.material_id
       LEFT JOIN physical_copies borrowed_copy
         ON borrowed_copy.physical_copy_id = bt.physical_copy_id
         OR (bt.physical_copy_id IS NULL AND borrowed_copy.material_id = bt.material_id)
      WHERE bt.user_id = ?
        AND bt.transaction_status IN ('Pending','Borrowed','Overdue')
        AND (? = 0 OR bt.reservation_id IS NULL OR bt.reservation_id <> ?)
        AND (
          (? IS NOT NULL AND borrowed_copy.title_id = ?)
          OR ((? IS NULL OR borrowed_copy.title_id IS NULL) AND (
            (borrowed_material.isbn IS NOT NULL AND ? IS NOT NULL AND borrowed_material.isbn = ?)
            OR LOWER(TRIM(borrowed_material.title)) = LOWER(TRIM(?))
          ))
        )
      ORDER BY bt.transaction_id ASC
      LIMIT 1 FOR UPDATE`,
    [input.userId, input.excludedReservationId ?? 0, input.excludedReservationId ?? 0,
      input.titleId, input.titleId, input.titleId, input.isbn, input.isbn, input.title],
  )
  return rows[0] ?? null
}

function activeBorrowConflictError(conflict: ActiveBorrowConflict, forAdmin = false) {
  const pending = String(conflict.transaction_status) === 'Pending'
  const message = forAdmin
    ? `Queue action blocked: this user already has this book in ${pending ? 'a pending checkout' : 'an active loan'}.`
    : pending
      ? 'You already checked out this book and it is awaiting counter claim. You cannot reserve the same book.'
      : 'You already borrowed this book. Return it before reserving the same book again.'
  return new HttpError(422, 'BOOK_ALREADY_IN_ACCOUNT', message, {
    transactionId: Number(conflict.transaction_id),
    transactionStatus: String(conflict.transaction_status),
  })
}

export function createReservationService(database: Pool = db) {
  return {
    queue: (query: Record<string, unknown>) => queryReservationQueue(database, parseQueueFilters(query)),

    async listForAccount(accountIdValue: unknown) {
      const accountId = positiveId(accountIdValue, 'accountId')
      const [accounts] = await database.execute<RowDataPacket[]>('SELECT user_id FROM accounts WHERE account_id = ? LIMIT 1', [accountId])
      const userId = accounts[0]?.user_id ? Number(accounts[0].user_id) : null
      if (!userId) throw new HttpError(422, 'CIRCULATION_PROFILE_NOT_LINKED', 'This login account is not linked to a circulation profile.')
      const [rows] = await database.execute<RowDataPacket[]>(
        `SELECT r.reservation_id, r.queue_position, r.reservation_status, r.reserved_at, r.pickup_deadline,
                COALESCE(t.title, m.title) AS title, t.cover_image_path,
                assigned_pc.accession_number, COALESCE(assigned_pc.barcode, assigned.barcode) AS barcode,
                COALESCE(assigned_pc.condition_status, source_pc.condition_status) AS condition_status
           FROM reservations r INNER JOIN materials m ON m.material_id = r.material_id
           LEFT JOIN physical_copies source_pc ON source_pc.material_id = r.material_id
           LEFT JOIN titles t ON t.title_id = COALESCE(r.book_title_id, source_pc.title_id)
           LEFT JOIN materials assigned ON assigned.material_id = r.accession_id
           LEFT JOIN physical_copies assigned_pc ON assigned_pc.physical_copy_id = r.assigned_physical_copy_id
          WHERE r.user_id = ? ORDER BY r.reserved_at DESC, r.reservation_id DESC`, [userId],
      )
      return rows.map((row) => ({ reservationId: Number(row.reservation_id), title: row.title,
        coverImagePath: row.cover_image_path ? String(row.cover_image_path) : null, queuePosition: Number(row.queue_position),
        status: row.reservation_status, reservedAt: row.reserved_at, pickupDeadline: row.pickup_deadline,
        accessionNumber: row.accession_number ?? null, barcode: row.barcode ?? null,
        conditionStatus: row.condition_status ? String(row.condition_status) : null }))
    },

    async createForAccount(accountIdValue: unknown, body: unknown) {
      const accountId = positiveId(accountIdValue, 'accountId')
      const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
      const [accounts] = await database.execute<RowDataPacket[]>(
        'SELECT user_id FROM accounts WHERE account_id = ? AND account_status = \'Active\' LIMIT 1', [accountId],
      )
      const userId = accounts[0]?.user_id ? Number(accounts[0].user_id) : null
      if (!userId) throw new HttpError(422, 'CIRCULATION_PROFILE_NOT_LINKED', 'This login account is not linked to a circulation profile.')
      let materialId = input.materialId ?? input.material_id
      const titleValue = input.bookTitleId ?? input.book_title_id
      if (titleValue !== undefined) {
        const titleId = positiveId(titleValue, 'bookTitleId')
        const [targets] = await database.execute<RowDataPacket[]>(
          `SELECT MIN(pc.material_id) AS material_id FROM physical_copies pc
            INNER JOIN titles t ON t.title_id = pc.title_id
           WHERE pc.title_id = ? AND t.record_type = 'Book' AND t.lifecycle_status = 'Active'
             AND pc.lifecycle_status = 'Active' AND pc.material_id IS NOT NULL`, [titleId],
        )
        materialId = targets[0]?.material_id
      }
      return createReservationService(database).create(userId, { materialId })
    },

    async create(userIdValue: unknown, body: unknown) {
      const userId = positiveId(userIdValue, 'userId')
      const { materialId } = validateReservationRequest(body)
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const [users] = await connection.execute<RowDataPacket[]>(
          `SELECT u.user_id, u.full_name, u.account_status, ro.role_name FROM users u
            JOIN roles ro ON ro.role_id = u.role_id WHERE u.user_id = ? LIMIT 1 FOR UPDATE`, [userId],
        )
        const user = users[0]
        if (!user) throw new HttpError(404, 'RESERVATION_USER_NOT_FOUND', 'The requesting user does not exist.')
        if (user.account_status !== 'Active') throw new HttpError(422, 'RESERVATION_ACCOUNT_INACTIVE', 'Only active accounts may create reservations.')

        const [materials] = await connection.execute<RowDataPacket[]>(
          `SELECT m.material_id, m.title, m.isbn, m.material_type, pc.title_id
             FROM materials m LEFT JOIN physical_copies pc ON pc.material_id = m.material_id
            WHERE m.material_id = ? LIMIT 1 FOR UPDATE`, [materialId],
        )
        const material = materials[0]
        if (!material) throw new HttpError(404, 'RESERVATION_MATERIAL_NOT_FOUND', 'The requested material does not exist.')
        if (material.material_type !== 'Book') {
          throw new HttpError(422, 'RESEARCH_VIEW_ONLY', 'Research and thesis records are view only and cannot be reserved or borrowed.')
        }

        // The normalized physical-copy ledger is authoritative. Legacy
        // materials can temporarily drift during migrations and titles with
        // identical display text can represent different editions.
        const [titleCopies] = await connection.execute<RowDataPacket[]>(
          `SELECT pc.physical_copy_id, pc.material_id, pc.availability_status
             FROM physical_copies pc
            WHERE pc.title_id = ? AND pc.lifecycle_status = 'Active'
            ORDER BY pc.physical_copy_id ASC FOR UPDATE`,
          [material.title_id],
        )
        const activeBorrowConflict = await findActiveBorrowConflict(connection, {
          userId,
          titleId: material.title_id ? Number(material.title_id) : null,
          isbn: material.isbn ? String(material.isbn) : null,
          title: String(material.title),
        })
        if (activeBorrowConflict) throw activeBorrowConflictError(activeBorrowConflict)

        if (titleCopies.some((copy) => copy.availability_status === 'Available')) {
          throw new HttpError(422, 'BOOK_AVAILABLE_FOR_BORROW', 'This title currently has an available copy and does not require a reservation.')
        }

        const [duplicates] = await connection.execute<RowDataPacket[]>(
          `SELECT r.reservation_id FROM reservations r
            JOIN materials rm ON rm.material_id = r.material_id
            LEFT JOIN physical_copies reserved_copy ON reserved_copy.material_id = r.material_id
           WHERE r.user_id = ? AND r.reservation_status IN ${ACTIVE_STATUSES}
             AND (
               r.material_id = ?
               OR (? IS NOT NULL AND COALESCE(r.book_title_id, reserved_copy.title_id) = ?)
               OR ((? IS NULL OR COALESCE(r.book_title_id, reserved_copy.title_id) IS NULL) AND (
                 (rm.isbn IS NOT NULL AND ? IS NOT NULL AND rm.isbn = ?)
                 OR LOWER(TRIM(rm.title)) = LOWER(TRIM(?))
               ))
             )
           LIMIT 1 FOR UPDATE`, [userId, materialId, material.title_id, material.title_id,
            material.title_id, material.isbn, material.isbn, material.title],
        )
        if (duplicates[0]) throw new HttpError(422, 'DUPLICATE_ACTIVE_RESERVATION', 'You already have an active reservation for this title.')

        if (user.role_name === 'Student' && material.material_type === 'Book') {
          const [activeRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COUNT(DISTINCT COALESCE(active.title_id, -active.material_id)) AS active_count
               FROM (
                 SELECT r.material_id, COALESCE(r.book_title_id, rpc.title_id) AS title_id
                   FROM reservations r LEFT JOIN physical_copies rpc ON rpc.material_id = r.material_id
                  WHERE r.user_id = ? AND r.reservation_status IN ${ACTIVE_STATUSES}
                 UNION ALL
                 SELECT bt.material_id, bpc.title_id
                   FROM borrow_transactions bt LEFT JOIN physical_copies bpc
                     ON bpc.physical_copy_id = bt.physical_copy_id
                     OR (bt.physical_copy_id IS NULL AND bpc.material_id = bt.material_id)
                  WHERE bt.user_id = ? AND bt.transaction_status IN ('Pending','Borrowed','Overdue')
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
             LEFT JOIN physical_copies queue_copy ON queue_copy.material_id = r.material_id
            WHERE r.reservation_status IN ('pending','approved','ready_for_pickup')
              AND (
                (? IS NOT NULL AND COALESCE(r.book_title_id, queue_copy.title_id) = ?)
                OR ((? IS NULL OR COALESCE(r.book_title_id, queue_copy.title_id) IS NULL) AND (
                  (qm.isbn IS NOT NULL AND ? IS NOT NULL AND qm.isbn = ?)
                  OR LOWER(TRIM(qm.title)) = LOWER(TRIM(?))
                ))
              )`, [material.title_id, material.title_id, material.title_id,
              material.isbn, material.isbn, material.title],
        )
        const queuePosition = Number(queueRows[0]?.next_position ?? 1)
        const [insert] = await connection.execute<ResultSetHeader>(
          `INSERT INTO reservations (user_id, material_id, book_title_id, accession_id, assigned_physical_copy_id, queue_position,
             reservation_status, reserved_at, pickup_deadline, created_at)
           VALUES (?, ?, ?, NULL, NULL, ?, 'pending', NOW(), NULL, NOW())`, [userId, materialId, material.title_id ?? null, queuePosition],
        )
        await connection.execute(
          `INSERT INTO admin_notifications
             (event_type, actor_user_id, reservation_id, book_title_id, message_title, message_body)
           VALUES ('reservation_requested', ?, ?, ?, 'New reservation request', ?)`,
          [userId, insert.insertId, material.title_id ?? null, `${user.full_name ?? 'A library user'} requested ${material.title}.`],
        )
        await connection.commit()
        return { reservationId: insert.insertId, userId, materialId, queuePosition, status: 'pending' }
      } catch (error) { await connection.rollback(); throw error } finally { connection.release() }
    },

    async cancelForAccount(accountIdValue: unknown, reservationIdValue: unknown) {
      const accountId = positiveId(accountIdValue, 'accountId')
      const reservationId = positiveId(reservationIdValue, 'reservationId')
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const [accountRows] = await connection.execute<RowDataPacket[]>(
          'SELECT user_id FROM accounts WHERE account_id = ? AND user_id IS NOT NULL LIMIT 1 FOR UPDATE', [accountId],
        )
        const userId = accountRows[0]?.user_id ? Number(accountRows[0].user_id) : null
        if (!userId) throw new HttpError(422, 'CIRCULATION_PROFILE_NOT_LINKED', 'This login account is not linked to a circulation profile.')
        const [rows] = await connection.execute<RowDataPacket[]>(
          `SELECT r.reservation_id, r.user_id, r.material_id, r.book_title_id, r.accession_id,
                  r.assigned_physical_copy_id, r.queue_position, r.reservation_status, m.title
             FROM reservations r INNER JOIN materials m ON m.material_id = r.material_id
            WHERE r.reservation_id = ? LIMIT 1 FOR UPDATE`, [reservationId],
        )
        const reservation = rows[0]
        if (!reservation || Number(reservation.user_id) !== userId) throw new HttpError(404, 'RESERVATION_NOT_FOUND', 'The reservation does not exist.')
        if (!['pending', 'approved', 'ready_for_pickup'].includes(String(reservation.reservation_status))) {
          throw new HttpError(422, 'RESERVATION_CANCELLATION_INVALID', 'Only waiting reservations can be cancelled.')
        }
        await connection.execute("UPDATE reservations SET reservation_status = 'cancelled', accession_id = NULL, assigned_physical_copy_id = NULL, pickup_deadline = NULL, updated_at = NOW() WHERE reservation_id = ?", [reservationId])
        await cancelPendingCounterClaim(connection, reservationId, userId, 'Reservation cancelled by the requesting user.')
        if (reservation.accession_id) {
          await connection.execute("UPDATE materials SET availability_status = 'Available', updated_at = NOW() WHERE material_id = ? AND availability_status = 'Reserved'", [reservation.accession_id])
          await connection.execute("UPDATE physical_copies SET availability_status = 'Available', updated_at = NOW() WHERE physical_copy_id = ? AND availability_status = 'Reserved'", [reservation.assigned_physical_copy_id])
        }
        if (reservation.book_title_id) {
          await connection.execute(
            `UPDATE reservations SET queue_position = queue_position - 1, updated_at = NOW()
              WHERE book_title_id = ? AND reservation_status IN ('pending','approved','ready_for_pickup') AND queue_position > ?`,
            [reservation.book_title_id, reservation.queue_position],
          )
        }
        await connection.execute(
          `INSERT INTO admin_notifications (event_type, actor_user_id, reservation_id, book_title_id, message_title, message_body)
           VALUES ('reservation_cancelled', ?, ?, ?, 'Reservation cancelled', ?)`,
          [userId, reservationId, reservation.book_title_id ?? null, `${reservation.title} reservation was cancelled and its queue was realigned.`],
        )
        await connection.commit()
        return { reservationId, status: 'cancelled' as const, queueRealigned: Boolean(reservation.book_title_id) }
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
          `SELECT r.*, m.title, m.isbn, m.material_type, COALESCE(r.book_title_id, pc.title_id) AS resolved_title_id
             FROM reservations r
             JOIN materials m ON m.material_id = r.material_id
             LEFT JOIN physical_copies pc ON pc.material_id = r.material_id
            WHERE r.reservation_id = ? LIMIT 1 FOR UPDATE`, [reservationId],
        )
        const reservation = rows[0]
        if (!reservation) throw new HttpError(404, 'RESERVATION_NOT_FOUND', 'The reservation does not exist.')
        if (!TRANSITIONS[String(reservation.reservation_status)]?.includes(adjustment.status)) {
          throw new HttpError(422, 'RESERVATION_TRANSITION_INVALID', `Cannot move a ${reservation.reservation_status} reservation to ${adjustment.status}.`)
        }

        if (adjustment.status === 'approved' || adjustment.status === 'ready_for_pickup') {
          const activeBorrowConflict = await findActiveBorrowConflict(connection, {
            userId: Number(reservation.user_id),
            titleId: reservation.resolved_title_id ? Number(reservation.resolved_title_id) : null,
            isbn: reservation.isbn ? String(reservation.isbn) : null,
            title: String(reservation.title),
            excludedReservationId: reservationId,
          })
          if (activeBorrowConflict) throw activeBorrowConflictError(activeBorrowConflict, true)
        }

        if (adjustment.status === 'ready_for_pickup') {
          if (Number(reservation.queue_position) !== 1) {
            throw new HttpError(422, 'RESERVATION_NOT_QUEUE_HEAD', 'Only the first eligible reservation in the waitlist may be marked ready for pickup.')
          }
          const [copies] = await connection.execute<RowDataPacket[]>(
            `SELECT candidate.material_id, candidate.barcode, pc.physical_copy_id
               FROM materials candidate INNER JOIN physical_copies pc ON pc.material_id = candidate.material_id
              WHERE candidate.availability_status = 'Available' AND candidate.material_type = ?
                AND pc.lifecycle_status = 'Active' AND pc.availability_status = 'Available'
                AND ((candidate.isbn IS NOT NULL AND ? IS NOT NULL AND candidate.isbn = ?)
                  OR LOWER(TRIM(candidate.title)) = LOWER(TRIM(?)))
                AND NOT EXISTS (SELECT 1 FROM reservations active
                  WHERE active.accession_id = candidate.material_id
                    AND active.reservation_status = 'ready_for_pickup')
              ORDER BY candidate.material_id ASC LIMIT 1 FOR UPDATE`,
            [reservation.material_type, reservation.isbn, reservation.isbn, reservation.title],
          )
          const copy = copies[0]
          if (!copy) throw new HttpError(422, 'NO_AVAILABLE_ACCESSION', 'No available physical copy can be assigned to this reservation.')
          const deadline = adjustment.pickupDeadline ?? new Date(Date.now() + 24 * 60 * 60 * 1000)
          if (deadline.getTime() <= Date.now()) throw new HttpError(422, 'PICKUP_DEADLINE_INVALID', 'Pickup deadline must be in the future.')
          await connection.execute(
            `UPDATE reservations SET reservation_status = 'ready_for_pickup', accession_id = ?,
               assigned_physical_copy_id = ?, pickup_deadline = ?, updated_at = NOW() WHERE reservation_id = ?`,
            [copy.material_id, copy.physical_copy_id, deadline, reservationId],
          )
          await connection.execute("UPDATE materials SET availability_status = 'Reserved', updated_at = NOW() WHERE material_id = ?", [copy.material_id])
          await connection.execute("UPDATE physical_copies SET availability_status = 'Reserved', updated_at = NOW() WHERE physical_copy_id = ?", [copy.physical_copy_id])
          const pendingClaimTransactionId = await createPendingCounterClaim(connection,
            { reservation_id: reservationId, user_id: Number(reservation.user_id) },
            { material_id: Number(copy.material_id), physical_copy_id: Number(copy.physical_copy_id) })
          await connection.execute(
            `INSERT INTO admin_notifications
               (event_type, actor_user_id, reservation_id, borrow_transaction_id, book_title_id, message_title, message_body)
             VALUES ('borrow_request_submitted', ?, ?, ?, ?, 'Reservation awaiting counter claim', ?)`,
            [reservation.user_id, reservationId, pendingClaimTransactionId, reservation.resolved_title_id,
              `${reservation.title} is ready. Verify the borrower school ID and scan the physical barcode at the desk.`],
          )
        } else if (adjustment.status === 'cancelled') {
          await connection.execute("UPDATE reservations SET reservation_status = 'cancelled', accession_id = NULL, assigned_physical_copy_id = NULL, pickup_deadline = NULL, updated_at = NOW() WHERE reservation_id = ?", [reservationId])
          await cancelPendingCounterClaim(connection, reservationId, adminUserId, 'Reservation cancelled by library staff.')
          if (reservation.accession_id) {
            await connection.execute("UPDATE materials SET availability_status = 'Available', updated_at = NOW() WHERE material_id = ? AND availability_status = 'Reserved'", [reservation.accession_id])
            await connection.execute("UPDATE physical_copies SET availability_status = 'Available', updated_at = NOW() WHERE material_id = ? AND availability_status = 'Reserved'", [reservation.accession_id])
          }
          if (reservation.resolved_title_id) {
            await connection.execute(
              `UPDATE reservations SET queue_position = queue_position - 1, updated_at = NOW()
                WHERE book_title_id = ? AND reservation_status IN ('pending','approved','ready_for_pickup') AND queue_position > ?`,
              [reservation.resolved_title_id, reservation.queue_position],
            )
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
