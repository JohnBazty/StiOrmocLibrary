import { HttpError } from '../../core/http-error.ts'

export type ResearchCatalogFilters = {
  query: string | null
  title: string | null
  authors: string | null
  adviser: string | null
  department: string | null
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
    throw new HttpError(422, 'RESEARCH_CATALOG_FILTER_INVALID', `${field} must be a positive integer.`, {
      errors: { [field]: `${field} must be a positive integer.` },
    })
  }
  return parsed
}

export function parseResearchCatalogFilters(query: Record<string, unknown>): ResearchCatalogFilters {
  const publicationYear = positiveInteger(query.publication_year ?? query.publicationYear ?? query.year, 'publication_year')
  const currentYear = new Date().getFullYear()
  if (publicationYear !== null && (publicationYear < 1000 || publicationYear > currentYear)) {
    throw new HttpError(422, 'RESEARCH_CATALOG_FILTER_INVALID', 'publication_year is outside the supported range.')
  }
  return {
    query: text(query.q ?? query.query),
    title: text(query.title),
    authors: text(query.authors ?? query.author),
    adviser: text(query.adviser),
    department: text(query.department, 150),
    publicationYear,
    page: positiveInteger(query.page, 'page') ?? 1,
    limit: Math.min(positiveInteger(query.limit, 'limit') ?? 25, 100),
  }
}

export function parseResearchTitleId(value: unknown) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new HttpError(422, 'RESEARCH_TITLE_ID_INVALID', 'titleId must be a positive integer.')
  }
  return parsed
}
