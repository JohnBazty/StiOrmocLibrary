import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { db } from '../../config/db.js'
import { commitImport } from './catalog-enhancements.service.ts'

afterEach(() => mock.restoreAll())

test('leaves previously failed rows out of selection and remaining work', async () => {
  const queries: string[] = []
  mock.method(db, 'execute', async (sql: string) => {
    queries.push(sql)
    const excludesErrors = sql.includes('error_text IS NULL')
    if (sql.includes('COUNT(*)')) return [[{ total: excludesErrors ? 0 : 1 }], []]
    return [excludesErrors ? [] : [{ import_row_id: 83 }], []]
  })
  mock.method(db, 'getConnection', async () => { throw new Error('A saved error must not be retried') })
  const result = await commitImport(1, 5)
  assert.deepEqual(result, { imported: 0, remaining: 0, errors: [] })
  assert.equal(queries.length, 2)
})

test('does not import a row that acquires a save error before its lock is taken', async () => {
  let commits = 0
  mock.method(db, 'execute', async (sql: string) => sql.includes('COUNT(*)') ? [[{ total: 0 }], []] : [[{ import_row_id: 83 }], []])
  mock.method(db, 'getConnection', async () => ({
    async beginTransaction() {}, async rollback() {}, async commit() { commits++ }, release() {},
    async execute(sql: string) {
      if (sql.includes('FROM accounts')) return [[{ role: 'Librarian', account_status: 'Active' }], []]
      if (sql.includes('catalog_import_batches')) return [[{ batch_id: 1 }], []]
      if (sql.includes('SELECT * FROM catalog_import_rows')) return [[{ status: 'Ready', error_text: 'An accession already exists.' }], []]
      throw new Error('A failed row must not write catalog data')
    },
  }))
  assert.deepEqual(await commitImport(1, 5), { imported: 0, remaining: 0, errors: [] })
  assert.equal(commits, 1)
})
