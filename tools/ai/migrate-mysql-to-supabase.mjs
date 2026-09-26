/**
 * One-time local MySQL -> hosted Supabase data cutover.
 * Default is a full transactional dry run. Pass --apply to commit after validation.
 * The source is read in one consistent, read-only snapshot. Hosted data is backed
 * up in a private schema inside the same transaction before any committed change.
 * Never prints row values or connection credentials.
 */
import mysql from 'mysql2/promise'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { env } from '../../apps/api/src/config/env.js'

const apply = process.argv.includes('--apply')
if (env.db.driver !== 'postgres' || !env.db.connectionString) {
  throw new Error('A Supabase DATABASE_URL is required.')
}

const source = await mysql.createConnection({
  host: env.db.host, port: env.db.port, user: env.db.user,
  password: env.db.password, database: env.db.database,
  dateStrings: true, supportBigNumbers: true, bigNumberStrings: true,
  connectTimeout: 10000,
})
const target = new pg.Client({
  connectionString: env.db.connectionString,
  options: '-c timezone=Asia/Manila',
  connectionTimeoutMillis: 10000,
})
const quote = (s) => `"${s.replaceAll('"', '""')}"`
const ignoredTables = new Set(['schema_migrations', 'auth_sessions'])
const authorityTables = new Set([
  'barcode_sequences', 'fine_policy_versions', 'floor_plan_state',
  'library_operating_schedule', 'library_profile_settings',
  'printing_service_settings',
])
const key = (value) => String(value)
const idMaps = new Map()
let sourceTransaction = false
let targetTransaction = false

function topologicalOrder(names, foreignKeys) {
  const remaining = new Set(names)
  const order = []
  while (remaining.size) {
    const ready = [...remaining].filter((name) => !foreignKeys.some(
      (fk) => fk.child_table === name && fk.parent_table !== name && remaining.has(fk.parent_table),
    )).sort()
    if (!ready.length) throw new Error(`Source foreign-key cycle: ${[...remaining].join(', ')}`)
    order.push(...ready)
    ready.forEach((name) => remaining.delete(name))
  }
  return order
}

async function metadata() {
  const [tables] = await source.query(`SELECT TABLE_NAME AS name FROM information_schema.tables
    WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`, [env.db.database])
  const [columns] = await source.query(`SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
    FROM information_schema.columns WHERE TABLE_SCHEMA = ? ORDER BY ORDINAL_POSITION`, [env.db.database])
  const [primaryKeys] = await source.query(`SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
    FROM information_schema.key_column_usage WHERE TABLE_SCHEMA = ? AND CONSTRAINT_NAME = 'PRIMARY'
    ORDER BY ORDINAL_POSITION`, [env.db.database])
  const [foreignKeys] = await source.query(`SELECT TABLE_NAME AS child_table, COLUMN_NAME AS child_column,
    REFERENCED_TABLE_NAME AS parent_table, REFERENCED_COLUMN_NAME AS parent_column
    FROM information_schema.key_column_usage
    WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`, [env.db.database])
  const pgColumns = (await target.query(`SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'`)).rows
  const pgNames = new Set(pgColumns.map((r) => r.table_name))
  const pgColumnNames = new Map()
  for (const row of pgColumns) {
    if (!pgColumnNames.has(row.table_name)) pgColumnNames.set(row.table_name, new Set())
    pgColumnNames.get(row.table_name).add(row.column_name)
  }
  const sourceColumns = new Map()
  for (const row of columns) {
    if (!sourceColumns.has(row.table_name)) sourceColumns.set(row.table_name, [])
    sourceColumns.get(row.table_name).push(row.column_name)
  }
  const pk = new Map()
  for (const row of primaryKeys) {
    if (pk.has(row.table_name)) throw new Error(`Composite primary key unsupported: ${row.table_name}`)
    pk.set(row.table_name, row.column_name)
  }
  for (const { name } of tables) {
    if (!pgNames.has(name)) throw new Error(`Target table missing: ${name}`)
    if (!pk.has(name)) throw new Error(`Source primary key missing: ${name}`)
    // Some dormant source tables have columns introduced by MySQL-only work.
    // Validate populated tables after taking the source snapshot.
  }
  return { order: topologicalOrder(tables.map((t) => t.name), foreignKeys), sourceColumns, pgColumnNames, pk, foreignKeys }
}

async function snapshotSource(order) {
  await source.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
  await source.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY')
  sourceTransaction = true
  const rows = new Map()
  for (const table of order) {
    if (ignoredTables.has(table)) continue
    const [result] = await source.query('SELECT * FROM ??', [table])
    rows.set(table, result)
  }
  return rows
}

async function existingRows(order, pk) {
  const rows = new Map()
  for (const table of order) {
    if (ignoredTables.has(table)) continue
    const result = await target.query(`SELECT * FROM public.${quote(table)}`)
    rows.set(table, result.rows)
    if (!result.fields.some((field) => field.name === pk.get(table))) {
      throw new Error(`Target primary key missing: ${table}.${pk.get(table)}`)
    }
  }
  return rows
}

