import assert from 'node:assert/strict'
import test from 'node:test'
import { checkSchemaReadiness, isMissingSchemaError } from './schema-readiness.ts'

test('reports missing module tables and columns without exposing SQL errors', async () => {
  const database = { execute: async () => [[
    { TABLE_NAME: 'categories', COLUMN_NAME: 'category_id' },
    { TABLE_NAME: 'categories', COLUMN_NAME: 'category_name' },
  ]] } as never
  const result = await checkSchemaReadiness(database)
  assert.equal(result.ready, false)
  assert.ok(result.missingTables.includes('titles'))
  assert.ok(result.missingColumns.includes('categories.shelf_location'))
})

test('recognizes database errors caused by an unapplied schema migration', () => {
  assert.equal(isMissingSchemaError({ code: 'ER_NO_SUCH_TABLE' }), true)
  assert.equal(isMissingSchemaError({ code: 'ER_BAD_FIELD_ERROR' }), true)
  assert.equal(isMissingSchemaError({ code: 'ER_DUP_ENTRY' }), false)
})
