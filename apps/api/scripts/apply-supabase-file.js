import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { env } from '../src/config/env.js'

const fileName = process.argv[2] || '001_from_baseline.sql'
const supabaseDir = fileURLToPath(new URL('../../../database/supabase/', import.meta.url))
const fullPath = `${supabaseDir}${fileName}`
const source = fs.readFileSync(fullPath, 'utf8')
const checksum = createHash('sha256').update(source).digest('hex')

function splitSql(sql) {
  const statements = []
  let buffer = ''
  let inDollar = false
  for (const line of sql.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!inDollar && trimmed.startsWith('--')) {
      buffer += `${line}\n`
      continue
    }
    if (trimmed.includes('$$')) inDollar = !inDollar
    buffer += `${line}\n`
    if (!inDollar && buffer.trimEnd().endsWith(';')) {
      const statement = buffer.trim()
      if (statement) statements.push(statement)
      buffer = ''
    }
  }
  if (buffer.trim()) statements.push(buffer.trim())
  return statements.filter((s) => {
    const body = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '').trim()
    return Boolean(body)
  })
}

const client = new pg.Client({ connectionString: env.db.connectionString })
await client.connect()
try {
  const stmts = splitSql(source)
  for (let i = 0; i < stmts.length; i += 1) {
    try {
      await client.query(stmts[i])
      console.log(`ok ${i + 1}/${stmts.length}`)
    } catch (error) {
      console.error(`FAIL ${i + 1}: ${error.message}`)
      console.error(stmts[i].slice(-500))
      process.exitCode = 1
      break
    }
  }
  if (!process.exitCode) {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name VARCHAR(191) PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`)
    await client.query(
      `INSERT INTO schema_migrations (migration_name, checksum) VALUES ($1, $2)
       ON CONFLICT (migration_name) DO UPDATE SET checksum = EXCLUDED.checksum`,
      [fileName, checksum],
    )
    console.log(`Recorded ${fileName}`)
  }
} finally {
  await client.end()
}
