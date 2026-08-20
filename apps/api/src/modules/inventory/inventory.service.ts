import type { Pool } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import {
  findActiveLoan, findActiveReservation, getInventorySummary, listInventoryCopies,
  lockInventoryCopy, recordInventoryAudit, type InventoryActor,
} from './inventory.repository.ts'
import type { InventoryListFilters } from './inventory.validation.ts'

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
  conditionState: 'Damaged' | 'Lost',
  actor: InventoryActor,
  database: Pool = db,
) {
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const copy = ensureActive(await lockInventoryCopy(connection, barcode))
    const loan = await findActiveLoan(connection, copy.circulation_material_id)
    if (loan || copy.availability_status === 'Borrowed') {
      throw new HttpError(422, 'PHYSICAL_COPY_HAS_ACTIVE_LOAN', 'Condition cannot be overridden while this copy is borrowed or overdue.', {
        transactionId: loan?.transaction_id ?? null,
        transactionStatus: loan?.transaction_status ?? copy.availability_status,
      })
    }
    const reservation = await findActiveReservation(connection, copy.circulation_material_id)
    if (reservation || copy.availability_status === 'Reserved') {
      throw new HttpError(422, 'PHYSICAL_COPY_HAS_ACTIVE_RESERVATION', 'Cancel or reassign the active reservation before changing this copy condition.', {
        reservationId: reservation?.reservation_id ?? null,
        reservationStatus: reservation?.reservation_status ?? copy.availability_status,
      })
    }
    await connection.execute(`
      UPDATE physical_copies
         SET condition_status = ?, availability_status = 'Unavailable', last_scanned_at = NOW(),
             row_version = row_version + 1, updated_at = NOW()
       WHERE physical_copy_id = ?`, [conditionState, copy.physical_copy_id])
    await recordInventoryAudit(connection, copy, 'Condition Changed', actor, conditionState, 'Unavailable')
    await connection.commit()
    return {
      physical_copy_id: copy.physical_copy_id,
      item_title: copy.title,
      accession_number: copy.accession_number,
      barcode: copy.barcode,
      condition_status: conditionState,
      availability_status: 'Unavailable',
      reservations_blocked: true,
      last_verified_at: new Date(),
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}
