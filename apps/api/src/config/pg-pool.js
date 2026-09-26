import pg from 'pg'
import { stripBackticks, toPgPlaceholders } from './sql.js'

const { Pool } = pg

function isWriteStatement(sql) {
  return /^\s*(INSERT|UPDATE|DELETE|REPLACE)/i.test(sql)
}

function isInsertStatement(sql) {
  return /^\s*INSERT\b/i.test(sql)
}

function extractInsertId(rows) {
  if (!rows?.length) return 0
  const row = rows[0]
  for (const key of Object.keys(row)) {
    if (/(_id|Id)$/i.test(key) && row[key] != null) return Number(row[key])
  }
  const first = Object.values(row)[0]
  return first != null && Number.isFinite(Number(first)) ? Number(first) : 0
}

function wrapResult(sql, result) {
  if (!isWriteStatement(sql)) {
    return [result.rows, result]
  }
  const header = {
    insertId: isInsertStatement(sql) ? extractInsertId(result.rows) : 0,
    affectedRows: result.rowCount ?? 0,
    rowCount: result.rowCount ?? 0,
    rows: result.rows,
  }
  return [header, result]
}

function prepareSql(sql) {
  return toPgPlaceholders(stripBackticks(sql))
}

async function runOnClient(client, sql, values = []) {
  const prepared = prepareSql(sql)
  let querySql = prepared
  if (isInsertStatement(prepared) && !/\bRETURNING\b/i.test(prepared)) {
    querySql = `${prepared.replace(/;?\s*$/, '')} RETURNING *`
  }
  const result = await client.query(querySql, values)
  return wrapResult(sql, result)
}

function wrapClient(client) {
  return {
    execute: (sql, values = []) => runOnClient(client, sql, values),
    query: (sql, values = []) => runOnClient(client, sql, values),
    ping: async () => {
      await client.query('SELECT 1')
    },
    beginTransaction: async () => {
      await client.query('BEGIN')
    },
    commit: async () => {
      await client.query('COMMIT')
    },
    rollback: async () => {
      await client.query('ROLLBACK')
    },
    release: () => client.release(),
  }
}

/**
 * mysql2-shaped pool over node-postgres for gradual repository migration.
 * Supports execute/query/getConnection with `?` placeholders and insertId/affectedRows.
 */
export function createPgPool(connectionString, connectionLimit) {
  const pool = new Pool({
    connectionString,
    max: connectionLimit,
    idleTimeoutMillis: process.env.VERCEL ? 1000 : 10000,
    connectionTimeoutMillis: 10000,
    options: '-c timezone=Asia/Manila',
  })

  return {
    driver: 'postgres',
    execute: (sql, values = []) => runOnClient(pool, sql, values),
    query: (sql, values = []) => runOnClient(pool, sql, values),
    getConnection: async () => wrapClient(await pool.connect()),
    end: () => pool.end(),
    _pg: pool,
  }
}
