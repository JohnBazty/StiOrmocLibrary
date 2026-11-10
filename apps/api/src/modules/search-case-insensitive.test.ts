import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'

// Postgres LIKE is case-sensitive (MySQL's collation was not), so SQL in the API must use ILIKE.
const srcDir = new URL('../', import.meta.url)
const sourceFiles = readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
  .filter(file => /\.(ts|js)$/.test(file) && !/\.test\.(ts|js)$/.test(file) && !file.endsWith('.d.ts'))

test('API source uses ILIKE, never case-sensitive LIKE', () => {
  assert.ok(sourceFiles.length > 50, 'expected to scan the API source tree')
  const offenders = sourceFiles.filter(file => /(?<![I\w])LIKE\b/.test(readFileSync(new URL(file.replaceAll('\\', '/'), srcDir), 'utf8')))
  assert.deepEqual(offenders, [])
})
