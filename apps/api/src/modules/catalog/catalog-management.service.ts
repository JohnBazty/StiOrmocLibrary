import type { Pool } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { isValidIsbn, normalizeIsbn, validateBookMetadata, validateThesisMetadata } from './catalog.validation.ts'
import { ensureCategoryExists, findBookTitleByIsbnForUpdate, findResearchCodeForUpdate } from './catalog.repository.ts'
import {
  countPhysicalCopies,
  findRegistryMatch,
  hasActiveTitleLoan,
  listCategories,
  listPhysicalCopies,
  lockTitle,
  setTitleArchived,
  updateBookMetadata,
  updateThesisMetadata,
} from './catalog-management.repository.ts'

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

    async archiveTitle(titleIdValue: unknown, expectedType: 'Book' | 'Research/Thesis', reasonValue: unknown) {
      const titleId = positiveId(titleIdValue)
      const reason = archiveReason(reasonValue)
      return inTransaction(async (connection) => {
        const title = await lockTitle(connection, titleId)
        if (!title || title.record_type !== expectedType) throw new HttpError(404, expectedType === 'Book' ? 'BOOK_NOT_FOUND' : 'THESIS_NOT_FOUND', 'The requested catalog title does not exist.')
        const activeLoan = await hasActiveTitleLoan(connection, titleId)
        if (activeLoan) {
          throw new HttpError(422, 'PHYSICAL_COPY_HAS_ACTIVE_LOAN', `Cannot archive this title because copy ${activeLoan.accession_number} is currently ${String(activeLoan.transaction_status).toLowerCase()}.`, {
            titleId, physicalCopyId: activeLoan.physical_copy_id, transactionId: activeLoan.transaction_id,
          })
        }
        await setTitleArchived(connection, titleId, reason)
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

