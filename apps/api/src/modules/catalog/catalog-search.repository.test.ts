import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCatalogSearchQuery, parseCatalogSearchFilters } from './catalog-search.repository.ts'

test('builds one prepared query for combined category, author, year, availability, and text filters', () => {
  const filters = parseCatalogSearchFilters({
    q: 'database', scope: 'books', categoryId: '4', author: 'Date', publicationYear: '2019',
    availability: 'Available', page: '2', limit: '20',
  })
  const query = buildCatalogSearchQuery(filters)

  assert.match(query.dataSql, /t\.category_id = \?/)
  assert.match(query.dataSql, /af\.normalized_name LIKE \?/)
  assert.match(query.dataSql, /t\.publication_year = \?/)
  assert.match(query.dataSql, /pcf\.availability_status = 'Available'/)
  assert.deepEqual(query.dataParameters.slice(0, 3), [4, 2019, '%date%'])
  assert.match(query.dataSql, /LIMIT 20 OFFSET 20/)
  assert.ok(!query.dataSql.includes('database'), 'user text must never be interpolated into SQL')
  assert.ok(query.dataParameters.includes('%database%'))
})

test('rejects malformed search filters with 422 semantics', () => {
  assert.throws(() => parseCatalogSearchFilters({ categoryId: '1 OR 1=1' }), (error: unknown) => {
    return typeof error === 'object' && error !== null && 'status' in error && error.status === 422
  })
})

test('catalog results include the active research inventory identifier needed by the code viewer', () => {
  const query = buildCatalogSearchQuery(parseCatalogSearchFilters({ scope: 'research' }))
  assert.match(query.dataSql, /MIN\(research_inventory_id\) AS research_inventory_id/)
  assert.match(query.dataSql, /ri_lookup\.research_inventory_id/)
})
