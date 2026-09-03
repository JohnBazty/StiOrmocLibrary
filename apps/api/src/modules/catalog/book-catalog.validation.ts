import { HttpError } from '../../core/http-error.ts'

export type BookCatalogFilters = {
  query: string | null
  title: string | null
  author: string | null
  isbn: string | null
  categoryId: number | null
  categoryName: string | null
  publicationYear: number | null
  page: number
  limit: number
}

function first(value: unknown) {
  return Array.isArray(value) ? String(value[0] ?? '') : typeof value === 'string' ? value : ''
}

function text(value: unknown, maximum = 255) {
  return first(value).trim().slice(0, maximum) || null
}

function positiveInteger(value: unknown, field: string) {
  const raw = first(value).trim()
  if (!raw) return null
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new HttpError(422, 'BOOK_CATALOG_FILTER_INVALID', `${field} must be a positive integer.`, {
      errors: { [field]: `${field} must be a positive integer.` },
    })
  }
  return parsed
}

export function parseBookCatalogFilters(query: Record<string, unknown>): BookCatalogFilters {
  const publicationYear = positiveInteger(query.publication_year ?? query.publicationYear ?? query.year, 'publication_year')
  const currentYear = new Date().getFullYear()
  if (publicationYear !== null && (publicationYear < 1000 || publicationYear > currentYear)) {
    throw new HttpError(422, 'BOOK_CATALOG_FILTER_INVALID', 'publication_year is outside the supported range.', {
      errors: { publication_year: `publication_year must be between 1000 and ${currentYear}.` },
    })
  }

  return {
    query: text(query.q ?? query.query),
    title: text(query.title),
    author: text(query.author),
    isbn: text(query.isbn, 17),
    categoryId: positiveInteger(query.category_id ?? query.categoryId, 'category_id'),
    categoryName: text(query.category_name ?? query.categoryName, 100),
    publicationYear,
    page: positiveInteger(query.page, 'page') ?? 1,
    limit: Math.min(positiveInteger(query.limit, 'limit') ?? 24, 100),
  }
}

export function parseBookTitleId(value: unknown) {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new HttpError(422, 'BOOK_TITLE_ID_INVALID', 'titleId must be a positive integer.')
  }
  return id
}
