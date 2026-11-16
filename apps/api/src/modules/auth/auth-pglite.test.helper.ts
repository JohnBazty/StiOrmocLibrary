import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import type { Pool, PoolConnection } from '../../config/db.js'
import { toPgPlaceholders } from '../../config/sql.js'

const migration = (name: string) => readFileSync(new URL(`../../../../../database/supabase/${name}`, import.meta.url), 'utf8')

/** A real Postgres (PGlite) with the login-session tables, behind the app's `?`-placeholder Pool shape. */
export async function createAuthTestDatabase() {
  const pg = new PGlite()
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;')
  // Minimal stand-ins for the tables 029 references; only the columns the auth code reads.
  await pg.exec(`CREATE TABLE users (user_id BIGSERIAL PRIMARY KEY, account_status TEXT NOT NULL DEFAULT 'Active', email TEXT,
    full_name TEXT, auth_version INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ);
    CREATE TABLE accounts (account_id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(user_id), school_id TEXT NOT NULL,
    role TEXT NOT NULL, account_status TEXT NOT NULL DEFAULT 'Active', auth_version INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ);
    CREATE TABLE academic_terms (academic_term_id BIGSERIAL PRIMARY KEY);`)
  for (const file of ['029_october16_revisions.sql', '032_login_devices.sql', '039_mobile_refresh_tokens.sql']) await pg.exec(migration(file))
  const execute = async (sql: string, values: unknown[] = []) => {
    const result = await pg.query(toPgPlaceholders(sql), values)
    const write = /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)
    return write ? [{ affectedRows: result.affectedRows ?? 0, rows: result.rows }, result] : [result.rows, result]
  }
  const connection = { execute, query: execute, beginTransaction: () => pg.exec('BEGIN'), commit: () => pg.exec('COMMIT'), rollback: () => pg.exec('ROLLBACK'), release() {} } as unknown as PoolConnection
  const pool = { execute, query: execute, getConnection: async () => connection } as unknown as Pool
  return { pg, pool, connection }
}

/** One Active Student account (synthetic school id) and one client='mobile' session row. */
export async function seedMobileSession(pg: PGlite, authVersion = 2) {
  const { rows: [account] } = await pg.query<{ account_id: number }>(
    "INSERT INTO accounts(school_id,role,auth_version) VALUES ('TEST0001','Student',$1) RETURNING account_id", [authVersion])
  const sessionId = randomUUID()
  await pg.query("INSERT INTO library_login_sessions(session_id,account_id,auth_version,client) VALUES ($1,$2,$3,'mobile')", [sessionId, account.account_id, authVersion])
  return { accountId: Number(account.account_id), sessionId, authVersion }
}
