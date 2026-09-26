/**
 * Read-only inventory of the local MySQL source and Supabase Postgres target.
 * Prints table/column names, row counts, and numeric identity overlaps only.
 * No row values or connection secrets are printed.
 *
 * Run from the repository root: node tools/ai/audit-supabase-cutover.mjs
 */
import mysql from 'mysql2/promise'
import pg from 'pg'
import { env } from '../../apps/api/src/config/env.js'

if (env.db.driver !== 'postgres') {
  throw new Error('A Supabase DATABASE_URL is required for this audit.')
}

const mysqlConnection = await mysql.createConnection({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  connectTimeout: 10000,
})
const postgresConnection = new pg.Client({
  connectionString: env.db.connectionString,
  connectionTimeoutMillis: 10000,
})

function pgIdentifier(name) {
  return `"${name.replaceAll('"', '""')}"`
}

function topologicalOrder(names, foreignKeys) {
  const remaining = new Set(names)
  const order = []
  while (remaining.size) {
    const next = [...remaining].filter((table) => !foreignKeys.some(
      (fk) => fk.child === table && fk.parent !== table && remaining.has(fk.parent),
    ))
    if (!next.length) break
    next.sort()
    order.push(...next)
    for (const table of next) remaining.delete(table)
  }
  return { order, cycles: [...remaining] }
}

async function identityOverlap(table, idColumn, identityColumn) {
  const [source] = await mysqlConnection.query(
    'SELECT ?? AS id, ?? AS identity FROM ??',
    [idColumn, identityColumn, table],
  )
  const target = (await postgresConnection.query(
    `SELECT ${pgIdentifier(idColumn)} AS id, ${pgIdentifier(identityColumn)} AS identity FROM ${pgIdentifier(table)}`,
  )).rows
  const targetById = new Map(target.map((row) => [String(row.id), row.identity]))
  const targetByIdentity = new Map(target.map((row) => [row.identity, String(row.id)]))
  return {
    sameIdSameIdentity: source.filter((row) => targetById.get(String(row.id)) === row.identity).length,
    conflictingIds: source
      .filter((row) => targetById.has(String(row.id)) && targetById.get(String(row.id)) !== row.identity)
      .map((row) => row.id),
    existingIdentityDifferentId: source
      .filter((row) => targetByIdentity.has(row.identity) && targetByIdentity.get(row.identity) !== String(row.id))
      .map((row) => ({ sourceId: row.id, targetId: targetByIdentity.get(row.identity) })),
  }
}

