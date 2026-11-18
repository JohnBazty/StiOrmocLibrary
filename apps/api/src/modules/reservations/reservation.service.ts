import type { Pool, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { parseQueueFilters, positiveId } from './reservation.validation.ts'
import { queryReservationQueue } from './reservation-query.repository.ts'
import { createBookRequestService } from './book-request.service.ts'
import { requestEventStatus, requestInstructions, requestLabels } from './book-request-events.ts'

export function createReservationService(database: Pool = db, clock: () => Date = () => new Date()) {
  return {
    queue: (query: Record<string, unknown>) => queryReservationQueue(database, parseQueueFilters(query)),

    async listForAccount(accountIdValue: unknown) {
      const accountId = positiveId(accountIdValue, 'accountId')
      const [accounts] = await database.execute<RowDataPacket[]>('SELECT user_id FROM accounts WHERE account_id = ? LIMIT 1', [accountId])
      const userId = accounts[0]?.user_id ? Number(accounts[0].user_id) : null
      if (!userId) throw new HttpError(422, 'CIRCULATION_PROFILE_NOT_LINKED', 'This login account is not linked to a circulation profile.')
      const [rows] = await database.execute<RowDataPacket[]>(
        `SELECT r.reservation_id, r.queue_position, r.reservation_status, r.reserved_at, r.pickup_deadline, ${'r.request_kind,'}
                COALESCE(t.title, m.title) AS title, t.title_id, t.cover_image_path,
                assigned_pc.accession_number, COALESCE(assigned_pc.barcode, assigned.barcode) AS barcode,
                COALESCE(assigned_pc.condition_status, source_pc.condition_status) AS condition_status
                ${`, (r.pickup_deadline AT TIME ZONE 'Asia/Manila') AS deadline_iso,
                  (r.reserved_at AT TIME ZONE 'Asia/Manila') AS requested_iso,
                  r.preparation_started_at,r.ready_at,
                  (SELECT json_agg(json_build_object('status',e.event_status,'at',e.occurred_at) ORDER BY e.occurred_at,e.event_id)
                   FROM book_request_events e WHERE e.reservation_id=r.reservation_id) AS events,
                  (SELECT d.status FROM book_request_email_deliveries d JOIN book_request_events e ON e.event_id=d.event_id
                   WHERE e.reservation_id=r.reservation_id ORDER BY e.event_id DESC LIMIT 1) AS email_status`}
           FROM reservations r INNER JOIN materials m ON m.material_id = r.material_id
           LEFT JOIN physical_copies source_pc ON source_pc.material_id = r.material_id
           LEFT JOIN titles t ON t.title_id = COALESCE(r.book_title_id, source_pc.title_id)
           LEFT JOIN materials assigned ON assigned.material_id = r.accession_id
           LEFT JOIN physical_copies assigned_pc ON assigned_pc.physical_copy_id = r.assigned_physical_copy_id
          WHERE r.user_id = ? ORDER BY r.reserved_at DESC, r.reservation_id DESC`, [userId],
      )
      return rows.map((row) => ({ requestKind:row.request_kind??'Reservation', reservationId: Number(row.reservation_id), title: row.title, titleId: row.title_id ? Number(row.title_id) : null,
        coverImagePath: row.cover_image_path ? String(row.cover_image_path) : null, queuePosition: Number(row.queue_position),
        status: row.reservation_status, reservedAt: row.requested_iso,
        pickupDeadline: row.deadline_iso,
        requestStatus: requestEventStatus(String(row.reservation_status),Boolean(row.barcode)),
        statusLabel: row.request_kind==='CartHandover'&&row.reservation_status==='approved'?'Awaiting handover':requestLabels[requestEventStatus(String(row.reservation_status),Boolean(row.barcode))],
        instructions: row.request_kind==='CartHandover'&&row.reservation_status==='approved'?'Bring your selected book to the library desk. Staff will confirm handover before the loan starts.':requestInstructions(requestEventStatus(String(row.reservation_status),Boolean(row.barcode)),row.deadline_iso ? new Date(row.deadline_iso) : null),
        events: row.events ?? [], emailStatus: row.email_status ?? null,
        accessionNumber: row.accession_number ?? null, barcode: row.barcode ?? null,
        conditionStatus: row.condition_status ? String(row.condition_status) : null }))
    },

    async createForAccount(accountIdValue: unknown, body: unknown) {
      return createBookRequestService(database,clock).createForAccount(accountIdValue,body)
    },

    async create(userIdValue: unknown, body: unknown) {
      return createBookRequestService(database,clock).create(userIdValue,body)
    },

    async cancelForAccount(accountIdValue: unknown, reservationIdValue: unknown) {
      return createBookRequestService(database,clock).cancel(accountIdValue,reservationIdValue)
    },

    async adjustStatus(adminUserIdValue: unknown, reservationIdValue: unknown, body: unknown) {
      return createBookRequestService(database,clock).adjustStatus(adminUserIdValue,reservationIdValue,body)
    },
  }
}

export const reservationService = createReservationService()
