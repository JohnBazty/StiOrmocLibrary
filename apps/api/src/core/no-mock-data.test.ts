import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const sourceRoot = fileURLToPath(new URL('..', import.meta.url))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|js)$/.test(entry.name) && !/\.test\.(ts|js)$/.test(entry.name) ? [path] : []
  })
}

test('mock-data.ts is deleted', () => {
  assert.equal(existsSync(join(sourceRoot, 'data', 'mock-data.ts')), false)
})

test('no non-test API source file imports data/mock-data', () => {
  const files = sourceFiles(sourceRoot)
  assert.ok(files.length > 50, `expected to scan the API source tree, found ${files.length} files`)
  const offenders = files.filter((file) => /data\/mock-data/.test(readFileSync(file, 'utf8')))
  assert.deepEqual(offenders, [])
})
