/**
 * Read-only guard for the Supabase `public` schema: RLS on every table, and no table or column privileges
 * held by the PostgREST roles `anon` and `authenticated`.
 * Scope is tables, views and columns only; sequences, functions and default privileges are not checked.
 */
export type QueryClient = { query: (text: string) => Promise<{ rows: Array<Record<string, unknown>> }> }

export type RlsCheckResult = { ok: boolean; missingRoles: string[]; tablesWithoutRls: string[]; exposedGrants: string[] }

const EXPOSED_ROLES = ['anon', 'authenticated']

const EXISTING_ROLES = `SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') ORDER BY 1`

const TABLES_WITHOUT_RLS = `
SELECT c.relname AS table_name
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
ORDER BY 1`

// has_table_privilege also counts grants made to PUBLIC; column grants need has_column_privilege, checked per column.
const EXPOSED_GRANTS = `
SELECT r.rolname AS grantee, c.relname AS table_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_roles r ON r.rolname IN ('anon', 'authenticated')
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND (
    has_table_privilege(r.oid, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
    OR EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
        AND has_column_privilege(r.oid, c.oid, a.attnum, 'SELECT, INSERT, UPDATE, REFERENCES')
    )
  )
ORDER BY 1, 2`

export async function checkRowLevelSecurity(client: QueryClient): Promise<RlsCheckResult> {
  const roles = await client.query(EXISTING_ROLES)
  const present = new Set(roles.rows.map((row) => String(row.rolname)))
  const missingRoles = EXPOSED_ROLES.filter((role) => !present.has(role))
  const withoutRls = await client.query(TABLES_WITHOUT_RLS)
  const grants = await client.query(EXPOSED_GRANTS)
  const tablesWithoutRls = withoutRls.rows.map((row) => String(row.table_name))
  const exposedGrants = grants.rows.map((row) => `${row.grantee} on ${row.table_name}`)
  // A missing role would make the grant check pass vacuously, so it fails the check.
  const ok = missingRoles.length === 0 && tablesWithoutRls.length === 0 && exposedGrants.length === 0
  return { ok, missingRoles, tablesWithoutRls, exposedGrants }
}
