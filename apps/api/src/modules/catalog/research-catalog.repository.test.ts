import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { buildResearchCatalogQuery, queryResearchOverview } from './research-catalog.repository.ts'
import { parseResearchCatalogFilters } from './research-catalog.validation.ts'

test('research query combines prepared title, authors, adviser, department, and year filters', () => {
  const filters = parseResearchCatalogFilters({
    title: 'Smart Library', authors: 'Dela Cruz', adviser: 'Santos',
    department: 'Information Technology', publication_year: '2026', page: '2', limit: '20',
  })
  const query = buildResearchCatalogQuery(filters)

  assert.match(query.dataSql, /t\.title LIKE \?/)
  assert.match(query.dataSql, /author_filter\.normalized_name LIKE \?/)
  assert.match(query.dataSql, /rr\.adviser_name LIKE \?/)
  assert.match(query.dataSql, /rr\.department_or_program LIKE \?/)
  assert.match(query.dataSql, /t\.publication_year = \?/)
  assert.match(query.dataSql, /research_inventory ri/)
  assert.match(query.dataSql, /LIMIT 20 OFFSET 20/)
  assert.ok(!query.dataSql.includes('Smart Library'))
  assert.deepEqual(query.dataParameters, [
    '%Smart Library%', '%dela cruz%', '%Santos%', '%Information Technology%', 2026,
  ])
})

test('research query rejects malformed publication years', () => {
  assert.throws(
    () => parseResearchCatalogFilters({ publication_year: '2026 OR 1=1' }),
    (error: unknown) => typeof error === 'object' && error !== null && 'status' in error && error.status === 422,
  )
})

test('single-record lookup uses the inventory primary key and preserves author ordering SQL', async () => {
  let capturedSql = ''
  let capturedValues: unknown[] = []
  const database = {
    execute: async (sql: string, values: unknown[]) => {
      capturedSql = sql; capturedValues = values
      return [[{
        title_id: 4, research_record_id: 8, research_inventory_id: 12,
        research_code: 'R-4', title: 'SmartLib', authors: 'A. Student, B. Student',
        adviser_name: 'Dr. Adviser', department_or_program: 'BSIT', publication_year: 2026,
        shelf_location: 'Thesis A-1', abstract_text: 'Complete abstract.',
        keywords_text: null, access_status: 'Available',
      }]]
    },
  } as unknown as Pool

  const record = await queryResearchOverview(database, 12)
  assert.match(capturedSql, /GROUP_CONCAT\(a\.author_name ORDER BY a\.author_order/)
  assert.match(capturedSql, /WHERE ri\.research_inventory_id = \?/)
  assert.deepEqual(capturedValues, [12])
  assert.equal(record?.abstract, 'Complete abstract.')
})

test('single-record lookup falls back cleanly for a pre-bridge inventory schema', async () => {
  let calls = 0
  const database = {
    execute: async () => {
      calls += 1
      if (calls === 1) throw Object.assign(new Error('Unknown column title_id'), { code: 'ER_BAD_FIELD_ERROR' })
      return [[{
        research_inventory_id: 12, title_id: 12, research_record_id: 12,
        accession_number: 'R-12', title: 'Legacy paper', authors: 'A. Student',
        adviser_name: 'Dr. Adviser', department_or_program: null, publication_year: 2025,
        shelf_location: 'Archive A', abstract_text: null, keywords_text: null,
        access_status: 'Available',
      }]]
    },
  } as unknown as Pool

  const record = await queryResearchOverview(database, 12)
  assert.equal(calls, 2)
  assert.equal(record?.department, 'Department not recorded')
  assert.match(record?.abstract ?? '', /No abstract has been recorded/)
})
