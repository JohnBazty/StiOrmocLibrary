import type { Pool } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { isValidIsbn, normalizeIsbn, validateBookMetadata, validateThesisMetadata } from './catalog.validation.ts'
import { ensureCategoryExists, findBookTitleByIsbnForUpdate, findResearchCodeForUpdate } from './catalog.repository.ts'
import {
  countPhysicalCopies,
  findRegistryMatch,
  hasActiveTitleLoan,
  hasActiveTitleReservation,
  listCategories,
  listPhysicalCopies,
  lockTitle,
  lockCategoryWithManagedShelf,
  moveTitleToCategory,
  setTitleArchived,
  updateBookMetadata,
  updateThesisMetadata,
} from './catalog-management.repository.ts'
import { recordCategoryShelfEvent } from './categories/category.repository.ts'

function positiveId(value: unknown, field = 'titleId') {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new HttpError(422, 'INVALID_CATALOG_ID', `${field} must be a positive integer.`)
  }
  return parsed
}

function archiveReason(value: unknown) {
  const reason = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!reason) throw new HttpError(422, 'ARCHIVE_REASON_REQUIRED', 'An archive reason is required.')
  if (reason.length > 255) throw new HttpError(422, 'ARCHIVE_REASON_TOO_LONG', 'Archive reason must not exceed 255 characters.')
  return reason
}

function validationError(errors: Record<string, string>) {
  return new HttpError(422, 'CATALOG_VALIDATION_FAILED', 'The catalog entry contains invalid fields.', { errors })
}

function categoryAssignmentInput(body: unknown) {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  return {
    targetCategoryId: positiveId(input.targetCategoryId, 'targetCategoryId'),
    expectedRowVersion: (() => {
      const value = Number(input.expectedRowVersion)
      if (!Number.isSafeInteger(value) || value < 1) {
        throw new HttpError(422, 'ROW_VERSION_REQUIRED', 'Reload the catalog and try again.')
      }
      return value
    })(),
  }
}

