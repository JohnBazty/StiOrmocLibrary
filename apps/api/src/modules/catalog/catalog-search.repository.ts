import type { Pool, RowDataPacket } from 'mysql2/promise'
import { HttpError } from '../../core/http-error.ts'

export type CatalogScope = 'all' | 'books' | 'research'

export type CatalogSearchFilters = {
  query: string | null
  scope: CatalogScope
  categoryId: number | null
  author: string | null
  publicationYear: number | null
  availability: string | null
  page: number
  limit: number
}

const AVAILABILITY_VALUES = new Set([
  'Available', 'Borrowed', 'Reserved', 'Unavailable', 'Archived', 'Missing', 'Available for Viewing',
])

function firstQueryValue(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] ?? '')
  return typeof value === 'string' ? value : ''
}

function optionalPositiveInteger(value: unknown, field: string) {
  const raw = firstQueryValue(value).trim()
  if (!raw) return null
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new HttpError(422, 'CATALOG_FILTER_VALIDATION_FAILED', `${field} must be a positive integer.`, {
      errors: { [field]: `${field} must be a positive integer.` },
    })
  }
  return parsed
}

export function parseCatalogSearchFilters(query: Record<string, unknown>): CatalogSearchFilters {
  const scopeValue = firstQueryValue(query.scope).trim().toLowerCase() || 'all'
  if (!['all', 'books', 'research'].includes(scopeValue)) {
    throw new HttpError(422, 'CATALOG_FILTER_VALIDATION_FAILED', 'scope must be all, books, or research.')
  }

  const publicationYear = optionalPositiveInteger(query.publicationYear ?? query.year, 'publicationYear')
  if (publicationYear !== null && (publicationYear < 1000 || publicationYear > new Date().getFullYear())) {
    throw new HttpError(422, 'CATALOG_FILTER_VALIDATION_FAILED', 'publicationYear is outside the supported range.')
  }

  const availability = firstQueryValue(query.availability).trim() || null
  if (availability && !AVAILABILITY_VALUES.has(availability)) {
    throw new HttpError(422, 'CATALOG_FILTER_VALIDATION_FAILED', 'availability is not a supported catalog status.')
  }

  const page = optionalPositiveInteger(query.page, 'page') ?? 1
  const requestedLimit = optionalPositiveInteger(query.limit, 'limit') ?? 25

  return {
    query: firstQueryValue(query.q ?? query.query).trim().slice(0, 255) || null,
    scope: scopeValue as CatalogScope,
    categoryId: optionalPositiveInteger(query.categoryId, 'categoryId'),
    author: firstQueryValue(query.author).trim().slice(0, 255) || null,
    publicationYear,
    availability,
    page,
    limit: Math.min(requestedLimit, 100),
  }
}

