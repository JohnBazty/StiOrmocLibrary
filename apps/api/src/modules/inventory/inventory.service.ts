import type { Pool } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import {
  findActiveLoan, findActiveReservation, getInventorySummary, listInventoryCopies,
  lockInventoryCopy, recordInventoryAudit, releaseLostCopyReservations,
  synchronizeLegacyAvailability, type InventoryActor,
} from './inventory.repository.ts'
import type { InventoryCondition, InventoryListFilters, ManualAvailability } from './inventory.validation.ts'

export const inventorySummary = (database: Pool = db) => getInventorySummary(database)
export const inventoryCopies = (filters: InventoryListFilters, database: Pool = db) => listInventoryCopies(database, filters)

function ensureActive(copy: Awaited<ReturnType<typeof lockInventoryCopy>>) {
  if (!copy) throw new HttpError(404, 'INVENTORY_COPY_NOT_FOUND', 'No physical copy matches this barcode.')
  if (copy.lifecycle_status !== 'Active') {
    throw new HttpError(422, 'INVENTORY_COPY_ARCHIVED', 'Restore this physical copy before auditing it.')
  }
  return copy
}

export async function verifyInventoryBarcode(barcode: string, actor: InventoryActor, database: Pool = db) {
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const copy = ensureActive(await lockInventoryCopy(connection, barcode))
    await connection.execute(
      'UPDATE physical_copies SET last_scanned_at = NOW(), row_version = row_version + 1, updated_at = NOW() WHERE physical_copy_id = ?',
      [copy.physical_copy_id],
    )
    await recordInventoryAudit(connection, copy, 'Verified', actor)
    await connection.commit()
    return {
      physical_copy_id: copy.physical_copy_id,
      item_title: copy.title,
      accession_number: copy.accession_number,
      barcode: copy.barcode,
      condition_status: copy.condition_status,
      availability_status: copy.availability_status,
      last_verified_at: new Date(),
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}

export async function overrideInventoryCondition(
  barcode: string,
  conditionState: InventoryCondition,
  actor: InventoryActor,
  database: Pool = db,
) {
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const copy = ensureActive(await lockInventoryCopy(connection, barcode))
    const isLost = conditionState === 'Lost'
    const nextAvailability = isLost ? 'Unavailable' : copy.availability_status
    await connection.execute(`
      UPDATE physical_copies
         SET condition_status = ?, availability_status = ?, last_scanned_at = NOW(),
             row_version = row_version + 1, updated_at = NOW()
       WHERE physical_copy_id = ?`, [conditionState, nextAvailability, copy.physical_copy_id])

    let releasedReservations = 0
    if (isLost) {
      await synchronizeLegacyAvailability(connection, copy.material_id, 'Unavailable')
      releasedReservations = await releaseLostCopyReservations(connection, copy.physical_copy_id)
    }
    await recordInventoryAudit(
      connection,
      copy,
      isLost ? 'Lost Override' : 'Condition Changed',
      actor,
      conditionState,
      nextAvailability,
    )
    await connection.commit()
    return {
      physical_copy_id: copy.physical_copy_id,
      item_title: copy.title,
      accession_number: copy.accession_number,
      barcode: copy.barcode,
      condition_status: conditionState,
      availability_status: nextAvailability,
      availability_preserved: !isLost,
      reservations_blocked: isLost,
      released_reservations: releasedReservations,
      last_verified_at: new Date(),
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}

export async function setInventoryAvailability(
  barcode: string,
  availabilityStatus: ManualAvailability,
  actor: InventoryActor,
  database: Pool = db,
) {
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const copy = ensureActive(await lockInventoryCopy(connection, barcode))
    if (copy.condition_status === 'Lost' && availabilityStatus === 'Available') {
      throw new HttpError(422, 'LOST_COPY_MUST_REMAIN_UNAVAILABLE', 'A lost copy cannot be made available. Change its condition first, then set availability manually.')
    }

    const loan = await findActiveLoan(connection, copy.circulation_material_id)
    if (loan || copy.availability_status === 'Borrowed') {
      throw new HttpError(422, 'PHYSICAL_COPY_HAS_ACTIVE_LOAN', 'Availability cannot be changed while this copy is borrowed or overdue.', {
        transactionId: loan?.transaction_id ?? null,
        transactionStatus: loan?.transaction_status ?? copy.availability_status,
      })
    }
    const reservation = await findActiveReservation(connection, copy.physical_copy_id)
    if (reservation || copy.availability_status === 'Reserved') {
      throw new HttpError(422, 'PHYSICAL_COPY_HAS_ACTIVE_RESERVATION', 'Cancel or reassign the active reservation before changing availability.', {
        reservationId: reservation?.reservation_id ?? null,
        reservationStatus: reservation?.reservation_status ?? copy.availability_status,
      })
    }

    await connection.execute(`
      UPDATE physical_copies
         SET availability_status = ?, row_version = row_version + 1, updated_at = NOW()
       WHERE physical_copy_id = ?`, [availabilityStatus, copy.physical_copy_id])
    await synchronizeLegacyAvailability(connection, copy.material_id, availabilityStatus)
    await recordInventoryAudit(connection, copy, 'Availability Changed', actor, copy.condition_status, availabilityStatus)
    await connection.commit()
    return {
      physical_copy_id: copy.physical_copy_id,
      item_title: copy.title,
      accession_number: copy.accession_number,
      barcode: copy.barcode,
      condition_status: copy.condition_status,
      availability_status: availabilityStatus,
      reservations_blocked: availabilityStatus === 'Unavailable',
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}
