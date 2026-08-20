import mysql from 'mysql2/promise'
import { env } from './env.js'

/**
 * Shared MySQL pool for the modular monolith. Application queries must use
 * pool.execute(sql, values), which sends values as prepared-statement params.
 */
export const db = mysql.createPool({
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

export async function verifyDatabaseConnection() {
  const connection = await db.getConnection()
  try {
    await connection.ping()
  } finally {
    connection.release()
  }
}

