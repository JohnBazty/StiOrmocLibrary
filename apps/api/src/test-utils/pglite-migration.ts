import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const migrationsDir = new URL('../../../../database/supabase/', import.meta.url)

// Stub Supabase roles. `library_owner` is a plain owner (stricter than live `postgres`, which has BYPASSRLS).
// Only table default grants are modelled, so sequence and function revokes cannot be tested here.
// PGlite's own user is a superuser, which is what lets the helper `SET ROLE` to any of these.
const roleSetup = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE ROLE library_owner NOLOGIN;
  GRANT ALL ON SCHEMA public TO library_owner;
  GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  -- Supabase grants new public tables to these roles by default; without this a missing REVOKE would go unnoticed.
  ALTER DEFAULT PRIVILEGES FOR ROLE library_owner IN SCHEMA public
    GRANT ALL ON TABLES TO anon, authenticated, service_role;
`

export interface MigrationDb {
  queryAs(role: string, sql: string): Promise<{ rows: Array<Record<string, any>> }>
  close(): Promise<void>
}

/**
 * Runs ONE migration from database/supabase/ in an in-memory Postgres (PGlite).
 * `stubs` creates only the tables the migration needs; a full replay of every migration does not work
 * outside Supabase (storage schema, roles, live history), so each test brings its own stubs.
 * Stubs and the migration run as `library_owner`, so that role owns the tables.
 */
export async function runMigrationInPglite(fileName: string, stubs = ''): Promise<MigrationDb> {
  if (fileName !== basename(fileName)) throw new Error(`Migration must be a file name in database/supabase/: ${fileName}`)
  const sql = await readFile(new URL(fileName, migrationsDir), 'utf8')
  const db = new PGlite()
  try {
    await db.exec(roleSetup)
    await db.exec(`SET ROLE library_owner; ${stubs}`)
    await db.exec(sql)
    await db.exec('RESET ROLE')
  } catch (error) {
    await db.close()
    throw error
  }

  return {
    async queryAs(role, query) {
      await db.exec(`SET ROLE ${quoteIdent(role)}`)
      try {
        return await db.query<Record<string, any>>(query)
      } finally {
        await db.exec('RESET ROLE')
      }
    },
    close: () => db.close(),
  }
}

function quoteIdent(name: string) {
  return `"${name.replaceAll('"', '""')}"`
}