function buildMaps(order, sourceRows, targetRows, pk) {
  for (const table of order) {
    if (ignoredTables.has(table)) continue
    const pkCol = pk.get(table)
    const input = sourceRows.get(table)
    const existing = targetRows.get(table)
    const occupied = new Set(existing.map((row) => key(row[pkCol])))
    const sourceIds = new Set(input.map((row) => key(row[pkCol])))
    const allIds = [...occupied, ...sourceIds]
    let next = allIds.every((id) => /^\d+$/.test(id))
      ? allIds.reduce((max, id) => Math.max(max, Number(id)), 0) + 1 : null
    const map = new Map()
    const byRole = table === 'roles' ? new Map(existing.map((row) => [row.role_name, row[pkCol]])) : null
    const byPrice = table === 'print_pricing_rules'
      ? new Map(existing.map((row) => [`${row.print_type}\0${row.paper_size}`, row[pkCol]])) : null
    for (const row of input) {
      const oldId = key(row[pkCol])
      let newId = row[pkCol]
      if (byRole?.has(row.role_name)) newId = byRole.get(row.role_name)
      else if (byPrice?.has(`${row.print_type}\0${row.paper_size}`)) {
        newId = byPrice.get(`${row.print_type}\0${row.paper_size}`)
      } else if (occupied.has(oldId) && !authorityTables.has(table)) {
        if (next === null) throw new Error(`Cannot allocate nonnumeric ID in ${table}`)
        while (occupied.has(key(next)) || sourceIds.has(key(next))) next += 1
        newId = next++
      }
      if (map.has(oldId)) throw new Error(`Duplicate source primary key in ${table}`)
      map.set(oldId, newId)
      occupied.add(key(newId))
    }
    idMaps.set(table, map)
  }
}

async function makeBackup(order) {
  const suffix = new Date().toISOString().replaceAll(/[-:.TZ]/g, '').slice(0, 14)
  const schema = `mysql_cutover_backup_${suffix}`
  await target.query(`CREATE SCHEMA ${quote(schema)}`)
  await target.query(`CREATE TABLE ${quote(schema)}.cutover_info (
    run_id UUID PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_name TEXT NOT NULL, note TEXT NOT NULL)`)
  await target.query(`INSERT INTO ${quote(schema)}.cutover_info (run_id, source_name, note)
    VALUES ($1, $2, $3)`, [randomUUID(), env.db.database,
    'Pre-cutover snapshot of every public base table; restore manually if required.'])
  for (const table of order) {
    await target.query(`CREATE TABLE ${quote(schema)}.${quote(table)} AS TABLE public.${quote(table)}`)
  }
  console.log(`Pre-cutover backup schema: ${schema}`)
  return schema
}

async function writeRows(order, sourceRows, targetRows, columns, pk, foreignKeys) {
  const summary = {}
  for (const table of order) {
    if (ignoredTables.has(table)) continue
    const tableSource = sourceRows.get(table)
    const pkCol = pk.get(table)
    const tableMap = idMaps.get(table)
    const existingIds = new Set(targetRows.get(table).map((row) => key(row[pkCol])))
    const childKeys = foreignKeys.filter((fk) => fk.child_table === table)
    const colNames = columns.get(table)
    let inserted = 0
    let updated = 0
    let reused = 0
    for (const row of tableSource) {
      const output = { ...row, [pkCol]: tableMap.get(key(row[pkCol])) }
      for (const fk of childKeys) {
        const value = row[fk.child_column]
        if (value === null || value === undefined) continue
        const parentMap = idMaps.get(fk.parent_table)
        if (!parentMap?.has(key(value))) {
          throw new Error(`Unmapped reference: ${table}.${fk.child_column} -> ${fk.parent_table}`)
        }
        output[fk.child_column] = parentMap.get(key(value))
      }
      const destId = key(output[pkCol])
      if (table === 'roles' && existingIds.has(destId)) {
        reused += 1
        continue
      }
      const canUpdate = authorityTables.has(table) || table === 'print_pricing_rules'
      if (existingIds.has(destId) && !canUpdate) {
        throw new Error(`Unexpected primary-key collision: ${table}.${pkCol}`)
      }
      const values = colNames.map((col) => output[col])
      if (existingIds.has(destId)) {
        const setCols = colNames.filter((col) => col !== pkCol && !(table === 'barcode_sequences' && col === 'last_value'))
        const setSql = setCols.map((col) => `${quote(col)} = $${colNames.indexOf(col) + 1}`)
        if (table === 'barcode_sequences' && colNames.includes('last_value')) {
          setSql.push(`last_value = GREATEST(public.${quote(table)}.last_value, EXCLUDED.last_value)`)
          const insertSql = `INSERT INTO public.${quote(table)} (${colNames.map(quote).join(', ')})
            VALUES (${colNames.map((_, i) => `$${i + 1}`).join(', ')})
            ON CONFLICT (${quote(pkCol)}) DO UPDATE SET ${setSql.join(', ')}`
          await target.query(insertSql, values)
        } else {
          const updateCols = colNames.filter((col) => col !== pkCol)
          const updateSql = `UPDATE public.${quote(table)} SET ${updateCols.map(
            (col) => `${quote(col)} = $${colNames.indexOf(col) + 1}`,
          ).join(', ')} WHERE ${quote(pkCol)} = $${colNames.indexOf(pkCol) + 1}`
          await target.query(updateSql, values)
        }
        updated += 1
      } else {
        await target.query(`INSERT INTO public.${quote(table)} (${colNames.map(quote).join(', ')})
          VALUES (${colNames.map((_, i) => `$${i + 1}`).join(', ')})`, values)
        inserted += 1
        existingIds.add(destId)
      }
    }
    summary[table] = { source: tableSource.length, inserted, updated, reused }
    console.log(`${table}: ${tableSource.length} source, ${inserted} inserted, ${updated} updated, ${reused} reused`)
  }
  return summary
}

