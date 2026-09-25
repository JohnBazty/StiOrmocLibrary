import pg from 'pg'
import { env } from '../src/config/env.js'

const client = new pg.Client({ connectionString: env.db.connectionString })
await client.connect()
try {
  const tables = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  )
  for (const row of tables.rows) {
    await client.query(`DROP TABLE IF EXISTS "${row.tablename}" CASCADE`)
  }
  console.log(`Dropped ${tables.rows.length} public tables.`)
} finally {
  await client.end()
}
