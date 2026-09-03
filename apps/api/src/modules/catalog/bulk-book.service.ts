import type { Pool } from 'mysql2/promise'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { ensureCategoryExists } from './catalog.repository.ts'
import { renderBookLabel } from './book-label.renderer.ts'
import { createBulkBookTitle, ensureBookLocationExists, insertGeneratedBookCopy, lockBookTitleByIsbn, reserveBarcodeSequence, updateBookCover, updateBookPurchasePrice } from './bulk-book.repository.ts'
import { validateBulkBookInput } from './bulk-book.validation.ts'
import { removeStoredCover, storeCoverImage } from './cover-image.storage.ts'

const BRANCH_PREFIX = 'STIORMOC'

function duplicateEntry(error: unknown) {
  return (error as { code?: string } | null)?.code === 'ER_DUP_ENTRY'
}

function identity(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

export function createBulkBookService(database: Pool = db, clock: () => Date = () => new Date(), labelRenderer = renderBookLabel) {
  return {
    async addBulk(body: unknown) {
      const input = validateBulkBookInput(body)
      const connection = await database.getConnection()
      let storedCoverPath: string | null = null
      try {
        await connection.beginTransaction()
        if (!await ensureCategoryExists(connection, input.categoryId)) {
          throw new HttpError(422, 'CATEGORY_NOT_FOUND', 'The selected category does not exist.', { category_id: input.categoryId })
        }
        if (!await ensureBookLocationExists(connection, input.shelfLocation)) {
          throw new HttpError(422, 'BOOK_LOCATION_NOT_FOUND', 'Book location must match a location currently saved in Category Management.', { shelf_location: input.shelfLocation })
        }
        const existingTitle = await lockBookTitleByIsbn(connection, input.isbn)
        if (existingTitle && (
          identity(existingTitle.title) !== identity(input.title)
          || identity(existingTitle.author) !== identity(input.author)
          || existingTitle.categoryId !== input.categoryId
        )) {
          throw new HttpError(422, 'ISBN_CATALOG_CONFLICT',
            `ISBN ${input.isbn} is already assigned to “${existingTitle.title}” by ${existingTitle.author}. Use that book's existing title and category, or enter the correct unique ISBN.`,
            { errors: { isbn: 'This ISBN belongs to a different catalog record.' }, existingTitle })
        }
        let titleId = existingTitle?.titleId ?? null
        const createdTitle = titleId === null
        storedCoverPath = await storeCoverImage(input.coverImageData)
        if (titleId === null) titleId = await createBulkBookTitle(connection, input, storedCoverPath)
        else if (storedCoverPath) await updateBookCover(connection, titleId, storedCoverPath)
        if (existingTitle && input.purchasePrice !== null) await updateBookPurchasePrice(connection, titleId, input.purchasePrice)

        const year = clock().getFullYear()
        const firstSequence = await reserveBarcodeSequence(connection, year, input.numberOfCopies)
        const copies = []
        for (let offset = 0; offset < input.numberOfCopies; offset += 1) {
          const serial = String(firstSequence + offset).padStart(6, '0')
          const barcode = `${BRANCH_PREFIX}${year}${serial}`
          const accessionNumber = `STI-ACC-${year}-${serial}`
          const rendered = await labelRenderer({ title_id: titleId, barcode, accession_number: accessionNumber })
          const inserted = await insertGeneratedBookCopy(connection, input, titleId, { barcode, accessionNumber, qrCodeData: rendered.qrCodeData })
          copies.push({
            ...inserted, titleId, title: input.title, author: input.author, isbn: input.isbn,
            shelfLocation: input.shelfLocation, accessionNumber, barcode,
            qrCodeData: rendered.qrCodeData, barcodeImageData: rendered.barcodeImageData,
          })
        }
        await connection.commit()
        return { titleId, createdTitle, numberOfCopies: copies.length, copies }
      } catch (error) {
        await connection.rollback()
        await removeStoredCover(storedCoverPath)
        if (duplicateEntry(error)) throw new HttpError(409, 'GENERATED_CODE_CONFLICT', 'A generated barcode or accession number already exists. Retry the batch after reviewing the sequence ledger.')
        throw error
      } finally {
        connection.release()
      }
    },
  }
}

export const bulkBookService = createBulkBookService()
