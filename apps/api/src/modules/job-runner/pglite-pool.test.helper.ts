import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import type { Pool } from '../../config/db.js'
import { toPgPlaceholders } from '../../config/sql.js'

/** A real Postgres (PGlite) behind the app's `?`-placeholder Pool shape, for SQL tests. */
export async function createJobTestDatabase() {
  const pg = new PGlite()
  await pg.exec(readFileSync(new URL('../../../../../database/supabase/019_durable_job_runner.sql', import.meta.url), 'utf8'))
  await pg.exec(`CREATE TABLE admin_notifications (admin_notification_id BIGSERIAL PRIMARY KEY, event_type TEXT NOT NULL,
    message_title TEXT NOT NULL, message_body TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT NOW())`)
  const execute = async (sql: string, values: unknown[] = []) => {
    const result = await pg.query(toPgPlaceholders(sql), values)
    const write = /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)
    return write ? [{ affectedRows: result.affectedRows ?? 0, rows: result.rows }, result] : [result.rows, result]
  }
  const connection = { execute, query: execute, beginTransaction: () => pg.exec('BEGIN'), commit: () => pg.exec('COMMIT'), rollback: () => pg.exec('ROLLBACK'), release() {} }
  const pool = { execute, query: execute, getConnection: async () => connection } as unknown as Pool
  return { pg, pool }
}
