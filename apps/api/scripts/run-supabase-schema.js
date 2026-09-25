import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { env } from '../src/config/env.js'

/**
 * Apply ordered SQL files under database/supabase/ to the DATABASE_URL Postgres.
 * Usage: node scripts/run-supabase-schema.js [optional-single-filename]
 */
if (env.db.driver !== 'postgres' || !env.db.connectionString) {
  throw new Error('Set DATABASE_URL (postgresql://…) in apps/api/.env before running Supabase schema scripts.')
}

const supabaseDir = fileURLToPath(new URL('../../../database/supabase/', import.meta.url))
const onlyFile = process.argv[2]

function splitSql(source) {
  const statements = []
  let buffer = ''
  let inDollar = false
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!inDollar && trimmed.startsWith('--')) {
      buffer += `${line}\n`
      continue
    }
    if (trimmed.includes('$$')) inDollar = !inDollar
    buffer += `${line}\n`
    if (!inDollar && buffer.trimEnd().endsWith(';')) {
      const statement = buffer.trim()
      if (statement && !statement.split('\n').every((l) => l.trim().startsWith('--') || !l.trim())) {
        statements.push(statement)
      }
      buffer = ''
    }
  }
  if (buffer.trim()) statements.push(buffer.trim())
  return statements.filter((s) => {
    const body = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '').trim()
    return Boolean(body)
  })
}

const client = new pg.Client({
  connectionString: env.db.connectionString,
  options: '-c timezone=Asia/Manila',
})

await client.connect()
try {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_name VARCHAR(191) PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)

  const files = onlyFile
    ? [onlyFile]
    : (await fs.readdir(supabaseDir))
        .filter((name) => /^\d+_.+\.sql$/i.test(name) || /^\d{3}_.+\.sql$/i.test(name))
        .filter((name) => name.endsWith('.sql'))
        .sort()

  if (!files.length) throw new Error(`No SQL files found in ${supabaseDir}`)

  for (const fileName of files) {
    const fullPath = path.join(supabaseDir, fileName)
    const source = await fs.readFile(fullPath, 'utf8')
    const checksum = createHash('sha256').update(source).digest('hex')
    const applied = await client.query(
      'SELECT checksum FROM schema_migrations WHERE migration_name = $1 LIMIT 1',
      [fileName],
    )
    if (applied.rows.length) {
      if (applied.rows[0].checksum !== checksum) {
        throw new Error(`Applied file ${fileName} changed. Restore original or add a new numbered file.`)
      }
      console.log(`Already applied: ${fileName}`)
      continue
    }

    const statements = splitSql(source)
    for (let index = 0; index < statements.length; index += 1) {
      try {
        await client.query(statements[index])
      } catch (error) {
        throw new Error(`${fileName}, statement ${index + 1} failed: ${error.message}`, { cause: error })
      }
    }
    await client.query(
      'INSERT INTO schema_migrations (migration_name, checksum) VALUES ($1, $2)',
      [fileName, checksum],
    )
    console.log(`Applied: ${fileName} (${statements.length} statements)`)
  }
  console.log(`Supabase schema run complete: ${files.length} file(s) checked.`)
} finally {
  await client.end()
}
