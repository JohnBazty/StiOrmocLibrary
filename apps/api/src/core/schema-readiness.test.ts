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
  assert.equal(isMissingSchemaError({ code: '42P01' }), true)
  assert.equal(isMissingSchemaError({ code: '42703' }), true)
  assert.equal(isMissingSchemaError({ code: '23505' }), false)
})

test('requires the mobile refresh schema only when MOBILE_REFRESH_ENABLED=true', async () => {
  const previous = process.env.MOBILE_REFRESH_ENABLED
  const sessionColumns = ['session_id', 'account_id', 'auth_version', 'last_activity_at', 'revoked_at']
  const database = { execute: async () => [sessionColumns.map(column => ({ TABLE_NAME: 'library_login_sessions', COLUMN_NAME: column }))] } as never
  try {
    process.env.MOBILE_REFRESH_ENABLED = 'true'
    const on = await checkSchemaReadiness(database)
    assert.ok(on.missingColumns.includes('library_login_sessions.client'))
    assert.ok(on.missingColumns.includes('library_login_sessions.trusted_since'))
    assert.ok(on.missingTables.includes('mobile_refresh_tokens'))
    delete process.env.MOBILE_REFRESH_ENABLED
    const off = await checkSchemaReadiness(database)
    assert.ok(!off.missingColumns.includes('library_login_sessions.client'))
    assert.ok(!off.missingTables.includes('mobile_refresh_tokens'))
  } finally {
    if (previous === undefined) delete process.env.MOBILE_REFRESH_ENABLED
    else process.env.MOBILE_REFRESH_ENABLED = previous
  }
})
