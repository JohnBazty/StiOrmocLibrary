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
  callNumber: string | null
  coverImageData: string | null
  /** Book register (037): title fields, saved only when this entry creates the title. */
  classification: string | null
  edition: string | null
  pages: number | null
  volumes: string | null
  remarks: string | null
  /** Book register (037): copy fields, saved on every copy of this entry. */
  fundSource: string | null
  fundDetail: string | null
  costPhp: string | null
  receivedOn: string | null
}

/** Fixed list approved by Ethan on 2026-11-13. */
export const FUND_SOURCES = ['Purchase', 'Donation', 'Government grant', 'Other'] as const

function clean(value: unknown, maximum: number) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').slice(0, maximum)
}

function positiveInteger(value: unknown) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

/** Register text: refused when too long rather than cut, so nothing typed is lost silently. */
function registerText(input: Record<string, unknown>, keys: string[], field: string, maximum: number, errors: Record<string, string>) {
  const raw = keys.map((key) => input[key]).find((value) => value !== undefined)
  if (raw === undefined || raw === null || raw === '') return null
  if (typeof raw !== 'string') { errors[field] = 'Enter text.'; return null }
  const text = raw.trim().replace(/\s+/g, ' ')
  if ([...text].length > maximum) errors[field] = `Must not exceed ${maximum} characters.`
  return text || null
}

function registerFields(input: Record<string, unknown>, now: Date, errors: Record<string, string>) {
  const pick = (...keys: string[]) => keys.map((key) => input[key]).find((value) => value !== undefined && value !== null && value !== '')
  const pagesValue = pick('pages', 'page_count')
  const pages = pagesValue === undefined ? null : positiveInteger(pagesValue)
  if (pagesValue !== undefined && (pages === null || pages > 100000)) errors.pages = 'Pages must be a whole number from 1 to 100000.'
  const fundSource = registerText(input, ['fund_source', 'fundSource'], 'fund_source', 60, errors)
  if (fundSource && !(FUND_SOURCES as readonly string[]).includes(fundSource)) errors.fund_source = `Source of fund must be one of: ${FUND_SOURCES.join(', ')}.`
  const costValue = pick('cost_php', 'costPhp')
  let costPhp: string | null = null
  if (costValue !== undefined) {
    const text = String(costValue).trim()
    const amount = Number(text)
    if (!/^\d+(\.\d{1,2})?$/.test(text) || amount > 999999.99) errors.cost_php = 'Cost price must be from 0 to 999999.99 with at most 2 decimals.'
    else costPhp = amount.toFixed(2)
  }
  const receivedValue = pick('received_on', 'receivedOn')
  let receivedOn: string | null = null
  if (receivedValue !== undefined) {
    const text = String(receivedValue).trim()
    const parsed = new Date(`${text}T00:00:00Z`)
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text || text < '1900-01-01') errors.received_on = 'Date received must be a real date (YYYY-MM-DD).'
    else if (text > today) errors.received_on = 'Date received cannot be in the future.'
    else receivedOn = text
  }
  return {
    classification: registerText(input, ['classification'], 'classification', 100, errors),
    edition: registerText(input, ['edition'], 'edition', 100, errors),
    pages,
    volumes: registerText(input, ['volumes'], 'volumes', 100, errors),
    remarks: registerText(input, ['remarks'], 'remarks', 2000, errors),
    fundSource,
    fundDetail: registerText(input, ['fund_detail', 'fundDetail'], 'fund_detail', 200, errors),
    costPhp,
    receivedOn,
  }
}

export function validateBulkBookInput(body: unknown, now: Date = new Date()): BulkBookInput {
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

  if (!title) errors.title = 'Title is required.'
  if (!author) errors.author = 'Author is required.'
  const isbnError = isbnValidationMessage(input.isbn)
  if (isbnError) errors.isbn = isbnError
  if (!categoryId) errors.category_id = 'A valid category is required.'
  if (!shelfLocation) errors.shelf_location = 'Shelf location is required.'
  if (!numberOfCopies || numberOfCopies > 100) errors.number_of_copies = 'Number of copies must be a whole number from 1 to 100.'
  const currentYear = new Date().getFullYear()
  if (publicationYear !== null && (publicationYear < 1000 || publicationYear > currentYear)) errors.publication_year = `Publication year must be between 1000 and ${currentYear}.`
  const coverImageData = typeof (input.cover_image_data ?? input.coverImageData) === 'string'
    ? String(input.cover_image_data ?? input.coverImageData) : null
  if (coverImageData && coverImageData.length > 2_800_000) errors.cover_image = 'Book cover must not exceed 2 MB.'
  const register = registerFields(input, now, errors)

  if (Object.keys(errors).length) {
    throw new HttpError(422, 'BULK_BOOK_VALIDATION_FAILED', 'The bulk book entry contains invalid fields.', { errors })
  }
  return {
    title, author, isbn, categoryId: categoryId!, shelfLocation, numberOfCopies: numberOfCopies!, publicationYear,
    publisher: clean(input.publisher, 255) || null,
    callNumber: clean(input.call_number ?? input.callNumber, 100) || null,
    coverImageData,
    ...register,
  }
}
