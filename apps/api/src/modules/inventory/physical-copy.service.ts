import { HttpError } from '../../core/http-error.ts'
import type { PhysicalCopyMutationTransaction } from './physical-copy-mutation.middleware.ts'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'

function archiveReason(value: unknown) {
  const reason = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!reason) {
    throw new HttpError(422, 'ARCHIVE_REASON_REQUIRED', 'Provide a reason for archiving this physical copy.')
  }
  if (reason.length > 255) {
    throw new HttpError(422, 'ARCHIVE_REASON_TOO_LONG', 'Archive reason must not exceed 255 characters.')
  }
  return reason
}

export async function archivePhysicalCopy(
  transaction: PhysicalCopyMutationTransaction,
  reasonValue: unknown,
) {
  const reason = archiveReason(reasonValue)
  const { copy, connection } = transaction

  await connection.execute(
    `UPDATE physical_copies
        SET lifecycle_status = 'Archived',
            availability_status = 'Archived',
            archived_at = NOW(),
            archive_reason = ?,
            row_version = row_version + 1,
            updated_at = NOW()
      WHERE physical_copy_id = ?`,
    [reason, copy.physical_copy_id],
  )

  return {
    physicalCopyId: copy.physical_copy_id,
    accessionNumber: copy.accession_number,
    lifecycleStatus: 'Archived',
    reason,
  }
}

export async function deletePhysicalCopy(transaction: PhysicalCopyMutationTransaction) {
  const { copy, connection } = transaction

  const [historyRows] = await connection.execute(
    `SELECT transaction_id
       FROM borrow_transactions
      WHERE material_id = ?
      LIMIT 1
      FOR UPDATE`,
    [copy.circulation_material_id],
  )

  if (Array.isArray(historyRows) && historyRows.length > 0) {
    throw new HttpError(
      422,
      'PHYSICAL_COPY_HAS_BORROWING_HISTORY',
      `Copy ${copy.accession_number} has borrowing history and must be archived instead of deleted.`,
      {
        physicalCopyId: copy.physical_copy_id,
        materialId: copy.material_id,
        accessionNumber: copy.accession_number,
      },
    )
  }

  await connection.execute(
    'DELETE FROM physical_copies WHERE physical_copy_id = ?',
    [copy.physical_copy_id],
  )

  return {
    physicalCopyId: copy.physical_copy_id,
    accessionNumber: copy.accession_number,
    deleted: true,
  }
}

const COPY_CONDITIONS = new Set(['New', 'Good', 'Fair', 'Damaged', 'For Repair', 'Lost'])
const COPY_AVAILABILITY = new Set(['Available', 'Borrowed', 'Reserved', 'Unavailable'])

/** Safely updates copy-level shelf, condition, or availability attributes. */
export async function updatePhysicalCopy(database: Pool = db, copyIdValue: unknown, bodyValue: unknown) {
  const copyId = Number(copyIdValue)
  if (!Number.isSafeInteger(copyId) || copyId < 1) throw new HttpError(422, 'INVALID_PHYSICAL_COPY_ID', 'Physical copy ID must be a positive integer.')
  const body = bodyValue && typeof bodyValue === 'object' ? bodyValue as Record<string, unknown> : {}
  const shelfLocation = typeof body.shelfLocation === 'string' ? body.shelfLocation.trim() : undefined
  const conditionStatus = typeof body.conditionStatus === 'string' ? body.conditionStatus.trim() : undefined
  const availabilityStatus = typeof body.availabilityStatus === 'string' ? body.availabilityStatus.trim() : undefined
  if (shelfLocation === undefined && conditionStatus === undefined && availabilityStatus === undefined) {
    throw new HttpError(422, 'PHYSICAL_COPY_UPDATE_EMPTY', 'Provide a shelf location, condition, or availability status to update.')
  }
  if (shelfLocation !== undefined && (!shelfLocation || shelfLocation.length > 100)) throw new HttpError(422, 'SHELF_LOCATION_INVALID', 'Shelf location is required and must not exceed 100 characters.')
  if (conditionStatus !== undefined && !COPY_CONDITIONS.has(conditionStatus)) throw new HttpError(422, 'COPY_CONDITION_INVALID', 'Condition is not supported.')
  if (availabilityStatus !== undefined && !COPY_AVAILABILITY.has(availabilityStatus)) throw new HttpError(422, 'COPY_AVAILABILITY_INVALID', 'Availability is not supported.')

  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const [copyRows] = await connection.execute<RowDataPacket[]>(
      `SELECT physical_copy_id, material_id, lifecycle_status, availability_status
         FROM physical_copies WHERE physical_copy_id = ? LIMIT 1 FOR UPDATE`, [copyId],
    )
    const copy = copyRows[0]
    if (!copy) throw new HttpError(404, 'PHYSICAL_COPY_NOT_FOUND', 'The requested physical copy does not exist.')
    if (copy.lifecycle_status !== 'Active') throw new HttpError(422, 'PHYSICAL_COPY_ARCHIVED', 'Restore the physical copy before editing it.')

    if (availabilityStatus !== undefined && availabilityStatus !== copy.availability_status) {
      const [loans] = await connection.execute<RowDataPacket[]>(
        `SELECT transaction_id, transaction_status FROM borrow_transactions
          WHERE material_id = COALESCE(?, ?) AND transaction_status IN ('Borrowed', 'Overdue')
          LIMIT 1 FOR UPDATE`, [copy.material_id, copy.physical_copy_id],
      )
      if (loans[0]) throw new HttpError(422, 'PHYSICAL_COPY_HAS_ACTIVE_LOAN', 'Availability cannot be changed while this copy is borrowed or overdue.')
    }

    const assignments: string[] = []
    const parameters: Array<string | number> = []
    if (shelfLocation !== undefined) { assignments.push('shelf_location = ?'); parameters.push(shelfLocation) }
    if (conditionStatus !== undefined) { assignments.push('condition_status = ?'); parameters.push(conditionStatus) }
    if (availabilityStatus !== undefined) { assignments.push('availability_status = ?'); parameters.push(availabilityStatus) }
    parameters.push(copyId)
    await connection.execute(
      `UPDATE physical_copies SET ${assignments.join(', ')}, row_version = row_version + 1, updated_at = NOW()
        WHERE physical_copy_id = ?`, parameters,
    )
    await connection.commit()
    return { physicalCopyId: copyId, updated: true }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}
