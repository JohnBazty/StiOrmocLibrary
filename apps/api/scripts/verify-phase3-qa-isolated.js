// Real Postgres + Storage verification without committing catalog/cache mutations.
// Inner service transactions use real savepoints in a rollback-only outer trial.
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { db, dbDriver } from '../src/config/db.js'
assert.equal(dbDriver, 'postgres')
const original = { execute: db.execute.bind(db), getConnection: db.getConnection.bind(db), end: db.end.bind(db) }
const tables = { accounts:'account_id', users:'user_id', titles:'title_id', physical_copies:'physical_copy_id', materials:'material_id', borrow_transactions:'transaction_id', catalog_title_details:'title_id', catalog_locations:'location_id', catalog_resource_types:'type_id', catalog_programs:'program_id', catalog_courses:'course_id', catalog_import_batches:'batch_id', catalog_import_rows:'import_row_id', collection_age_status:'title_id', collection_review_alerts:'alert_id' }
async function fingerprints() {
  const result = {}
  for (const [table, pk] of Object.entries(tables)) {
    const [rows] = await original.execute(`SELECT * FROM ${table} ORDER BY ${pk}`)
    result[table] = createHash('sha256').update(JSON.stringify(rows)).digest('hex')
  }
  return result
}
let connection
const before = await fingerprints(), prefix = `QA3-${randomUUID()}`.toUpperCase()
const previousPrefix = process.env.PHASE3_QA_ACTOR_PREFIX
const previousRollback = process.env.PHASE3_QA_ROLLBACK_ONLY
try {
  connection = await original.getConnection()
  await connection.beginTransaction()
  let counter = 0
  db.execute = connection.execute.bind(connection)
  db.getConnection = async () => {
    const savepoint = `qa3_${++counter}`
    return { execute: connection.execute.bind(connection),
      beginTransaction: () => connection.execute(`SAVEPOINT ${savepoint}`),
      commit: () => connection.execute(`RELEASE SAVEPOINT ${savepoint}`),
      rollback: async () => { await connection.execute(`ROLLBACK TO SAVEPOINT ${savepoint}`); await connection.execute(`RELEASE SAVEPOINT ${savepoint}`) },
      release() {},
    }
  }
  db.end = async () => {}
  process.env.PHASE3_QA_ACTOR_PREFIX = prefix
  process.env.PHASE3_QA_ROLLBACK_ONLY = '1'
  for (const role of ['Librarian','Staff','Admin','Student','Faculty']) {
    await db.execute("INSERT INTO accounts(school_id,password_hash,role,account_status) VALUES (?,?,?,'Active')", [`${prefix}-${role}`, randomUUID(), role])
  }
  console.log('All five permission roles use uncommitted disposable identities; service writes are rollback-only.')
  await import('./verify-revision-phase3.js')
} finally {
  if (previousPrefix === undefined) delete process.env.PHASE3_QA_ACTOR_PREFIX
  else process.env.PHASE3_QA_ACTOR_PREFIX = previousPrefix
  if (previousRollback === undefined) delete process.env.PHASE3_QA_ROLLBACK_ONLY
  else process.env.PHASE3_QA_ROLLBACK_ONLY = previousRollback
  db.execute = original.execute; db.getConnection = original.getConnection; db.end = original.end
  try {
    if (connection) { try { await connection.rollback() } finally { connection.release() } }
    const after = await fingerprints()
    for (const table of Object.keys(tables)) assert.equal(after[table], before[table], `Existing ${table} changed during rollback-only QA`)
    console.log('ROLLBACK VERIFIED: all 15 protected source/cache tables match their original full-row fingerprints.')
  } finally { await original.end() }
}
