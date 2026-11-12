import assert from 'node:assert/strict'
import test from 'node:test'
import { checkRowLevelSecurity, type QueryClient } from './rls-check.ts'

// shortcut: the fake routes by SQL text, so it proves the result logic, not the SQL; a PGlite test would cover the SQL.
function fakeClient(
  rlsOff: string[],
  grants: Array<{ grantee: string; table_name: string }>,
  roles = ['anon', 'authenticated'],
): QueryClient & { sql: string[] } {
  const sql: string[] = []
  return {
    sql,
    async query(text: string) {
      sql.push(text)
      if (text.includes('FROM pg_roles WHERE')) return { rows: roles.map((rolname) => ({ rolname })) }
      if (text.includes('relrowsecurity')) return { rows: rlsOff.map((table_name) => ({ table_name })) }
      return { rows: grants }
    },
  }
}

test('RLS check passes when every public table has RLS and anon/authenticated hold no privileges', async () => {
  const client = fakeClient([], [])
  const result = await checkRowLevelSecurity(client)
  assert.deepEqual(result, { ok: true, missingRoles: [], tablesWithoutRls: [], exposedGrants: [] })
  assert.equal(client.sql.length, 3)
  for (const text of client.sql.slice(1)) assert.match(text, /nspname = 'public'/)
})

test('RLS check reports tables without row-level security', async () => {
  const result = await checkRowLevelSecurity(fakeClient(['books', 'loans'], []))
  assert.equal(result.ok, false)
  assert.deepEqual(result.tablesWithoutRls, ['books', 'loans'])
})

test('RLS check reports anon and authenticated table privileges', async () => {
  const grants = [{ grantee: 'anon', table_name: 'accounts' }, { grantee: 'authenticated', table_name: 'fines' }]
  const result = await checkRowLevelSecurity(fakeClient([], grants))
  assert.equal(result.ok, false)
  assert.deepEqual(result.exposedGrants, ['anon on accounts', 'authenticated on fines'])
})

test('RLS check fails instead of passing vacuously when anon or authenticated is missing', async () => {
  const result = await checkRowLevelSecurity(fakeClient([], [], ['anon']))
  assert.equal(result.ok, false)
  assert.deepEqual(result.missingRoles, ['authenticated'])
})

test('RLS check covers both roles, every table privilege, views and column-level grants', async () => {
  const client = fakeClient([], [])
  await checkRowLevelSecurity(client)
  const grantSql = client.sql.find((text) => text.includes('has_table_privilege'))
  assert.ok(grantSql)
  assert.match(grantSql, /'anon', 'authenticated'/)
  assert.match(grantSql, /SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER/)
  assert.match(grantSql, /'v', 'm'/)
  assert.match(grantSql, /has_column_privilege\(r\.oid, c\.oid, a\.attnum/)
})