try {
  await postgresConnection.connect()
  const [sourceTables] = await mysqlConnection.query(
    'SELECT TABLE_NAME AS name FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = ? ORDER BY TABLE_NAME',
    [env.db.database, 'BASE TABLE'],
  )
  const targetTables = (await postgresConnection.query(
    `SELECT table_name AS name FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  )).rows
  const targetNames = new Set(targetTables.map((table) => table.name))
  const [sourceColumns] = await mysqlConnection.query(
    'SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, DATA_TYPE AS data_type FROM information_schema.columns WHERE TABLE_SCHEMA = ?',
    [env.db.database],
  )
  const targetColumns = (await postgresConnection.query(
    `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default, identity_generation
     FROM information_schema.columns WHERE table_schema = current_schema()`,
  )).rows
  const sourceColumnsByTable = new Map()
  for (const column of sourceColumns) {
    if (!sourceColumnsByTable.has(column.table_name)) sourceColumnsByTable.set(column.table_name, new Map())
    sourceColumnsByTable.get(column.table_name).set(column.column_name, column)
  }
  const targetColumnsByTable = new Map()
  for (const column of targetColumns) {
    if (!targetColumnsByTable.has(column.table_name)) targetColumnsByTable.set(column.table_name, new Map())
    targetColumnsByTable.get(column.table_name).set(column.column_name, column)
  }

  const rowCounts = {}
  const columnGaps = {}
  const typePairs = {}
  for (const table of sourceTables) {
    const [sourceCount] = await mysqlConnection.query('SELECT COUNT(1) AS n FROM ??', [table.name])
    const targetCount = targetNames.has(table.name)
      ? (await postgresConnection.query(`SELECT COUNT(1)::int AS n FROM ${pgIdentifier(table.name)}`)).rows[0].n
      : null
    rowCounts[table.name] = { mysql: sourceCount[0].n, postgres: targetCount }
    if (sourceCount[0].n === 0 || !targetNames.has(table.name)) continue

    const sourceMap = sourceColumnsByTable.get(table.name) ?? new Map()
    const targetMap = targetColumnsByTable.get(table.name) ?? new Map()
    const missingInPostgres = [...sourceMap.keys()].filter((name) => !targetMap.has(name))
    const requiredMissingFromMySql = [...targetMap.values()]
      .filter((column) => !sourceMap.has(column.column_name)
        && column.is_nullable === 'NO'
        && column.column_default == null
        && column.identity_generation == null)
      .map((column) => column.column_name)
    if (missingInPostgres.length || requiredMissingFromMySql.length) {
      columnGaps[table.name] = { missingInPostgres, requiredMissingFromMySql }
    }
    for (const [name, sourceColumn] of sourceMap) {
      const targetColumn = targetMap.get(name)
      if (!targetColumn) continue
      const pair = `${sourceColumn.data_type} -> ${targetColumn.data_type}`
      typePairs[pair] = (typePairs[pair] ?? 0) + 1
    }
  }

  const migrations = (await postgresConnection.query(
    'SELECT migration_name FROM schema_migrations ORDER BY migration_name',
  )).rows.map((row) => row.migration_name)
  const backupSchemas = (await postgresConnection.query(`SELECT nspname FROM pg_namespace
    WHERE nspname LIKE 'mysql_cutover_backup_%' ORDER BY nspname`)).rows.map((row) => row.nspname)

  const foreignKeys = (await postgresConnection.query(
    `SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent
     FROM pg_constraint WHERE contype = 'f' AND connamespace = current_schema()::regnamespace`,
  )).rows
  const [sourceForeignKeys] = await mysqlConnection.query(
    `SELECT TABLE_NAME AS child, REFERENCED_TABLE_NAME AS parent
     FROM information_schema.key_column_usage
     WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [env.db.database],
  )
  const sourceOrder = topologicalOrder(sourceTables.map((table) => table.name), sourceForeignKeys)
  const targetOrder = topologicalOrder(targetTables.map((table) => table.name), foreignKeys)
  const [sourcePrimaryKeys] = await mysqlConnection.query(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
     FROM information_schema.key_column_usage
     WHERE TABLE_SCHEMA = ? AND CONSTRAINT_NAME = 'PRIMARY'
     ORDER BY TABLE_NAME, ORDINAL_POSITION`,
    [env.db.database],
  )
  const targetPrimaryKeys = (await postgresConnection.query(
    `SELECT tc.table_name, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_schema = tc.constraint_schema
      AND kcu.constraint_name = tc.constraint_name
     WHERE tc.table_schema = current_schema() AND tc.constraint_type = 'PRIMARY KEY'
     ORDER BY tc.table_name, kcu.ordinal_position`,
  )).rows
  const groupKeys = (rows) => Object.groupBy(rows, (row) => row.table_name)

  console.log(JSON.stringify({
    sourceTableCount: sourceTables.length,
    targetTableCount: targetTables.length,
    missingTables: sourceTables.map((table) => table.name).filter((name) => !targetNames.has(name)),
    nonemptySourceRows: Object.fromEntries(Object.entries(rowCounts).filter(([, count]) => count.mysql > 0)),
    columnGaps,
    typePairs,
    mysqlInsertionOrder: sourceOrder.order,
    mysqlForeignKeyCycles: sourceOrder.cycles,
    postgresInsertionOrder: targetOrder.order,
    postgresForeignKeyCycles: targetOrder.cycles,
    mysqlForeignKeyCount: sourceForeignKeys.length,
    postgresForeignKeyCount: foreignKeys.length,
    mysqlPrimaryKeys: Object.fromEntries(Object.entries(groupKeys(sourcePrimaryKeys)).map(
      ([table, rows]) => [table, rows.map((row) => row.column_name)],
    )),
    postgresPrimaryKeys: Object.fromEntries(Object.entries(groupKeys(targetPrimaryKeys)).map(
      ([table, rows]) => [table, rows.map((row) => row.column_name)],
    )),
    identityOverlap: {
      users: await identityOverlap('users', 'user_id', 'school_id'),
      accounts: await identityOverlap('accounts', 'account_id', 'school_id'),
      roles: await identityOverlap('roles', 'role_id', 'role_name'),
    },
    postgresMigrations: migrations,
    backupSchemas,
  }, null, 2))
} finally {
  await mysqlConnection.end()
  await postgresConnection.end()
}
