import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import type { InventoryActor } from './inventory.repository.ts'
import {
  cancelLostThesisReservations, findActiveThesisReservation, findOpenThesisLoan, getThesisInventorySummary,
  listThesisInventory, lockThesisCirculationMaterial, lockThesisInventory, lockThesisInventoryById,
  recordThesisInventoryAudit, synchronizeThesisCirculationAvailability, type LockedThesisInventory,
} from './thesis-inventory.repository.ts'
import type { ThesisAvailability, ThesisCondition, ThesisInventoryFilters } from './thesis-inventory.validation.ts'

export const thesisInventorySummary = (database: Pool = db) => getThesisInventorySummary(database)
export const thesisInventoryRows = (filters: ThesisInventoryFilters, database: Pool = db) => listThesisInventory(database, filters)
export const visibleThesisInventoryRows = (filters: ThesisInventoryFilters, database: Pool = db) =>
  listThesisInventory(database, { ...filters, availabilityStatus: 'available' })

function requireThesis<T>(value: T | null): T {
  if (!value) throw new HttpError(404, 'THESIS_INVENTORY_NOT_FOUND', 'No research or thesis copy matches this barcode.')
  return value
}

function requireActiveThesis<T extends { lifecycle_status: string }>(value: T | null): T {
  const thesis = requireThesis(value)
  if (thesis.lifecycle_status !== 'Active') {
    throw new HttpError(422, 'THESIS_INVENTORY_ARCHIVED', 'This research or thesis copy is already archived.')
  }
  return thesis
}

function positiveResearchInventoryId(value: unknown) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new HttpError(422, 'INVALID_RESEARCH_INVENTORY_ID', 'Research inventory ID must be a positive integer.')
  }
  return parsed
}

function archiveReason(value: unknown) {
  const reason = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!reason) throw new HttpError(422, 'ARCHIVE_REASON_REQUIRED', 'Provide a reason for archiving this research or thesis copy.')
  if (reason.length > 255) throw new HttpError(422, 'ARCHIVE_REASON_TOO_LONG', 'Archive reason must not exceed 255 characters.')
  return reason
}

function activeLoanError(loan: Record<string, unknown>) {
  return new HttpError(422, 'THESIS_HAS_ACTIVE_LOAN', 'This thesis cannot be changed or removed while its copy is borrowed or overdue.', {
    transactionId: loan.transaction_id,
    transactionStatus: loan.transaction_status,
    userId: loan.user_id,
  })
}

