import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { findAdminAssetById, findCatalogAssetByBarcode } from './asset-code.repository.ts'

test('asset lookups use indexed identity predicates and student SQL never selects QR data', async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = []
  const database = { execute: async (sql: string, parameters: unknown[]) => { calls.push({ sql, parameters }); return [[]] } } as unknown as Pool
  await findAdminAssetById(database, 9)
  await findCatalogAssetByBarcode(database, 'STIORMOC2026000009')
  assert.match(calls[0].sql, /pc\.physical_copy_id = \?/)
  assert.deepEqual(calls[0].parameters, [9])
  assert.match(calls[1].sql, /pc\.barcode = \?/)
  assert.doesNotMatch(calls[1].sql, /qr_code_data/)
  assert.deepEqual(calls[1].parameters, ['STIORMOC2026000009'])
})
