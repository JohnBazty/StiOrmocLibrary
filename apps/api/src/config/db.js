import mysql from 'mysql2/promise'
import { env } from './env.js'
import { createPgPool } from './pg-pool.js'

/**
 * Shared database pool for the modular monolith.
 * - When DATABASE_URL is set (postgresql://…), uses Supabase/Postgres via `pg`.
 * - Otherwise falls back to local MySQL via mysql2 (rollback / offline).
 *
 * Application queries must use pool.execute(sql, values) with `?` placeholders.
 */
export const db = env.db.driver === 'postgres'
  ? createPgPool(env.db.connectionString, env.db.connectionLimit)
  : mysql.createPool({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.database,
      waitForConnections: true,
      connectionLimit: env.db.connectionLimit,
      queueLimit: 0,
      charset: 'utf8_general_ci',
      timezone: '+08:00',
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    })

export const dbDriver = env.db.driver

export async function verifyDatabaseConnection() {
  if (dbDriver === 'postgres') {
    await db.execute('SELECT 1 AS ok', [])
    return
  }
  const connection = await db.getConnection()
  try {
    await connection.ping()
  } finally {
    connection.release()
  }
}
