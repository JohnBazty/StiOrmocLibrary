import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
import { buildCatalogSearchQuery, parseCatalogSearchFilters, searchCatalog } from './catalog-search.repository.ts'

test('builds one prepared query for combined category, author, year, availability, and text filters', () => {
  const filters = parseCatalogSearchFilters({
    q: 'database', scope: 'books', categoryId: '4', author: 'Date', publicationYear: '2019',
    availability: 'Available', page: '2', limit: '20',
  })
  const query = buildCatalogSearchQuery(filters)

  assert.match(query.dataSql, /t\.category_id = \?/)
  assert.match(query.dataSql, /af\.normalized_name ILIKE \?/)
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

test('catalog results expose the authoritative category shelf and actual active inventory shelves', () => {
  const query = buildCatalogSearchQuery(parseCatalogSearchFilters({}))
  assert.match(query.dataSql, /c\.shelf_location AS category_shelf_location/)
  assert.match(query.dataSql, /book_shelf_locations/)
  assert.match(query.dataSql, /active_inventory_count/)
  assert.match(query.dataSql, /t\.row_version/)
})

test('treats active copies placed on any shelf as Mapped and only flags Mismatch when copies have no shelf', async () => {
  const baseRow = {
    record_type: 'Book', cover_image_path: null, authors: 'Author', isbn: null, publication_year: 2024,
    publisher: 'Publisher', call_number: 'PL6054', first_accession_number: 'ACC-1', last_accession_number: 'ACC-6',
    dewey_code: null, classification: null, edition: null, volumes: null, pages: null, remarks: null,
    category_id: 27, category_name: 'Philosophy & Psychology', row_version: 1,
    category_shelf_location: 'Reference Section', availability: 'Available', total_copies: 6, available_copies: 6,
    research_record_id: null,
  }
  const database = {
    execute: async (sql: string) => {
      if (sql.includes('COUNT(DISTINCT t.title_id)')) return [[{ total: 3 }]]
      return [[
        { ...baseRow, title_id: 36, title: 'Different Shelf Book', book_shelf_locations: 'AISLE 3' },
        { ...baseRow, title_id: 37, title: 'Split Shelf Book', book_shelf_locations: 'AISLE 3, SHELF 2B' },
        { ...baseRow, title_id: 38, title: 'Unassigned Shelf Book', book_shelf_locations: null },
      ]]
    },
  } as unknown as Pool

  const result = await searchCatalog(database, parseCatalogSearchFilters({}))
  assert.equal(result.items[0].shelfStatus, 'Mapped')
  assert.deepEqual(result.items[0].actualShelfLocations, ['AISLE 3'])
  assert.equal(result.items[1].shelfStatus, 'Mapped')
  assert.deepEqual(result.items[1].actualShelfLocations, ['AISLE 3', 'SHELF 2B'])
  assert.equal(result.items[2].shelfStatus, 'Mismatch')
  assert.deepEqual(result.items[2].actualShelfLocations, [])
})
