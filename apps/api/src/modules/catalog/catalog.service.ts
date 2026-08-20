import type { Pool } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import {
  buildBookSearchText,
  buildThesisSearchText,
  ensureCategoryExists,
  findBookTitleByIsbnForUpdate,
  findDuplicatePhysicalCopyForUpdate,
  findDuplicateResearchInventoryForUpdate,
  findResearchCodeForUpdate,
  insertAuthors,
  insertPhysicalCopy,
  insertResearchRecord,
  insertResearchInventory,
  insertTitle,
} from './catalog.repository.ts'
import { validateBookEntry, validateThesisEntry } from './catalog.validation.ts'

function validationError(errors: Record<string, string>) {
  return new HttpError(422, 'CATALOG_VALIDATION_FAILED', 'The catalog entry contains invalid fields.', { errors })
}

function isDuplicateEntry(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY'
}

export function createCatalogService(database: Pool = db) {
  return {
    async createBookEntry(body: unknown) {
      const validation = validateBookEntry(body)
      if (!validation.isValid) throw validationError(validation.errors)
      const input = validation.data
      const connection = await database.getConnection()

      try {
        await connection.beginTransaction()

        if (!await ensureCategoryExists(connection, input.categoryId)) {
          throw new HttpError(422, 'CATEGORY_NOT_FOUND', 'The selected category does not exist.', {
            categoryId: input.categoryId,
          })
        }

        const duplicateCopy = await findDuplicatePhysicalCopyForUpdate(connection, input.copy)
        if (duplicateCopy) {
          throw new HttpError(409, 'PHYSICAL_COPY_ALREADY_EXISTS', 'The barcode or accession number is already assigned to another copy.', {
            physicalCopyId: duplicateCopy.physical_copy_id,
            barcode: duplicateCopy.barcode,
            accessionNumber: duplicateCopy.accession_number,
          })
        }

        const existingTitle = await findBookTitleByIsbnForUpdate(connection, input.isbn)
        const createdTitle = !existingTitle
        const titleId = existingTitle?.title_id ?? await insertTitle(connection, {
          categoryId: input.categoryId,
          recordType: 'Book',
          title: input.title,
          isbn: input.isbn,
          publicationYear: input.publicationYear,
          publisher: input.publisher,
          callNumber: input.callNumber,
          searchText: buildBookSearchText(input),
        })

        if (createdTitle) await insertAuthors(connection, titleId, input.authors)
        const physicalCopyId = await insertPhysicalCopy(connection, titleId, input.copy)

        await connection.commit()
        return { titleId, physicalCopyId, createdTitle, addedCopyToExistingTitle: !createdTitle }
      } catch (error) {
        await connection.rollback()
        if (isDuplicateEntry(error)) {
          throw new HttpError(409, 'PHYSICAL_COPY_ALREADY_EXISTS', 'The ISBN, barcode, or accession number was registered by another request.')
        }
        throw error
      } finally {
        connection.release()
      }
    },

    async createThesisEntry(body: unknown) {
      const validation = validateThesisEntry(body)
      if (!validation.isValid) throw validationError(validation.errors)
      const input = validation.data
      const connection = await database.getConnection()

      try {
        await connection.beginTransaction()

        if (!await ensureCategoryExists(connection, input.categoryId)) {
          throw new HttpError(422, 'CATEGORY_NOT_FOUND', 'The selected category does not exist.', {
            categoryId: input.categoryId,
          })
        }

        const existingResearch = await findResearchCodeForUpdate(connection, input.researchCode)
        if (existingResearch) {
          throw new HttpError(409, 'RESEARCH_CODE_ALREADY_EXISTS', 'The research code is already assigned to another thesis.', {
            researchCode: input.researchCode,
            researchRecordId: existingResearch.research_record_id,
          })
        }

        const duplicateCopy = await findDuplicatePhysicalCopyForUpdate(connection, input.copy)
        const duplicateResearchCopy = await findDuplicateResearchInventoryForUpdate(connection, input.copy)
        if (duplicateCopy || duplicateResearchCopy) {
          throw new HttpError(409, 'ACCESSION_ALREADY_EXISTS', 'The barcode or accession number is already assigned to another physical asset.', {
            physicalCopyId: duplicateCopy?.physical_copy_id ?? null,
            researchInventoryId: duplicateResearchCopy?.research_inventory_id ?? null,
            barcode: duplicateCopy?.barcode ?? duplicateResearchCopy?.barcode,
            accessionNumber: duplicateCopy?.accession_number ?? duplicateResearchCopy?.accession_number,
          })
        }

        const titleId = await insertTitle(connection, {
          categoryId: input.categoryId,
          recordType: 'Research/Thesis',
          title: input.title,
          isbn: null,
          publicationYear: input.year,
          publisher: null,
          callNumber: null,
          searchText: buildThesisSearchText(input),
        })
        await insertAuthors(connection, titleId, input.authors)
        const researchRecordId = await insertResearchRecord(connection, titleId, input)
        const researchInventoryId = await insertResearchInventory(connection, {
          ...input,
          copy: input.copy,
        })

        await connection.commit()
        return { titleId, researchRecordId, researchInventoryId }
      } catch (error) {
        await connection.rollback()
        if (isDuplicateEntry(error)) {
          throw new HttpError(409, 'ACCESSION_ALREADY_EXISTS', 'The research code, barcode, or accession number was registered by another request.')
        }
        throw error
      } finally {
        connection.release()
      }
    },
  }
}

export const catalogService = createCatalogService()
