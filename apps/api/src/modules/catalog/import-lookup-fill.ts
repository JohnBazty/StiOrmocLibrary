import type { Pool, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { isValidIsbn, normalizeIsbn } from './catalog.validation.ts'
import { key } from './holdings-parser.ts'
import { isbnLookupService } from './isbn-lookup.service.ts'

/** Rows per click: keeps one large file from using up the Google Books daily quota at once (plan 2026-11-13-import-lookup-fill). */
export const FILL_BATCH_SIZE = 50
/** One click stops looking up after this long, well inside common proxy timeouts. */
export const FILL_DEADLINE_MS = 20_000
const FILLABLE = ['title', 'author', 'isbn', 'publisher', 'publicationYear'] as const
type Fillable = typeof FILLABLE[number]
type Source = 'local_catalog' | 'google_books' | 'open_library'
type Found = Partial<Record<Fillable, string>> & { source: Source }

export type Lookups = {
  lookup: (isbn: unknown) => Promise<{ title: string; author: string; isbn: string; publisher: string | null; publicationYear: number | null; source: Source }>
  searchTitles: (query: { title?: unknown; author?: unknown }) => Promise<{ source: Source | null; candidates: Array<{ title: string; author: string; publisher: string | null; publicationYear: number | null; isbn: string | null }> }>
}

// A row still needs the lookup while one of these is blank and it was never tried.
const NEEDS_FILL = `status = 'Review' AND batch_id = ? AND (data_json->>'lookupTried') IS NULL
  AND (${FILLABLE.map((field) => `COALESCE(data_json->>'${field}', '') = ''`).join(' OR ')})`

const year = (value: number | null) => (value && value >= 1000 && value <= new Date().getFullYear() ? String(value) : '')
const surname = (author: string) => key(author).split(' ').filter((word) => word.length > 1).pop() ?? ''

async function findFor(data: Record<string, string>, lookups: Lookups): Promise<Found | null> {
  const isbn = normalizeIsbn(data.isbn)
  if (isbn && isValidIsbn(isbn)) {
    const book = await lookups.lookup(isbn)
    return { title: book.title, author: book.author, publisher: book.publisher ?? '', publicationYear: year(book.publicationYear), source: book.source }
  }
  if (!data.title) return null
  const result = await lookups.searchTitles({ title: data.title, author: data.author })
  // Only an exact title (before any subtitle) by the same author surname counts; anything looser is left for the librarian.
  const wanted = key(data.title), writer = surname(data.author ?? '')
  const matches = result.candidates.filter((candidate) => (key(candidate.title) === wanted || key(candidate.title.split(':')[0]) === wanted)
    && (!writer || key(candidate.author).split(' ').includes(writer)))
  // Without an author, several books can share a title: fill only when exactly one result has it.
  const match = writer ? matches[0] : matches.length === 1 ? matches[0] : undefined
  if (!match || !result.source) return null
  const matchIsbn = normalizeIsbn(match.isbn ?? '')
  return { isbn: matchIsbn && isValidIsbn(matchIsbn) ? matchIsbn : '', author: match.author, publisher: match.publisher ?? '', publicationYear: year(match.publicationYear), source: result.source }
}

export type FilledValues = Record<string, { value: string; source: Source }>

/**
 * The blanks of one book row the lookups can fill, and where each value came from; values already present are never
 * replaced. Used by the import fill and by Find book details. Throws only when the providers are unavailable.
 */
export async function lookupBlanks(data: Record<string, string>, lookups: Lookups) {
  let found: Found | null
  try { found = await findFor(data, lookups) } catch (error) {
    if (error instanceof HttpError && error.status === 404) found = null
    else throw error
  }
  const additions: Partial<Record<Fillable, string>> = {}
  const record: FilledValues = {}
  for (const field of FILLABLE) {
    const value = found?.[field]?.trim()
    if (value && !String(data[field] ?? '').trim()) { additions[field] = value.slice(0, 255); record[field] = { value: additions[field]!, source: found!.source } }
  }
  return { additions, record }
}

/**
 * Fills blank title, author, ISBN, publisher and year in staged import rows from the book lookups, 50 rows per call.
 * Spreadsheet values are never replaced. Each filled value is recorded in `lookupFilled` for the librarian to check.
 */
export function createImportLookupFill(database: Pool = db, lookups: Lookups = isbnLookupService, clock: () => number = Date.now) {
  return async function fill(batchId: number) {
    const [rows] = await database.execute<RowDataPacket[]>(
      `SELECT import_row_id, data_json, row_version FROM catalog_import_rows WHERE ${NEEDS_FILL} ORDER BY import_row_id LIMIT ?`, [batchId, FILL_BATCH_SIZE])
    let filled = 0, notFound = 0, unavailable = false
    const startedAt = clock()
    for (const row of rows) {
      // Answer before a proxy gives up on the request; the rest stays waiting for the next click.
      if (clock() - startedAt > FILL_DEADLINE_MS) break
      let result: Awaited<ReturnType<typeof lookupBlanks>>
      try { result = await lookupBlanks(row.data_json as Record<string, string>, lookups) } catch { unavailable = true; break }
      const { additions, record } = result
      const patch = { ...additions, lookupTried: true, ...(Object.keys(record).length ? { lookupFilled: record } : {}) }
      // The version check keeps an edit the librarian saved while this lookup was running.
      const [update] = await database.execute<RowDataPacket[]>(
        `UPDATE catalog_import_rows SET data_json = data_json || ?::jsonb, row_version = row_version + 1, updated_at = NOW()
          WHERE import_row_id = ? AND row_version = ? AND status = 'Review'`, [JSON.stringify(patch), row.import_row_id, row.row_version])
      if (!(update as unknown as { affectedRows: number }).affectedRows) continue
      if (Object.keys(record).length) filled += 1
      else notFound += 1
    }
    const [left] = await database.execute<RowDataPacket[]>(`SELECT COUNT(*)::integer AS total FROM catalog_import_rows WHERE ${NEEDS_FILL}`, [batchId])
    return { filled, notFound, remaining: Number(left[0]?.total ?? 0), unavailable }
  }
}

export const fillImportFromLookup = createImportLookupFill()

/**
 * Review rule: a row with lookup-filled values is saved only after the librarian ticks that they checked them.
 * Returns the lookup facts to keep on the saved row; the client's copy of them is never trusted.
 */
export function lookupReviewFacts(stored: Record<string, unknown> | null | undefined, decision: string, checked: unknown, actor: number, now: Date) {
  const filled = stored?.lookupFilled
  const facts: Record<string, unknown> = {}
  if (stored?.lookupTried) facts.lookupTried = true
  if (!filled || typeof filled !== 'object') return facts
  facts.lookupFilled = filled
  if (stored?.lookupCheckedAt) return { ...facts, lookupCheckedAt: stored.lookupCheckedAt, lookupCheckedBy: stored.lookupCheckedBy }
  if (decision === 'skip') return facts
  if (checked !== true) throw new HttpError(409, 'LOOKUP_NOT_CHECKED', 'Check the details filled from the book lookup, then tick the box before saving.')
  return { ...facts, lookupCheckedAt: now.toISOString(), lookupCheckedBy: actor }
}
