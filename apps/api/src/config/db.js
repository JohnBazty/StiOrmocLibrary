import { env } from './env.js'
import { createPgPool } from './pg-pool.js'

/**
 * Shared Postgres (Supabase) pool for the modular monolith.
 * Application queries must use pool.execute(sql, values) with `?` placeholders.
 */
export const db = createPgPool(env.db.connectionString, env.db.connectionLimit)

export async function verifyDatabaseConnection() {
  await db.execute('SELECT 1 AS ok', [])
}
