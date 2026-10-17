/** Read-only before/after evidence for additive migration 029. Never exports school rows or credentials. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { db, dbDriver } from '../src/config/db.js'
import { checkSchemaReadiness } from '../src/core/schema-readiness.ts'
import { requireVerificationSender } from '../src/modules/auth/school-email.sender.ts'
import type { RowDataPacket } from 'mysql2/promise'

if (dbDriver !== 'postgres') throw new Error('This check targets the configured hosted Postgres database.')
const mode = process.argv[2]
if (!['before','after'].includes(mode)) throw new Error('Choose before or after.')
const tables = ['accounts','users','titles','physical_copies','borrow_transactions','reservations','print_requests']
try {
  const records: Record<string,{count:number;digest:string}> = {}
  for (const table of tables) {
    const [rows] = await db.execute<RowDataPacket[]>(`SELECT COUNT(*)::int AS count,md5(COALESCE(string_agg(digest,'' ORDER BY digest),'')) AS digest FROM (SELECT md5(row_to_json(t)::text) AS digest FROM ${table} t) checks`)
    records[table] = { count:Number(rows[0].count),digest:String(rows[0].digest) }
  }
  const [ledger] = await db.execute<RowDataPacket[]>('SELECT migration_name FROM schema_migrations ORDER BY migration_name')
  const readiness = await checkSchemaReadiness()
  let emailSender = 'not configured'
  try { emailSender = requireVerificationSender('disposable-check@ormoc.sti.edu.ph').provider } catch { /* Report availability without exposing configuration. */ }
  const evidence = { capturedAt:new Date().toISOString(),mode,records,migrations:ledger.map(row=>row.migration_name),readiness,emailSender }
  await mkdir('output',{recursive:true})
  await writeFile(`output/october16-schema-${mode}.json`,JSON.stringify(evidence,null,2))
  if (mode === 'after') {
    const before = JSON.parse(await readFile('output/october16-schema-before.json','utf8'))
    const changed = tables.filter(table=>JSON.stringify(before.records[table])!==JSON.stringify(records[table]))
    console.log(JSON.stringify({ready:readiness.ready,changedExistingTables:changed,migration029Applied:evidence.migrations.includes('029_october16_revisions.sql'),enrollment028Applied:evidence.migrations.includes('028_revision_phase2_enrollment.sql'),emailSender}))
    if (!readiness.ready || changed.length) process.exitCode = 1
  } else console.log(JSON.stringify({snapshotSaved:true,existingTables:tables.length,emailSender}))
} finally { await db.end() }