export async function auditThesisCondition(
  barcode: string,
  conditionState: ThesisCondition,
  actor: InventoryActor,
  database: Pool = db,
) {
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const thesis = requireActiveThesis(await lockThesisInventory(connection, barcode))
    const circulation = await lockThesisCirculationMaterial(connection, thesis.barcode)
    const materialId = circulation ? Number(circulation.material_id) : null
    const loan = materialId === null ? null : await findOpenThesisLoan(connection, materialId)
    if (loan) throw activeLoanError(loan)

    const isLost = conditionState === 'lost'
    const nextAvailability = isLost ? 'unavailable' : thesis.availability_status
    await connection.execute(`
      UPDATE research_inventory
         SET condition_state = ?, availability_status = ?, last_audited_at = NOW(),
             row_version = row_version + 1, updated_at = NOW()
       WHERE research_inventory_id = ?`, [conditionState, nextAvailability, thesis.research_inventory_id])
    let cancelledReservations = 0
    if (isLost) {
      await synchronizeThesisCirculationAvailability(connection, materialId, 'unavailable')
      cancelledReservations = await cancelLostThesisReservations(connection, materialId)
    }
    await recordThesisInventoryAudit(
      connection, thesis, isLost ? 'lost_override' : 'condition_changed', actor, conditionState, nextAvailability,
    )
    await connection.commit()
    return {
      research_inventory_id: thesis.research_inventory_id,
      item_title: thesis.title,
      accession_number: thesis.accession_number,
      barcode: thesis.barcode,
      condition_state: conditionState,
      availability_status: nextAvailability,
      availability_preserved: !isLost,
      student_catalog_visible: nextAvailability === 'available',
      cancelled_reservations: cancelledReservations,
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}

export async function setThesisAvailability(
  barcode: string,
  availabilityStatus: ThesisAvailability,
  actor: InventoryActor,
  database: Pool = db,
) {
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const thesis = requireActiveThesis(await lockThesisInventory(connection, barcode))
    const circulation = await lockThesisCirculationMaterial(connection, thesis.barcode)
    const materialId = circulation ? Number(circulation.material_id) : null
    const loan = materialId === null ? null : await findOpenThesisLoan(connection, materialId)
    if (loan) throw activeLoanError(loan)
    if (thesis.condition_state === 'lost' && availabilityStatus === 'available') {
      throw new HttpError(422, 'LOST_THESIS_MUST_REMAIN_UNAVAILABLE', 'A lost thesis cannot be made available. Change its condition first, then update availability manually.')
    }
    if (thesis.availability_status === 'borrowed' || thesis.availability_status === 'reserved') {
      throw new HttpError(422, 'THESIS_AVAILABILITY_LOCKED', 'Borrowed or reserved thesis availability is controlled by circulation.')
    }
    const reservation = materialId === null ? null : await findActiveThesisReservation(connection, materialId)
    if (reservation) {
      throw new HttpError(422, 'THESIS_HAS_ACTIVE_RESERVATION', 'Cancel the active thesis reservation before changing availability.', {
        reservationId: reservation.reservation_id,
        reservationStatus: reservation.reservation_status,
      })
    }

    await connection.execute(`
      UPDATE research_inventory
         SET availability_status = ?, row_version = row_version + 1, updated_at = NOW()
       WHERE research_inventory_id = ?`, [availabilityStatus, thesis.research_inventory_id])
    await synchronizeThesisCirculationAvailability(connection, materialId, availabilityStatus)
    await recordThesisInventoryAudit(
      connection, thesis, 'availability_changed', actor, thesis.condition_state, availabilityStatus,
    )
    await connection.commit()
    return {
      research_inventory_id: thesis.research_inventory_id,
      item_title: thesis.title,
      accession_number: thesis.accession_number,
      barcode: thesis.barcode,
      condition_state: thesis.condition_state,
      availability_status: availabilityStatus,
      student_catalog_visible: availabilityStatus === 'available',
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}

async function assertThesisNotActivelyAllocated(connection: PoolConnection, thesis: LockedThesisInventory) {
  const circulation = await lockThesisCirculationMaterial(connection, thesis.barcode)
  const materialId = circulation ? Number(circulation.material_id) : null
  const loan = materialId === null ? null : await findOpenThesisLoan(connection, materialId)
  if (loan) throw activeLoanError(loan)
  const reservation = materialId === null ? null : await findActiveThesisReservation(connection, materialId)
  if (reservation) {
    throw new HttpError(422, 'THESIS_HAS_ACTIVE_RESERVATION', 'Cancel or reassign the active thesis reservation before removing this record.', {
      reservationId: reservation.reservation_id,
      reservationStatus: reservation.reservation_status,
    })
  }
  return materialId
}

export async function archiveThesisInventory(
  researchInventoryIdValue: unknown,
  reasonValue: unknown,
  actor: InventoryActor,
  database: Pool = db,
) {
  const researchInventoryId = positiveResearchInventoryId(researchInventoryIdValue)
  const reason = archiveReason(reasonValue)
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const thesis = requireActiveThesis(await lockThesisInventoryById(connection, researchInventoryId))
    const materialId = await assertThesisNotActivelyAllocated(connection, thesis)
    await connection.execute(`
      UPDATE research_inventory
         SET lifecycle_status = 'Archived', availability_status = 'unavailable', archived_at = NOW(),
             archive_reason = ?, archived_by_user_id = ?, row_version = row_version + 1, updated_at = NOW()
       WHERE research_inventory_id = ?`, [reason, actor.userId, researchInventoryId])
    await synchronizeThesisCirculationAvailability(connection, materialId, 'unavailable')
    await recordThesisInventoryAudit(connection, thesis, 'archived', actor, thesis.condition_state, 'unavailable', reason)
    await connection.commit()
    return {
      research_inventory_id: researchInventoryId,
      accession_number: thesis.accession_number,
      lifecycle_status: 'Archived',
      reason,
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}

export async function deleteThesisInventory(
  researchInventoryIdValue: unknown,
  actor: InventoryActor,
  database: Pool = db,
) {
  const researchInventoryId = positiveResearchInventoryId(researchInventoryIdValue)
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const thesis = requireActiveThesis(await lockThesisInventoryById(connection, researchInventoryId))
    const materialId = await assertThesisNotActivelyAllocated(connection, thesis)
    if (thesis.condition_state !== 'lost') {
      throw new HttpError(
        422,
        'THESIS_NOT_LOST',
        `Research copy ${thesis.accession_number} must be marked Lost before it can be removed from inventory.`,
        { researchInventoryId, accessionNumber: thesis.accession_number, conditionState: thesis.condition_state },
      )
    }
    const [auditRows] = await connection.execute<RowDataPacket[]>(`
      SELECT research_inventory_audit_event_id FROM research_inventory_audit_events
       WHERE research_inventory_id = ? LIMIT 1 FOR UPDATE`, [researchInventoryId])
    let hasCirculationHistory = false
    if (materialId !== null) {
      const [loanRows] = await connection.execute<RowDataPacket[]>(
        'SELECT transaction_id FROM borrow_transactions WHERE material_id = ? LIMIT 1 FOR UPDATE', [materialId],
      )
      const [reservationRows] = await connection.execute<RowDataPacket[]>(
        'SELECT reservation_id FROM reservations WHERE material_id = ? OR accession_id = ? LIMIT 1 FOR UPDATE',
        [materialId, materialId],
      )
      hasCirculationHistory = loanRows.length > 0 || reservationRows.length > 0
    }
    if (auditRows.length > 0 || hasCirculationHistory) {
      throw new HttpError(
        422,
        'THESIS_REQUIRES_ARCHIVE',
        `Research copy ${thesis.accession_number} has inventory or circulation history and must be archived instead of deleted.`,
        { researchInventoryId, accessionNumber: thesis.accession_number, canArchive: true },
      )
    }
    await recordThesisInventoryAudit(
      connection, thesis, 'deleted', actor, thesis.condition_state, thesis.availability_status,
      'Permanent deletion of never-used inventory row',
    )
    await connection.execute('DELETE FROM research_inventory WHERE research_inventory_id = ?', [researchInventoryId])
    if (materialId !== null) await connection.execute('DELETE FROM materials WHERE material_id = ?', [materialId])
    await connection.commit()
    return { research_inventory_id: researchInventoryId, accession_number: thesis.accession_number, deleted: true }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}