export function createCatalogManagementService(database: Pool = db) {
  async function inTransaction<T>(operation: (connection: Awaited<ReturnType<Pool['getConnection']>>) => Promise<T>) {
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      const result = await operation(connection)
      await connection.commit()
      return result
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  return {
    categories: () => listCategories(database),
    physicalCopies: (limit?: number) => listPhysicalCopies(database, limit),

    async changeTitleCategory(titleIdValue: unknown, body: unknown, actorAccountId: number | null) {
      const titleId = positiveId(titleIdValue)
      const input = categoryAssignmentInput(body)
      return inTransaction(async (connection) => {
        const title = await lockTitle(connection, titleId)
        if (!title || title.lifecycle_status !== 'Active') {
          throw new HttpError(404, 'CATALOG_TITLE_NOT_FOUND', 'The active catalog title no longer exists.')
        }
        if (Number(title.row_version) !== input.expectedRowVersion) {
          throw new HttpError(409, 'CATALOG_TITLE_CHANGED', 'This title changed after the table was loaded. Reload the catalog and try again.')
        }
        if (Number(title.category_id) === input.targetCategoryId) {
          throw new HttpError(422, 'CATEGORY_UNCHANGED', 'Select a different category.')
        }
        const target = await lockCategoryWithManagedShelf(connection, input.targetCategoryId)
        if (!target) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'The selected category no longer exists.')
        if (!target.shelf_id) {
          throw new HttpError(422, 'CATEGORY_SHELF_NOT_MANAGED', 'The selected category must use a shelf managed in Category Management.')
        }
        if (Number(target.shelf_column) > Number(target.column_count) || Number(target.shelf_row) > Number(target.row_count)) {
          throw new HttpError(422, 'CATEGORY_SHELF_POSITION_INVALID', 'The category position is outside the selected shelf grid. Edit the category location and try again.')
        }
        const affected = await moveTitleToCategory(connection, title, target)
        await recordCategoryShelfEvent(connection, actorAccountId, 'Title category changed', {
          titleId,
          title: title.title,
          recordType: title.record_type,
          fromCategoryId: title.category_id,
          fromCategoryName: title.category_name,
          fromShelf: title.category_shelf_location,
          toCategoryId: Number(target.category_id),
          toCategoryName: target.category_name,
          toShelf: target.shelf_location,
          affected,
        })
        return {
          titleId,
          recordType: title.record_type,
          categoryId: Number(target.category_id),
          categoryName: String(target.category_name),
          shelfLocation: String(target.shelf_location),
          shelfColumn: Number(target.shelf_column),
          shelfRow: Number(target.shelf_row),
          rowVersion: Number(title.row_version) + 1,
          ...affected,
        }
      })
    },

    async parseRegistry(body: unknown) {
      const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
      const raw = typeof input.value === 'string' ? input.value.trim() : ''
      if (!raw || raw.length > 100) {
        throw new HttpError(422, 'REGISTRY_VALUE_INVALID', 'Provide an ISBN, barcode, or accession number up to 100 characters.')
      }
      const requestedMode = input.mode === 'isbn' || input.mode === 'barcode' ? input.mode : 'auto'
      const isbn = normalizeIsbn(raw)
      const looksLikeIsbn = /^\d{9}[\dX]$|^\d{13}$/.test(isbn)
      const kind: 'ISBN' | 'Barcode' = requestedMode === 'isbn' || (requestedMode === 'auto' && looksLikeIsbn) ? 'ISBN' : 'Barcode'
      if (kind === 'ISBN' && !isValidIsbn(isbn)) {
        throw new HttpError(422, 'INVALID_ISBN', 'The scanned value is not a valid ISBN-10 or ISBN-13.')
      }
      const normalizedValue = kind === 'ISBN' ? isbn : raw.toUpperCase()
      return { kind, normalizedValue, valid: true, match: await findRegistryMatch(database, kind, normalizedValue) }
    },

    async updateBook(titleIdValue: unknown, body: unknown) {
      const titleId = positiveId(titleIdValue)
      const validation = validateBookMetadata(body)
      if (!validation.isValid) throw validationError(validation.errors)
      const input = validation.data
      return inTransaction(async (connection) => {
        const title = await lockTitle(connection, titleId)
        if (!title || title.record_type !== 'Book') throw new HttpError(404, 'BOOK_NOT_FOUND', 'The requested book does not exist.')
        if (!await ensureCategoryExists(connection, input.categoryId)) throw new HttpError(422, 'CATEGORY_NOT_FOUND', 'The selected category does not exist.')
        const isbnOwner = await findBookTitleByIsbnForUpdate(connection, input.isbn)
        if (isbnOwner && Number(isbnOwner.title_id) !== titleId) throw new HttpError(409, 'ISBN_ALREADY_EXISTS', 'The ISBN belongs to another book title.')
        await updateBookMetadata(connection, titleId, input)
        return { titleId, updated: true }
      })
    },

    async updateThesis(titleIdValue: unknown, body: unknown) {
      const titleId = positiveId(titleIdValue)
      const validation = validateThesisMetadata(body)
      if (!validation.isValid) throw validationError(validation.errors)
      const input = validation.data
      return inTransaction(async (connection) => {
        const title = await lockTitle(connection, titleId)
        if (!title || title.record_type !== 'Research/Thesis') throw new HttpError(404, 'THESIS_NOT_FOUND', 'The requested research/thesis record does not exist.')
        if (!await ensureCategoryExists(connection, input.categoryId)) throw new HttpError(422, 'CATEGORY_NOT_FOUND', 'The selected category does not exist.')
        const codeOwner = await findResearchCodeForUpdate(connection, input.researchCode)
        if (codeOwner && Number(codeOwner.title_id) !== titleId) throw new HttpError(409, 'RESEARCH_CODE_ALREADY_EXISTS', 'The research code belongs to another thesis.')
        await updateThesisMetadata(connection, titleId, input)
        return { titleId, updated: true }
      })
    },

    async archiveTitle(titleIdValue: unknown, expectedType: 'Book' | 'Research/Thesis', reasonValue: unknown, actorAccountId: number | null = null) {
      const titleId = positiveId(titleIdValue)
      const reason = archiveReason(reasonValue)
      return inTransaction(async (connection) => {
        const title = await lockTitle(connection, titleId)
        if (!title || title.record_type !== expectedType) throw new HttpError(404, expectedType === 'Book' ? 'BOOK_NOT_FOUND' : 'THESIS_NOT_FOUND', 'The requested catalog title does not exist.')
        if (title.lifecycle_status !== 'Active') throw new HttpError(409, 'CATALOG_ALREADY_ARCHIVED', 'This title is already archived.')
        const activeLoan = await hasActiveTitleLoan(connection, titleId)
        if (activeLoan) {
          throw new HttpError(422, 'PHYSICAL_COPY_HAS_ACTIVE_LOAN', `Cannot archive this title because copy ${activeLoan.accession_number} is currently ${String(activeLoan.transaction_status).toLowerCase()}.`, {
            titleId, physicalCopyId: activeLoan.physical_copy_id, transactionId: activeLoan.transaction_id,
          })
        }
        if (await hasActiveTitleReservation(connection, titleId)) {
          throw new HttpError(422, 'TITLE_HAS_ACTIVE_RESERVATION', 'Cancel or complete active reservations before archiving this title.')
        }
        await setTitleArchived(connection, titleId, reason, actorAccountId)
        return { titleId, lifecycleStatus: 'Archived', reason }
      })
    },

    async deleteTitle(titleIdValue: unknown, expectedType: 'Book' | 'Research/Thesis') {
      const titleId = positiveId(titleIdValue)
      return inTransaction(async (connection) => {
        const title = await lockTitle(connection, titleId)
        if (!title || title.record_type !== expectedType) throw new HttpError(404, expectedType === 'Book' ? 'BOOK_NOT_FOUND' : 'THESIS_NOT_FOUND', 'The requested catalog title does not exist.')
        const activeLoan = await hasActiveTitleLoan(connection, titleId)
        if (activeLoan) throw new HttpError(422, 'PHYSICAL_COPY_HAS_ACTIVE_LOAN', 'Cannot delete a title with a borrowed or overdue physical copy.')
        if (await countPhysicalCopies(connection, titleId)) {
          throw new HttpError(422, 'TITLE_HAS_PHYSICAL_COPIES', 'Archive or remove every physical copy before deleting this title.')
        }
        await connection.execute('DELETE FROM titles WHERE title_id = ?', [titleId])
        return { titleId, deleted: true }
      })
    },
  }
}

export const catalogManagementService = createCatalogManagementService()
