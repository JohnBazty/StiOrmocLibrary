import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import type { Pool } from '../../config/db.js'
import { toPgPlaceholders } from '../../config/sql.js'
import { HttpError } from '../../core/http-error.ts'
import { createImportLookupFill, FILL_BATCH_SIZE, FILL_DEADLINE_MS } from './import-lookup-fill.ts'

const blank = { title: '', author: '', isbn: '', edition: '', publisher: '', publicationYear: '', copyrightYear: '', pages: '', copies: '1', missingCopies: '', accessions: '', barcodes: '', callNumber: '', categoryId: 1, location: 'Shelf A', programId: null, generateAccessions: false }

async function database(rows: Array<{ data: Record<string, unknown>; status?: string; batch?: number }>) {
  const pg = new PGlite()
  await pg.exec(`CREATE TABLE catalog_import_rows (import_row_id BIGSERIAL PRIMARY KEY, batch_id BIGINT NOT NULL, status TEXT NOT NULL DEFAULT 'Review',
    data_json JSONB NOT NULL, row_version INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
  for (const row of rows) await pg.query('INSERT INTO catalog_import_rows (batch_id, status, data_json) VALUES ($1, $2, $3)', [row.batch ?? 1, row.status ?? 'Review', JSON.stringify({ ...blank, ...row.data })])
  const execute = async (sql: string, values: unknown[] = []) => {
    const result = await pg.query(toPgPlaceholders(sql), values)
    return /^\s*(INSERT|UPDATE|DELETE)/i.test(sql) ? [{ affectedRows: result.affectedRows ?? 0 }, result] : [result.rows, result]
  }
  const connection = { execute, query: execute, beginTransaction: () => pg.exec('BEGIN'), commit: () => pg.exec('COMMIT'), rollback: () => pg.exec('ROLLBACK'), release() {} }
  const pool = { execute, query: execute, getConnection: async () => connection } as unknown as Pool
  const data = async () => (await pg.query<{ import_row_id: number; data_json: Record<string, unknown>; row_version: number }>('SELECT import_row_id, data_json, row_version FROM catalog_import_rows ORDER BY import_row_id')).rows
  return { pg, pool, data }
}

const isbnBook = { isbn: '9780132350884', title: 'Clean Code', author: 'Robert C. Martin', publisher: 'Prentice Hall', publicationYear: 2008, subjects: [], source: 'google_books' as const }

test('fills only empty fields from the ISBN lookup and records each filled value with its source', async () => {
  const { pg, pool, data } = await database([{ data: { isbn: '9780132350884', title: 'Clean code (school copy)', author: '', publisher: '' } }])
  const lookups: string[] = []
  const fill = createImportLookupFill(pool, { lookup: async (isbn: unknown) => { lookups.push(String(isbn)); return isbnBook }, searchTitles: async () => { throw new Error('not used') } })
  const result = await fill(1)
  assert.deepEqual(result, { filled: 1, notFound: 0, remaining: 0, unavailable: false })
  assert.deepEqual(lookups, ['9780132350884'])
  const [row] = await data()
  assert.equal(row.data_json.title, 'Clean code (school copy)', 'a value from the spreadsheet is never replaced')
  assert.equal(row.data_json.author, 'Robert C. Martin')
  assert.equal(row.data_json.publisher, 'Prentice Hall')
  assert.equal(row.data_json.publicationYear, '2008')
  assert.deepEqual(row.data_json.lookupFilled, {
    author: { value: 'Robert C. Martin', source: 'google_books' },
    publisher: { value: 'Prentice Hall', source: 'google_books' },
    publicationYear: { value: '2008', source: 'google_books' },
  })
  assert.equal(row.data_json.lookupTried, true)
  assert.equal(row.row_version, 2)
  await pg.close()
})

test('a row without an ISBN takes a title result only when the title and the author surname match', async () => {
  const { pg, pool, data } = await database([
    { data: { title: 'Clean Code', author: 'Robert C. Martin', isbn: '' } },
    { data: { title: 'Clean Code', author: 'Jane Doe', isbn: '' } },
    { data: { title: 'Cooking Basics', author: 'Ann Cook', isbn: '' } },
  ])
  const candidate = { title: 'Clean Code: A Handbook of Agile Software Craftsmanship', author: 'Robert C. Martin', publisher: 'Prentice Hall', publicationYear: 2008, isbn: '9780132350884', subjects: [], inCatalog: false }
  const fill = createImportLookupFill(pool, { lookup: async () => { throw new Error('not used') }, searchTitles: async () => ({ source: 'google_books', localMatches: [], candidates: [candidate] }) })
  assert.deepEqual(await fill(1), { filled: 1, notFound: 2, remaining: 0, unavailable: false })
  const [matched, wrongAuthor, other] = await data()
  assert.equal(matched.data_json.isbn, '9780132350884')
  assert.equal(matched.data_json.publisher, 'Prentice Hall')
  assert.deepEqual(Object.keys(matched.data_json.lookupFilled as object).sort(), ['isbn', 'publicationYear', 'publisher'])
  assert.equal(wrongAuthor.data_json.isbn, '')
  assert.equal(wrongAuthor.data_json.lookupTried, true, 'a row with no match is not looked up again')
  assert.equal(other.data_json.lookupFilled, undefined)
  await pg.close()
})

test('takes 50 rows a run, skips complete, tried, reviewed and other-batch rows, and stops when the providers are down', async () => {
  const rows = [
    ...Array.from({ length: FILL_BATCH_SIZE + 3 }, () => ({ data: { isbn: '9780132350884', title: 'T', author: 'A' } })),
    { data: { isbn: '9780132350884', title: 'T', author: 'A', publisher: 'P', publicationYear: '2000' } },
    { data: { isbn: '9780132350884', lookupTried: true } },
    { data: { isbn: '9780132350884' }, status: 'Ready' },
    { data: { isbn: '9780132350884' }, batch: 2 },
  ]
  const { pg, pool } = await database(rows)
  let calls = 0
  const fill = createImportLookupFill(pool, { lookup: async () => { calls += 1; return isbnBook }, searchTitles: async () => ({ source: null, localMatches: [], candidates: [] }) })
  assert.deepEqual(await fill(1), { filled: FILL_BATCH_SIZE, notFound: 0, remaining: 3, unavailable: false })
  assert.equal(calls, FILL_BATCH_SIZE)
  assert.deepEqual(await fill(1), { filled: 3, notFound: 0, remaining: 0, unavailable: false })

  const down = await database([{ data: { isbn: '9780132350884' } }, { data: { isbn: '9780132350884' } }])
  const failing = createImportLookupFill(down.pool, { lookup: async () => { throw new HttpError(503, 'ISBN_LOOKUP_UNAVAILABLE', 'down') }, searchTitles: async () => ({ source: null, localMatches: [], candidates: [] }) })
  assert.deepEqual(await failing(1), { filled: 0, notFound: 0, remaining: 2, unavailable: true })
  assert.equal((await down.data())[0].data_json.lookupTried, undefined, 'rows are retried once the providers are back')
  const notFound = createImportLookupFill(down.pool, { lookup: async () => { throw new HttpError(404, 'ISBN_METADATA_NOT_FOUND', 'none') }, searchTitles: async () => ({ source: null, localMatches: [], candidates: [] }) })
  assert.deepEqual(await notFound(1), { filled: 0, notFound: 2, remaining: 0, unavailable: false })
  await pg.close(); await down.pg.close()
})

test('a row edited while its lookup was running keeps the edit', async () => {
  const { pg, pool, data } = await database([{ data: { isbn: '9780132350884', title: 'T', author: 'A' } }])
  const fill = createImportLookupFill(pool, { lookup: async () => { await pg.exec("UPDATE catalog_import_rows SET data_json = data_json || '{\"publisher\":\"Mine\"}', row_version = row_version + 1"); return isbnBook }, searchTitles: async () => ({ source: null, localMatches: [], candidates: [] }) })
  assert.deepEqual(await fill(1), { filled: 0, notFound: 0, remaining: 1, unavailable: false })
  assert.equal((await data())[0].data_json.publisher, 'Mine')
  await pg.close()
})

test('a row with lookup-filled values needs the checked tick, and keeps who checked it', async () => {
  const { lookupReviewFacts } = await import('./import-lookup-fill.ts')
  const now = new Date('2026-11-13T03:00:00Z')
  const filled = { lookupTried: true, lookupFilled: { publisher: { value: 'Prentice Hall', source: 'google_books' } } }
  assert.throws(() => lookupReviewFacts(filled, 'new', undefined, 5, now), (error: unknown) => error instanceof HttpError && error.code === 'LOOKUP_NOT_CHECKED' && error.status === 409)
  assert.throws(() => lookupReviewFacts(filled, 'add', 'true', 5, now), { code: 'LOOKUP_NOT_CHECKED' })
  assert.deepEqual(lookupReviewFacts(filled, 'new', true, 5, now), { ...filled, lookupCheckedAt: '2026-11-13T03:00:00.000Z', lookupCheckedBy: 5 })
  assert.deepEqual(lookupReviewFacts({ ...filled, lookupCheckedAt: 'earlier', lookupCheckedBy: 2 }, 'new', undefined, 5, now), { ...filled, lookupCheckedAt: 'earlier', lookupCheckedBy: 2 })
  assert.deepEqual(lookupReviewFacts(filled, 'skip', undefined, 5, now), filled, 'leaving a book out needs no check')
  assert.deepEqual(lookupReviewFacts({ lookupTried: true }, 'new', undefined, 5, now), { lookupTried: true })
  assert.deepEqual(lookupReviewFacts({}, 'new', undefined, 5, now), {})
})

test('a title-only match stores a normalized ISBN, needs one clear result without an author, and a run stops at the deadline', async () => {
  const dashed = { title: 'Algebra', author: 'Ann Cook', publisher: 'P', publicationYear: 2001, isbn: '978-0-13-235088-4', subjects: [], inCatalog: false }
  const { pg, pool, data } = await database([{ data: { title: 'Algebra', author: 'Ann Cook' } }, { data: { title: 'Algebra', author: '' } }])
  const fill = createImportLookupFill(pool, { lookup: async () => { throw new Error('not used') }, searchTitles: async () => ({ source: 'open_library', localMatches: [], candidates: [dashed, { ...dashed, author: 'Bo Lee', isbn: '9780306406157' }] }) })
  assert.deepEqual(await fill(1), { filled: 1, notFound: 1, remaining: 0, unavailable: false })
  const [withAuthor, noAuthor] = await data()
  assert.equal(withAuthor.data_json.isbn, '9780132350884')
  assert.equal(noAuthor.data_json.isbn, '', 'two books share the title and no author tells them apart')

  const slow = await database([{ data: { isbn: '9780132350884' } }, { data: { isbn: '9780132350884' } }])
  let now = 0
  const timed = createImportLookupFill(slow.pool, { lookup: async () => { now += FILL_DEADLINE_MS + 1; return isbnBook }, searchTitles: async () => ({ source: null, localMatches: [], candidates: [] }) }, () => now)
  assert.deepEqual(await timed(1), { filled: 1, notFound: 0, remaining: 1, unavailable: false })
  await pg.close(); await slow.pg.close()
})
