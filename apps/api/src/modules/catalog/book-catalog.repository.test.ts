import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { buildBookCatalogQuery, queryViewerActiveBookCount } from './book-catalog.repository.ts'
import { parseBookCatalogFilters } from './book-catalog.validation.ts'

test('book catalog query combines prepared title, author, ISBN, category, and year filters', () => {
  const filters = parseBookCatalogFilters({
    q: 'systems', title: 'Database', author: 'Date', isbn: '978',
    category_id: '3', publication_year: '2019', page: '2', limit: '20',
  })
  const query = buildBookCatalogQuery(filters)

  assert.match(query.dataSql, /t\.category_id = \?/)
  assert.match(query.dataSql, /t\.publication_year = \?/)
  assert.match(query.dataSql, /author_filter\.normalized_name LIKE \?/)
  assert.match(query.dataSql, /physical_copies pc/)
  assert.match(query.dataSql, /available_copies_count/)
  assert.match(query.dataSql, /current_condition_status/)
  assert.match(query.dataSql, /active_waiting_count/)
  assert.match(query.dataSql, /THEN 0 ELSE COALESCE\(stock\.available_copies_count/)
  assert.match(query.dataSql, /pc\.material_id IS NOT NULL/)
  assert.doesNotMatch(query.dataSql, /condition_status NOT IN/)
  assert.match(query.dataSql, /pc\.availability_status = 'Available' AND pc\.material_id IS NOT NULL/)
  assert.match(query.dataSql, /visible_copy\.availability_status IN \('Available', 'Borrowed', 'Reserved'\)/)
  assert.match(query.countSql, /visible_copy\.lifecycle_status = 'Active'/)
  assert.match(query.dataSql, /LIMIT 20 OFFSET 20/)
  assert.ok(!query.dataSql.includes('Database'), 'request values must never be interpolated into SQL')
  assert.deepEqual(query.dataParameters.slice(0, 5), [3, 2019, '%Database%', '%date%', '%978%'])
})

test('book catalog rejects injection-shaped numeric filters before repository execution', () => {
  assert.throws(
    () => parseBookCatalogFilters({ category_id: '1 OR 1=1' }),
    (error: unknown) => typeof error === 'object' && error !== null && 'status' in error && error.status === 422,
  )
})

test('viewer capacity counts normalized titles instead of duplicate compatibility material rows', async () => {
  let statement = ''
  const database = {
    async execute(sql: string) {
      statement = sql
      return [[{ active_count: 1 }]]
    },
  } as unknown as Pool

  assert.equal(await queryViewerActiveBookCount(database, 12), 1)
  assert.match(statement, /COUNT\(DISTINCT COALESCE\(activity\.title_id, -activity\.material_id\)\)/)
  assert.match(statement, /COALESCE\(r\.book_title_id, reserved_copy\.title_id\)/)
})
