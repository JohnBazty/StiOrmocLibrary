import { assertShelfCapacity, lockShelfCapacity } from '../catalog/shelf-capacity.service.ts'
import { HttpError } from '../../core/http-error.ts'
import type { PhysicalCopyMutationTransaction } from './physical-copy-mutation.middleware.ts'
import type { Pool, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import type { InventoryRequestActor } from './inventory-actor.ts'

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
  actor: InventoryRequestActor,
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

  if (copy.material_id !== null) {
    await connection.execute(
      "UPDATE materials SET availability_status = 'Unavailable', updated_at = NOW() WHERE material_id = ?",
      [copy.material_id],
    )
  }
  await connection.execute(
    `INSERT INTO inventory_audit_events
      (physical_copy_id, barcode_snapshot, event_type, previous_availability, new_availability,
       action_reason, verified_by_user_id, verified_by_label)
     VALUES (?, ?, 'Archived', ?, 'Archived', ?, ?, ?)`,
    [copy.physical_copy_id, copy.barcode, copy.availability_status, reason, actor.userId, actor.label],
  )

  return {
    physicalCopyId: copy.physical_copy_id,
    accessionNumber: copy.accession_number,
    lifecycleStatus: 'Archived',
    reason,
  }
}

export async function deletePhysicalCopy(
  transaction: PhysicalCopyMutationTransaction,
  actor: InventoryRequestActor,
) {
  const { copy, connection } = transaction

  if (copy.condition_status !== 'Lost') {
    throw new HttpError(
      422,
      'PHYSICAL_COPY_NOT_LOST',
      `Copy ${copy.accession_number} must be marked Lost before it can be removed from inventory.`,
      {
        physicalCopyId: copy.physical_copy_id,
        accessionNumber: copy.accession_number,
        conditionStatus: copy.condition_status,
      },
    )
  }

  const [historyRows] = await connection.execute(
    `SELECT transaction_id
       FROM borrow_transactions
      WHERE material_id = ?
      LIMIT 1
      FOR UPDATE`,
    [copy.circulation_material_id],
  )

  const [reservationRows] = await connection.execute(
    `SELECT reservation_id FROM reservations
      WHERE accession_id = ? OR material_id = ? LIMIT 1 FOR UPDATE`,
    [copy.circulation_material_id, copy.circulation_material_id],
  )
  const [auditRows] = await connection.execute(
    `SELECT inventory_audit_event_id FROM inventory_audit_events
      WHERE physical_copy_id = ? LIMIT 1 FOR UPDATE`,
    [copy.physical_copy_id],
  )

  if (
    (Array.isArray(historyRows) && historyRows.length > 0)
    || (Array.isArray(reservationRows) && reservationRows.length > 0)
    || (Array.isArray(auditRows) && auditRows.length > 0)
  ) {
    throw new HttpError(
      422,
      'PHYSICAL_COPY_REQUIRES_ARCHIVE',
      `Copy ${copy.accession_number} has inventory or circulation history and must be archived instead of deleted.`,
      {
        physicalCopyId: copy.physical_copy_id,
        materialId: copy.material_id,
        accessionNumber: copy.accession_number,
        canArchive: true,
      },
    )
  }

  await connection.execute(
    `INSERT INTO inventory_audit_events
      (physical_copy_id, barcode_snapshot, event_type, previous_availability, new_availability,
       action_reason, verified_by_user_id, verified_by_label)
     VALUES (?, ?, 'Deleted', ?, NULL, 'Permanent deletion of never-used inventory row', ?, ?)`,
    [copy.physical_copy_id, copy.barcode, copy.availability_status, actor.userId, actor.label],
  )

  await connection.execute(
    'DELETE FROM physical_copies WHERE physical_copy_id = ?',
    [copy.physical_copy_id],
  )
  if (copy.material_id !== null) {
    await connection.execute('DELETE FROM materials WHERE material_id = ?', [copy.material_id])
  }

  return {
    physicalCopyId: copy.physical_copy_id,
    accessionNumber: copy.accession_number,
    deleted: true,
  }
}

/** Updates shelf metadata. Condition and availability use audited endpoints. */
export async function updatePhysicalCopy(database: Pool = db, copyIdValue: unknown, bodyValue: unknown) {
  const copyId = Number(copyIdValue)
  if (!Number.isSafeInteger(copyId) || copyId < 1) throw new HttpError(422, 'INVALID_PHYSICAL_COPY_ID', 'Physical copy ID must be a positive integer.')
  const body = bodyValue && typeof bodyValue === 'object' ? bodyValue as Record<string, unknown> : {}
  const shelfLocation = typeof body.shelfLocation === 'string' ? body.shelfLocation.trim() : undefined
  const conditionStatus = typeof body.conditionStatus === 'string' ? body.conditionStatus.trim() : undefined
  const availabilityStatus = typeof body.availabilityStatus === 'string' ? body.availabilityStatus.trim() : undefined
  if (conditionStatus !== undefined || availabilityStatus !== undefined) {
    throw new HttpError(
      422,
      'AUDITED_INVENTORY_MUTATION_REQUIRED',
      'Use /api/inventory/copies/condition or /api/inventory/copies/availability for audited state changes.',
    )
  }
  if (shelfLocation === undefined && body.locationId === undefined) {
    throw new HttpError(422, 'PHYSICAL_COPY_UPDATE_EMPTY', 'Provide a shelf location to update.')
  }
  if (shelfLocation !== undefined && (!shelfLocation || shelfLocation.length > 100)) throw new HttpError(422, 'SHELF_LOCATION_INVALID', 'Shelf location is required and must not exceed 100 characters.')

  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    await lockShelfCapacity(connection)
    const [copyRows] = await connection.execute<RowDataPacket[]>(
      `SELECT pc.physical_copy_id, pc.material_id, pc.title_id, pc.shelf_location, pc.shelf_column, pc.shelf_row, pc.lifecycle_status, pc.availability_status,t.lifecycle_status AS title_lifecycle_status
         FROM physical_copies pc JOIN titles t ON t.title_id=pc.title_id WHERE pc.physical_copy_id = ? LIMIT 1 FOR UPDATE OF pc,t`, [copyId],
    )
    const copy = copyRows[0]
    if (!copy) throw new HttpError(404, 'PHYSICAL_COPY_NOT_FOUND', 'The requested physical copy does not exist.')
    if (copy.lifecycle_status !== 'Active' || copy.title_lifecycle_status !== 'Active') throw new HttpError(422, 'PHYSICAL_COPY_ARCHIVED', 'Restore the physical copy before editing it.')

    const placement = await assertShelfCapacity(connection, {
      locationId: body.locationId, shelfLocation,
      shelfColumn: body.shelfColumn ?? (shelfLocation === copy.shelf_location ? copy.shelf_column : 1),
      shelfRow: body.shelfRow ?? (shelfLocation === copy.shelf_location ? copy.shelf_row : 1),
    }, 1, { bookCopyIds: [copyId] })
    await connection.execute(
      `UPDATE physical_copies SET shelf_location = ?, shelf_column = ?, shelf_row = ?, row_version = row_version + 1, updated_at = NOW()
        WHERE physical_copy_id = ?`, [placement.shelfLocation, placement.shelfColumn, placement.shelfRow, copyId],
    )
    if (copy.material_id !== null) await connection.execute('UPDATE materials SET shelf_location = ?, updated_at = NOW() WHERE material_id = ?', [placement.shelfLocation, copy.material_id])
    await connection.commit()
    return { physicalCopyId: copyId, updated: true }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}
