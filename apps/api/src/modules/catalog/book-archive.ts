import type { Pool, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { authorsAgg } from '../../config/sql-dialect.js'
import { HttpError } from '../../core/http-error.ts'

function id(value: unknown) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new HttpError(422, 'ARCHIVE_ID_INVALID', 'Choose a valid book.')
  return parsed
}

export function createBookArchive(database: Pool = db) {
  return {
    async deletedSnapshots(query: unknown) {
      const q = typeof query === 'string' ? query.trim().slice(0, 100) : ''
      const [rows] = await database.execute<RowDataPacket[]>(
        `SELECT ia.inventory_audit_event_id AS "eventId", ia.barcode_snapshot AS barcode,
                ia.previous_condition AS "lastCondition", ia.previous_availability AS "lastAvailability",
                ia.action_reason AS reason, ia.verified_by_label AS "staffLabel", ia.created_at AS "deletedAt"
           FROM inventory_audit_events ia
          WHERE ia.event_type='Deleted' AND ia.physical_copy_id IS NULL AND ia.barcode_snapshot LIKE ?
          ORDER BY ia.inventory_audit_event_id DESC LIMIT 200`, [`%${q}%`],
      )
      return rows.map(row => ({ ...row, eventId: Number(row.eventId) }))
    },
    async list(query: unknown) {
      const q = typeof query === 'string' ? query.trim().slice(0, 100) : ''
      const match = `%${q}%`
      const [rows] = await database.execute<RowDataPacket[]>(
        `SELECT t.title_id AS "titleId", t.title, t.isbn, t.archived_at AS "archivedAt",
                t.archive_reason AS reason, actor.school_id AS "archivedBy",
                (SELECT ${authorsAgg('a')} FROM authors a WHERE a.title_id=t.title_id) AS authors,
                (SELECT COUNT(*) FROM physical_copies pc WHERE pc.title_id=t.title_id) AS "copyCount"
           FROM titles t LEFT JOIN accounts actor ON actor.account_id=t.archived_by_account_id
          WHERE t.record_type='Book' AND t.lifecycle_status='Archived'
            AND (t.title LIKE ? OR t.isbn LIKE ? OR EXISTS
              (SELECT 1 FROM physical_copies pc WHERE pc.title_id=t.title_id AND
                (pc.barcode LIKE ? OR pc.accession_number LIKE ?)))
          ORDER BY t.archived_at DESC, t.title_id DESC LIMIT 200`, [match, match, match, match],
      )
      const [copyRows] = await database.execute<RowDataPacket[]>(
        `SELECT t.title_id AS "titleId", t.title, t.isbn, pc.physical_copy_id AS "copyId",
                pc.accession_number AS accession, pc.barcode, pc.archived_at AS "archivedAt",
                pc.archive_reason AS reason,
                (SELECT ia.verified_by_label FROM inventory_audit_events ia
                  WHERE ia.physical_copy_id=pc.physical_copy_id AND ia.event_type='Archived'
                  ORDER BY ia.inventory_audit_event_id DESC LIMIT 1) AS "archivedBy",
                (SELECT ${authorsAgg('a')} FROM authors a WHERE a.title_id=t.title_id) AS authors
           FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id
          WHERE pc.lifecycle_status='Archived' AND t.lifecycle_status='Active' AND t.record_type='Book'
            AND (t.title LIKE ? OR t.isbn LIKE ? OR pc.barcode LIKE ? OR pc.accession_number LIKE ?)
          ORDER BY pc.archived_at DESC, pc.physical_copy_id DESC LIMIT 200`, [match, match, match, match],
      )
      return [
        ...rows.map(row => ({ ...row, titleId: Number(row.titleId), copyCount: Number(row.copyCount), recordKind: 'Archived title' })),
        ...copyRows.map(row => ({ ...row, titleId: Number(row.titleId), copyId: Number(row.copyId), copyCount: 1, recordKind: 'Archived copy' })),
      ].sort((a, b) => new Date(String((b as unknown as Record<string, unknown>).archivedAt)).getTime() - new Date(String((a as unknown as Record<string, unknown>).archivedAt)).getTime())
    },
    async detail(value: unknown) {
      const titleId = id(value)
      const [titles] = await database.execute<RowDataPacket[]>(
        `SELECT t.title_id AS "titleId", t.title, t.isbn, t.publisher,
                t.publication_year AS "publicationYear", t.archived_at AS "archivedAt",
                t.archive_reason AS reason, actor.school_id AS "archivedBy",
                (SELECT ${authorsAgg('a')} FROM authors a WHERE a.title_id=t.title_id) AS authors
           FROM titles t LEFT JOIN accounts actor ON actor.account_id=t.archived_by_account_id
          WHERE t.title_id=? AND t.record_type='Book' AND
            (t.lifecycle_status='Archived' OR EXISTS
              (SELECT 1 FROM physical_copies pc WHERE pc.title_id=t.title_id AND pc.lifecycle_status='Archived'))`, [titleId],
      )
      if (!titles[0]) throw new HttpError(404, 'ARCHIVED_BOOK_NOT_FOUND', 'Archived book not found.')
      const [copies] = await database.execute<RowDataPacket[]>(
        `SELECT pc.physical_copy_id AS "copyId", pc.accession_number AS accession,
                pc.barcode, pc.shelf_location AS shelf, pc.condition_status AS condition,
                pc.archived_at AS "archivedAt", pc.archive_reason AS reason,
                (SELECT COUNT(*) FROM borrow_transactions bt
                  WHERE bt.material_id=COALESCE(pc.material_id,pc.physical_copy_id)) AS "borrowingCount"
           FROM physical_copies pc WHERE pc.title_id=? AND pc.lifecycle_status='Archived'
           ORDER BY pc.physical_copy_id`, [titleId],
      )
      const [borrowings] = await database.execute<RowDataPacket[]>(
        `SELECT bt.transaction_id AS "transactionId", bt.transaction_status AS status,
                bt.borrowed_at AS "borrowedAt", bt.returned_at AS "returnedAt",
                pc.accession_number AS accession, borrower.school_id AS "borrowerId"
           FROM physical_copies pc JOIN borrow_transactions bt
             ON bt.physical_copy_id=pc.physical_copy_id
               OR (pc.material_id IS NOT NULL AND bt.material_id=pc.material_id)
           JOIN users borrower ON borrower.user_id=bt.user_id
          WHERE pc.title_id=? AND pc.lifecycle_status='Archived'
          ORDER BY bt.transaction_id DESC LIMIT 100`, [titleId],
      )
      const [auditEvents] = await database.execute<RowDataPacket[]>(
        `SELECT ia.inventory_audit_event_id AS "eventId", ia.event_type AS "eventType",
                ia.action_reason AS reason, ia.verified_by_label AS "staffLabel",
                ia.created_at AS "createdAt", pc.accession_number AS accession
           FROM physical_copies pc JOIN inventory_audit_events ia ON ia.physical_copy_id=pc.physical_copy_id
          WHERE pc.title_id=? AND pc.lifecycle_status='Archived'
          ORDER BY ia.inventory_audit_event_id DESC LIMIT 100`, [titleId],
      )
      return { ...titles[0], titleId,
        copies: copies.map(row => ({ ...row, copyId: Number(row.copyId), borrowingCount: Number(row.borrowingCount) })),
        borrowings: borrowings.map(row => ({ ...row, transactionId: Number(row.transactionId) })),
        auditEvents: auditEvents.map(row => ({ ...row, eventId: Number(row.eventId) })) }
    },
  }
}

export const bookArchive = createBookArchive()