async function verify(order, sourceRows, targetRows, pk, summary) {
  for (const table of order) {
    if (ignoredTables.has(table)) continue
    const expectedCount = targetRows.get(table).length + summary[table].inserted
    const actualCount = Number((await target.query(
      `SELECT COUNT(*) AS n FROM public.${quote(table)}`,
    )).rows[0].n)
    if (actualCount !== expectedCount) {
      throw new Error(`Row-count mismatch in ${table}: expected ${expectedCount}, got ${actualCount}`)
    }
    const ids = [...idMaps.get(table).values()].map(key)
    if (new Set(ids).size !== sourceRows.get(table).length) {
      throw new Error(`Identity mapping is not one-to-one in ${table}`)
    }
  }
  const broken = (await target.query(`SELECT conname FROM pg_constraint
    WHERE contype = 'f' AND connamespace = 'public'::regnamespace AND NOT convalidated`)).rows
  if (broken.length) throw new Error('Target has unvalidated foreign keys')
}

async function resetSequences(order, pk) {
  for (const table of order) {
    if (ignoredTables.has(table)) continue
    const idColumn = pk.get(table)
    const sequence = (await target.query('SELECT pg_get_serial_sequence($1, $2) AS name',
      [`public.${table}`, idColumn])).rows[0].name
    if (!sequence) continue
    await target.query(`SELECT setval($1::regclass, COALESCE((SELECT MAX(${quote(idColumn)})
      FROM public.${quote(table)}), 1), EXISTS (SELECT 1 FROM public.${quote(table)}))`, [sequence])
  }
}

try {
  await target.connect()
  const { order, sourceColumns, pgColumnNames, pk, foreignKeys } = await metadata()
  const sourceRows = await snapshotSource(order)
  for (const table of order) {
    if (!sourceRows.get(table)?.length) continue
    const missing = sourceColumns.get(table).filter((col) => !pgColumnNames.get(table).has(col))
    if (missing.length) throw new Error(`Target columns missing in ${table}: ${missing.join(', ')}`)
  }
  await target.query('BEGIN')
  targetTransaction = true
  await target.query('SET LOCAL lock_timeout = 10000')
  if (apply) {
    const previous = (await target.query(`SELECT nspname FROM pg_namespace
      WHERE nspname LIKE 'mysql_cutover_backup_%' LIMIT 1`)).rows
    if (previous.length) throw new Error('A prior cutover backup exists; refusing to apply twice.')
    // Readers remain available while inserts/updates are protected from races.
    await target.query(`LOCK TABLE ${order.map((table) => `public.${quote(table)}`).join(', ')}
      IN SHARE ROW EXCLUSIVE MODE NOWAIT`)
  }
  const targetRows = await existingRows(order, pk)
  buildMaps(order, sourceRows, targetRows, pk)
  if (apply) await makeBackup(order)
  const summary = await writeRows(order, sourceRows, targetRows, sourceColumns, pk, foreignKeys)
  await verify(order, sourceRows, targetRows, pk, summary)
  if (apply) {
    await resetSequences(order, pk)
    await target.query('COMMIT')
    targetTransaction = false
    console.log('Cutover committed and counts verified.')
  } else {
    await target.query('ROLLBACK')
    targetTransaction = false
    console.log('Dry run passed; all target changes rolled back.')
  }
} catch (error) {
  if (targetTransaction) await target.query('ROLLBACK')
  console.error(`Cutover failed safely: ${error.message}`)
  process.exitCode = 1
} finally {
  if (sourceTransaction) await source.query('ROLLBACK')
  await source.end()
  await target.end()
}
