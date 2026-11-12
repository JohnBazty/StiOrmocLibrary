import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
import { getStocktakeSession, listStocktakeSessions } from './stocktake.repository.ts'

// pg returns COUNT(*) (bigint) as strings.
const row = {
  stocktake_session_id: '4', session_name: 'S', scope_kind: 'shelf', scope_label: 'A', asset_kind: 'book', status: 'closed',
  row_version: '2', expected_count: '10', present_count: '7', missing_count: '3', exception_count: '1', open_discrepancy_count: '4',
}
const database = { execute: async (sql: string) => (sql.includes('AS total') ? [[{ total: '1' }]] : [[row]]) } as unknown as Pool

test('T4 session counts and paging totals are numbers when pg returns strings', async () => {
  const session = await getStocktakeSession(database, 4)
  assert.deepEqual(
    [session?.stocktake_session_id, session?.expected_count, session?.present_count, session?.missing_count, session?.exception_count, session?.open_discrepancy_count],
    [4, 10, 7, 3, 1, 4],
  )
  const list = await listStocktakeSessions(database, { page: 1, limit: 10, status: null, scopeKind: null, query: null })
  assert.equal(list.pagination.total, 1)
  assert.equal(typeof list.items[0].missing_count, 'number')
})
