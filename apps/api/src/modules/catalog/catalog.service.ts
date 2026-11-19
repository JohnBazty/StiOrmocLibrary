import { requireResearchGroup, researchGroupLabel } from './research-groups.service.ts'
import { assertShelfCapacity, lockShelfCapacity } from './shelf-capacity.service.ts'
import type { Pool } from '../../config/db.js'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import {
  buildBookSearchText,
  buildThesisSearchText,
  ensureCategoryExists,
  findBookTitleByIsbnForUpdate,
  findDuplicatePhysicalCopyForUpdate,
  findLegacyBookMaterialForUpdate,
  findResearchCodeForUpdate,
  insertAuthors,
  insertLegacyBookMaterial,
  insertPhysicalCopy,
  insertResearchRecord,
  insertResearchInventory,
  insertTitle,
} from './catalog.repository.ts'
import { validateBookEntry, validateThesisEntry } from './catalog.validation.ts'
import { ensureBookLocationExists, lockCategoryShelf, reserveBarcodeSequence } from './bulk-book.repository.ts'
import { renderBookLabel } from './book-label.renderer.ts'
import { assignDeweyCopies, deweyService } from './dewey.service.ts'

function validationError(errors: Record<string, string>) {
  return new HttpError(422, 'CATALOG_VALIDATION_FAILED', 'The catalog entry contains invalid fields.', { errors })
}

function isDuplicateEntry(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY'
}

export function createCatalogService(database: Pool = db) {
  return {
    async createBookEntry(body: unknown, actorAccountId: number | null = null) {
      const validation = validateBookEntry(body)
      if (!validation.isValid) throw validationError(validation.errors)
      const input = validation.data
      const dewey = await deweyService.prepare((body as Record<string, unknown>)?.dewey, input.isbn)
      const connection = await database.getConnection()

      try {
        await connection.beginTransaction()
        await lockShelfCapacity(connection)
        if (input.categoryId !== null) {
          const category = await lockCategoryShelf(connection, input.categoryId)
          if (category && category.shelfLocation === input.copy.shelfLocation) {
            input.copy.shelfColumn ??= category.shelfColumn
            input.copy.shelfRow ??= category.shelfRow
          }
        }
        Object.assign(input.copy, await assertShelfCapacity(connection, input.copy, 1))

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
        if (existingTitle?.lifecycle_status === 'Archived') throw new HttpError(409, 'CATALOG_TITLE_ARCHIVED', 'Restore this archived book title before adding more copies.')
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
        const existingMaterial = await findLegacyBookMaterialForUpdate(connection, input.copy)
        if (existingMaterial && existingMaterial.material_type !== 'Book') {
          throw new HttpError(409, 'BARCODE_ASSIGNED_TO_RESEARCH', 'The barcode is already assigned to a research or thesis material.')
        }
        const materialId = existingMaterial?.material_id ?? await insertLegacyBookMaterial(connection, input)
        const physicalCopyId = await insertPhysicalCopy(connection, titleId, { ...input.copy, legacyMaterialId: Number(materialId) })
        await assignDeweyCopies(connection, dewey, [{ id: Number(physicalCopyId), version: 0 }], actorAccountId)

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
        await lockShelfCapacity(connection)
        if (input.categoryId !== null) {
          const category = await lockCategoryShelf(connection, input.categoryId)
          if (category && category.shelfLocation === input.copy.shelfLocation) {
            input.copy.shelfColumn ??= category.shelfColumn
            input.copy.shelfRow ??= category.shelfRow
          }
        }
        Object.assign(input.copy, await assertShelfCapacity(connection, input.copy, 1))

        if (!await ensureBookLocationExists(connection, input.copy.shelfLocation)) {
          throw new HttpError(422, 'RESEARCH_LOCATION_NOT_FOUND', 'Shelf location must match an existing managed location.', {
            errors: { shelfLocation: 'Select an existing shelf location.' },
          })
        }

        if (input.researchGroupId) input.departmentOrProgram = researchGroupLabel(await requireResearchGroup(connection, input.researchGroupId))

        const existingResearch = await findResearchCodeForUpdate(connection, input.researchCode)
        if (existingResearch) {
          throw new HttpError(409, 'RESEARCH_CODE_ALREADY_EXISTS', 'The research code is already assigned to another thesis.', {
            researchCode: input.researchCode,
            researchRecordId: existingResearch.research_record_id,
          })
        }

        const titleId = await insertTitle(connection, {
          categoryId: null,
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
        if (input.researchGroupId) await connection.execute('UPDATE research_records SET research_group_id=? WHERE research_record_id=?', [input.researchGroupId,researchRecordId])
        const year = new Date().getFullYear()
        const sequence = await reserveBarcodeSequence(connection, year, 1)
        const serial = String(sequence).padStart(6, '0')
        input.copy.barcode = `STIORMOC${year}${serial}`
        input.copy.accessionNumber = `STI-RES-${year}-${serial}`
        input.copy.conditionStatus = 'Good'
        const label = await renderBookLabel({ title_id: titleId, barcode: input.copy.barcode, accession_number: input.copy.accessionNumber })
        const researchInventoryId = await insertResearchInventory(connection, {
          ...input,
          copy: input.copy,
        }, titleId, label.qrCodeData)

        await connection.commit()
        return {
          titleId, researchRecordId, researchInventoryId,
          createdTitle: true, numberOfCopies: 1,
          copies: [{ physicalCopyId: researchInventoryId, materialId: 0, titleId, title: input.title,
            author: input.authors.join(', '), isbn: '', shelfLocation: input.copy.shelfLocation,
            accessionNumber: input.copy.accessionNumber, barcode: input.copy.barcode,
            qrCodeData: label.qrCodeData, barcodeImageData: label.barcodeImageData }],
        }
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
