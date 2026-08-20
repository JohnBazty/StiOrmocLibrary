import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { env } from '../src/config/env.js'

const schemaPath = fileURLToPath(new URL('../../../database/mysql56-schema.sql', import.meta.url))

function splitSqlScript(source) {
  const statements = []
  let delimiter = ';'
  let buffer = ''

  for (const line of source.split(/\r?\n/)) {
    const delimiterMatch = line.trim().match(/^DELIMITER\s+(.+)$/i)
    if (delimiterMatch) {
      const uncommentedBuffer = buffer.replace(/^\s*--.*$/gm, '').trim()
      if (uncommentedBuffer) throw new Error('Unexpected SQL content before DELIMITER directive.')
      buffer = ''
      delimiter = delimiterMatch[1]
      continue
    }

    buffer += `${line}\n`
    if (buffer.trimEnd().endsWith(delimiter)) {
      const statement = buffer.trimEnd().slice(0, -delimiter.length).trim()
      if (statement) statements.push(statement)
      buffer = ''
    }
  }

  if (buffer.trim()) statements.push(buffer.trim())
  return statements
}

const connection = await mysql.createConnection({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  charset: 'utf8_general_ci',
  timezone: '+08:00',
})

try {
  const source = await fs.readFile(schemaPath, 'utf8')
  const statements = splitSqlScript(source)

  for (let index = 0; index < statements.length; index += 1) {
    try {
      await connection.query(statements[index])
    } catch (error) {
      throw new Error(`Schema statement ${index + 1} failed: ${error.sqlMessage || error.message}`, { cause: error })
    }
  }

  const [tableRows] = await connection.query(
    `SELECT COUNT(*) AS table_count
     FROM information_schema.tables
     WHERE table_schema = ?`,
    [env.db.database],
  )
  const [triggerRows] = await connection.query(
    `SELECT COUNT(*) AS trigger_count
     FROM information_schema.triggers
     WHERE trigger_schema = ?`,
    [env.db.database],
  )

  console.log(`Schema ready: ${tableRows[0].table_count} tables and ${triggerRows[0].trigger_count} triggers.`)
} finally {
  await connection.end()
}