export function buildCatalogSearchQuery(filters: CatalogSearchFilters) {
  const where = ["t.lifecycle_status = 'Active'"]
  const parameters: Array<string | number> = []

  if (filters.scope === 'books') where.push("t.record_type = 'Book'")
  if (filters.scope === 'research') where.push("t.record_type = 'Research/Thesis'")

  if (filters.categoryId !== null) {
    where.push('t.category_id = ?')
    parameters.push(filters.categoryId)
  }
  if (filters.publicationYear !== null) {
    where.push('t.publication_year = ?')
    parameters.push(filters.publicationYear)
  }
  if (filters.author) {
    where.push('EXISTS (SELECT 1 FROM authors af WHERE af.title_id = t.title_id AND af.normalized_name LIKE ?)')
    parameters.push(`%${filters.author.toLocaleLowerCase('en-US')}%`)
  }
  if (filters.availability) {
    if (filters.availability === 'Available') {
      where.push(`(
        (t.record_type = 'Book' AND EXISTS (
          SELECT 1 FROM physical_copies pcf
           WHERE pcf.title_id = t.title_id AND pcf.lifecycle_status = 'Active'
             AND pcf.availability_status = 'Available'
        )) OR
        (t.record_type = 'Research/Thesis' AND rr.viewing_status = 'Available for Viewing')
      )`)
    } else if (filters.availability === 'Available for Viewing') {
      where.push("t.record_type = 'Research/Thesis' AND rr.viewing_status = 'Available for Viewing'")
    } else {
      where.push(`t.record_type = 'Book' AND EXISTS (
        SELECT 1 FROM physical_copies pcf
         WHERE pcf.title_id = t.title_id AND pcf.availability_status = ?
      )`)
      parameters.push(filters.availability)
    }
  }
  if (filters.query) {
    const like = `%${filters.query}%`
    where.push(`(
      t.title LIKE ? OR t.isbn LIKE ? OR t.call_number LIKE ? OR
      rr.research_code LIKE ? OR rr.abstract_text LIKE ? OR
      EXISTS (SELECT 1 FROM authors aq WHERE aq.title_id = t.title_id AND aq.author_name LIKE ?)
    )`)
    parameters.push(like, like, like, like, like, like)
  }

  const whereSql = `WHERE ${where.join('\n AND ')}`
  const fromSql = `FROM titles t
    LEFT JOIN categories c ON c.category_id = t.category_id
    LEFT JOIN research_records rr ON rr.title_id = t.title_id
    LEFT JOIN (
      SELECT title_id, MIN(research_inventory_id) AS research_inventory_id
        FROM research_inventory
       WHERE lifecycle_status = 'Active'
       GROUP BY title_id
    ) ri_lookup ON ri_lookup.title_id = t.title_id`

  const safeLimit = Math.min(Math.max(Math.trunc(filters.limit), 1), 100)
  const safeOffset = Math.max((Math.trunc(filters.page) - 1) * safeLimit, 0)
  const dataSql = `SELECT
      t.title_id, t.record_type, t.title, t.isbn, t.publication_year,
      t.publisher, t.call_number, t.category_id, c.category_name,
      rr.research_record_id, rr.research_code, rr.adviser_name,
      rr.department_or_program, rr.abstract_text, rr.keywords_text, rr.viewing_status,
      ri_lookup.research_inventory_id,
      GROUP_CONCAT(DISTINCT a.author_name ORDER BY a.author_order SEPARATOR ', ') AS authors,
      COUNT(DISTINCT CASE WHEN pc.lifecycle_status = 'Active' THEN pc.physical_copy_id END) AS total_copies,
      COUNT(DISTINCT CASE WHEN pc.lifecycle_status = 'Active' AND pc.availability_status = 'Available' THEN pc.physical_copy_id END) AS available_copies,
      CASE
        WHEN t.record_type = 'Research/Thesis' THEN rr.viewing_status
        WHEN COUNT(DISTINCT CASE WHEN pc.lifecycle_status = 'Active' AND pc.availability_status = 'Available' THEN pc.physical_copy_id END) > 0 THEN 'Available'
        WHEN COUNT(DISTINCT CASE WHEN pc.lifecycle_status = 'Active' AND pc.availability_status = 'Borrowed' THEN pc.physical_copy_id END) > 0 THEN 'Borrowed'
        WHEN COUNT(DISTINCT CASE WHEN pc.lifecycle_status = 'Active' AND pc.availability_status = 'Reserved' THEN pc.physical_copy_id END) > 0 THEN 'Reserved'
        ELSE 'Unavailable'
      END AS availability
    ${fromSql}
    LEFT JOIN authors a ON a.title_id = t.title_id
    LEFT JOIN physical_copies pc ON pc.title_id = t.title_id
    ${whereSql}
    GROUP BY t.title_id, t.record_type, t.title, t.isbn, t.publication_year,
      t.publisher, t.call_number, t.category_id, c.category_name,
      rr.research_record_id, rr.research_code, rr.adviser_name,
      rr.department_or_program, rr.abstract_text, rr.keywords_text, rr.viewing_status,
      ri_lookup.research_inventory_id
    ORDER BY t.title ASC, t.title_id ASC
    LIMIT ${safeLimit} OFFSET ${safeOffset}`

  const countSql = `SELECT COUNT(DISTINCT t.title_id) AS total ${fromSql} ${whereSql}`
  return {
    dataSql,
    countSql,
    dataParameters: parameters,
    countParameters: parameters,
  }
}

function toCatalogItem(row: RowDataPacket) {
  return {
    titleId: row.title_id,
    recordType: row.record_type,
    title: row.title,
    authors: row.authors ? String(row.authors).split(', ') : [],
    isbn: row.isbn,
    publicationYear: row.publication_year,
    publisher: row.publisher,
    callNumber: row.call_number,
    categoryId: row.category_id,
    categoryName: row.category_name,
    availability: row.availability,
    totalCopies: Number(row.total_copies ?? 0),
    availableCopies: Number(row.available_copies ?? 0),
    research: row.research_record_id ? {
      researchRecordId: row.research_record_id,
      researchInventoryId: row.research_inventory_id === null ? null : Number(row.research_inventory_id),
      researchCode: row.research_code,
      adviser: row.adviser_name,
      departmentOrProgram: row.department_or_program,
      abstract: row.abstract_text,
      keywords: row.keywords_text,
      viewingStatus: row.viewing_status,
    } : null,
  }
}

export async function searchCatalog(database: Pool, filters: CatalogSearchFilters) {
  const built = buildCatalogSearchQuery(filters)
  const [[rows], [countRows]] = await Promise.all([
    database.execute<RowDataPacket[]>(built.dataSql, built.dataParameters),
    database.execute<RowDataPacket[]>(built.countSql, built.countParameters),
  ])
  const total = Number(countRows[0]?.total ?? 0)
  return {
    items: rows.map(toCatalogItem),
    pagination: { page: filters.page, limit: filters.limit, total, pages: Math.ceil(total / filters.limit) },
  }
}
