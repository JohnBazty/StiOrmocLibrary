import pg from 'pg'
import { env } from '../src/config/env.js'
import { checkSchemaReadiness } from '../src/core/schema-readiness.ts'
import { db } from '../src/config/db.js'

const client = new pg.Client({ connectionString: env.db.connectionString })
await client.connect()
try {
  const tables = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1`,
  )
  console.log('tables:', tables.rows.map((r) => r.tablename).join(', '))
} finally {
  await client.end()
}

const readiness = await checkSchemaReadiness(db)
console.log(JSON.stringify(readiness, null, 2))
await db.end?.()
process.exit(readiness.ready ? 0 : 2)
