import { HttpError } from '../../core/http-error.ts'
import { isbnValidationMessage, normalizeIsbn } from './catalog.validation.ts'

export type BulkBookInput = {
  title: string
  author: string
  isbn: string
  categoryId: number
  shelfLocation: string
  numberOfCopies: number
  publicationYear: number | null
  publisher: string | null
  purchasePrice: number | null
  callNumber: string | null
  coverImageData: string | null
}

function clean(value: unknown, maximum: number) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').slice(0, maximum)
}

function positiveInteger(value: unknown) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function validateBulkBookInput(body: unknown): BulkBookInput {
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const errors: Record<string, string> = {}
  const title = clean(input.title, 255)
  const author = clean(input.author ?? (Array.isArray(input.authors) ? input.authors[0] : ''), 255)
  const isbn = normalizeIsbn(input.isbn)
  const shelfLocation = clean(input.shelf_location ?? input.shelfLocation, 100)
  const categoryId = positiveInteger(input.category_id ?? input.categoryId)
  const numberOfCopies = positiveInteger(input.number_of_copies ?? input.numberOfCopies)
  const publicationYearValue = input.publication_year ?? input.publicationYear
  const publicationYear = publicationYearValue === '' || publicationYearValue === null || publicationYearValue === undefined
    ? null : positiveInteger(publicationYearValue)
  const purchasePriceValue = input.purchase_price ?? input.purchasePrice
  const purchasePrice = purchasePriceValue === '' || purchasePriceValue === null || purchasePriceValue === undefined
    ? null : Number(purchasePriceValue)

  if (!title) errors.title = 'Title is required.'
  if (!author) errors.author = 'Author is required.'
  const isbnError = isbnValidationMessage(input.isbn)
  if (isbnError) errors.isbn = isbnError
  if (!categoryId) errors.category_id = 'A valid category is required.'
  if (!shelfLocation) errors.shelf_location = 'Shelf location is required.'
  if (!numberOfCopies || numberOfCopies > 100) errors.number_of_copies = 'Number of copies must be a whole number from 1 to 100.'
  const currentYear = new Date().getFullYear()
  if (publicationYear !== null && (publicationYear < 1000 || publicationYear > currentYear)) errors.publication_year = `Publication year must be between 1000 and ${currentYear}.`
  if (purchasePrice !== null && (!Number.isFinite(purchasePrice) || purchasePrice <= 0 || purchasePrice > 1_000_000)) errors.purchase_price = 'Purchase price must be a positive amount.'
  const coverImageData = typeof (input.cover_image_data ?? input.coverImageData) === 'string'
    ? String(input.cover_image_data ?? input.coverImageData) : null
  if (coverImageData && coverImageData.length > 2_800_000) errors.cover_image = 'Book cover must not exceed 2 MB.'

  if (Object.keys(errors).length) {
    throw new HttpError(422, 'BULK_BOOK_VALIDATION_FAILED', 'The bulk book entry contains invalid fields.', { errors })
  }
  return {
    title, author, isbn, categoryId: categoryId!, shelfLocation, numberOfCopies: numberOfCopies!, publicationYear,
    publisher: clean(input.publisher, 255) || null,
    purchasePrice,
    callNumber: clean(input.call_number ?? input.callNumber, 100) || null,
    coverImageData,
  }
}
