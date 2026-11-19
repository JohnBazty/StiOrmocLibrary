import assert from 'node:assert/strict'
import test from 'node:test'
import { checkSchemaReadiness, isMissingSchemaError } from './schema-readiness.ts'

test('reports missing module tables and columns without exposing SQL errors', async () => {
  const database = { execute: async () => [[
    { TABLE_NAME: 'categories', COLUMN_NAME: 'category_id' },
    { TABLE_NAME: 'categories', COLUMN_NAME: 'category_name' },
    { TABLE_NAME: 'borrowing_policy_versions', COLUMN_NAME: 'due_time_cutoff' },
  ]] } as never
  const result = await checkSchemaReadiness(database)
  assert.equal(result.ready, false)
  assert.ok(result.missingTables.includes('titles'))
  assert.ok(result.missingColumns.includes('categories.shelf_location'))
  assert.ok(result.missingColumns.includes('borrowing_policy_versions.checkout_opens_at'), 'migration 041 column is required')
})

test('recognizes database errors caused by an unapplied schema migration', () => {
  assert.equal(isMissingSchemaError({ code: '42P01' }), true)
  assert.equal(isMissingSchemaError({ code: '42703' }), true)
  assert.equal(isMissingSchemaError({ code: '23505' }), false)
})
