import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { env } from '../src/config/env.js'

const migrationsDirectory = fileURLToPath(new URL('../../../database/migrations/', import.meta.url))
const fileName = process.argv[2]
if (fileName && (path.basename(fileName) !== fileName || !fileName.endsWith('.sql'))) {
  throw new Error('Migration must be one .sql filename from database/migrations.')
}

function splitSql(source) {
  const statements = []
  let buffer = ''
  for (const line of source.split(/\r?\n/)) {
    buffer += `${line}\n`
    if (buffer.trimEnd().endsWith(';')) {
      const statement = buffer.trimEnd().slice(0, -1).trim()
      if (statement) statements.push(statement)
      buffer = ''
    }
  }
  if (buffer.trim()) statements.push(buffer.trim())
  return statements
}

const connection = await mysql.createConnection({
  host: env.db.host, port: env.db.port, user: env.db.user, password: env.db.password,
  database: env.db.database, charset: 'utf8mb4_unicode_ci', timezone: '+08:00',
})

try {
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_name VARCHAR(191) NOT NULL,
    checksum CHAR(64) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (migration_name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8`)

  const migrationFiles = fileName
    ? [fileName]
    : (await fs.readdir(migrationsDirectory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()

  if (!migrationFiles.length) throw new Error('No SQL migrations were found.')

  for (const migrationFile of migrationFiles) {
    const source = await fs.readFile(path.join(migrationsDirectory, migrationFile), 'utf8')
    const checksum = createHash('sha256').update(source).digest('hex')
    const [appliedRows] = await connection.execute(
      'SELECT checksum FROM schema_migrations WHERE migration_name = ? LIMIT 1', [migrationFile],
    )
    if (appliedRows.length) {
      if (appliedRows[0].checksum !== checksum) {
        throw new Error(`Applied migration ${migrationFile} has changed. Restore the original file and create a new migration.`)
      }
      console.log(`Already applied: ${migrationFile}`)
      continue
    }

    for (const [index, statement] of splitSql(source).entries()) {
      try { await connection.query(statement) }
      catch (error) { throw new Error(`${migrationFile}, statement ${index + 1} failed: ${error.sqlMessage ?? error.message}`, { cause: error }) }
    }
    await connection.execute(
      'INSERT INTO schema_migrations (migration_name, checksum) VALUES (?, ?)', [migrationFile, checksum],
    )
    console.log(`Applied: ${migrationFile}`)
  }
  console.log(`Migration run complete: ${migrationFiles.length} file(s) checked.`)
} finally {
  await connection.end()
}
