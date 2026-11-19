import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { db } from '../../config/db.js'
import { commitImport, reviewImport } from './catalog-enhancements.service.ts'

for (const scenario of [
  { name: 'explicit import compartment', position: { shelfColumn: 2, shelfRow: 1 }, categoryShelf: 'Shelf A', column: 2, row: 1 },
  { name: 'category default compartment', position: {}, categoryShelf: 'Shelf A', column: 2, row: 3 },
  { name: 'another shelf defaults to its first compartment', position: {}, categoryShelf: 'Shelf B', column: 1, row: 1 },
]) test(`a blocked ${scenario.name} import stays ready and retries without duplicate holdings`, async () => {
  const statements: string[] = []
  const state = { rollbacks: 0, commits: 0, rowStatus: 'Ready' }
  const data = { title: 'Sample book', author: 'Sample author', isbn: '', edition: '', publisher: '', publicationYear: '', copyrightYear: '', pages: '', copies: '2', missingCopies: '', accessions: '', barcodes: '', callNumber: '', categoryId: 1, location: 'Shelf A', locationId: 1, programId: null, generateAccessions: true, ...scenario.position }
  const execute = async (sql: string) => {
    statements.push(sql)
    if (sql.includes('pg_advisory_xact_lock')) return [[]]
    if (sql.includes('FROM accounts')) return [[{ role: 'Librarian', account_status: 'Active' }]]
    if (sql.includes('SELECT import_row_id FROM catalog_import_rows')) return [[{ import_row_id: 4 }]]
    if (sql.includes('SELECT batch_id FROM catalog_import_batches')) return [[{ batch_id: 1 }]]
    if (sql.includes('SELECT * FROM catalog_import_rows')) return [[{ import_row_id: 4, batch_id: 1, status: state.rowStatus, decision: 'new', data_json: data }]]
    if (sql.includes('SELECT * FROM catalog_locations')) return [[{ location_id: 1, name: 'Shelf A', column_count: 2, row_count: 3, default_capacity: 5 }]]
    if (sql.includes('FROM categories c')) return [[{ category_id: 1, shelf_location: scenario.categoryShelf, shelf_column: 2, shelf_row: 3, shelf_id: 1, column_count: 2, row_count: 3 }]]
    if (sql.includes('FROM catalog_locations') || sql.includes('FROM categories')) return [[{ location_id: 1, category_id: 1 }]]
    if (sql.includes('FROM catalog_location_capacities')) return [[]]
    if (sql.includes(') AS used')) return [[{ used: 4 }]]
    if (sql.includes('COUNT(*) AS total FROM catalog_import_rows')) return [[{ total: 1 }]]
    if (sql.includes('UPDATE catalog_import_rows SET error_text')) return [{ affectedRows: 1 }]
    throw new Error(`Unexpected import query: ${sql}`)
  }
  const connection = { execute, beginTransaction: async () => {}, commit: async () => { state.commits += 1 }, rollback: async () => { state.rollbacks += 1 }, release() {} }
  mock.method(db, 'execute', execute as never)
  mock.method(db, 'getConnection', (async () => connection) as never)
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await commitImport(1, 7)
      assert.equal(result.imported, 0)
      assert.equal(result.remaining, 1)
      assert.equal(result.errors[0].rowId, 4)
      assert.equal(result.errors[0].code, 'SHELF_CAPACITY_EXCEEDED')
      const details = result.errors[0].details as { remaining: number; shelfColumn: number; shelfRow: number }
      assert.equal(details.remaining, 1)
      assert.equal(details.shelfColumn, scenario.column)
      assert.equal(details.shelfRow, scenario.row)
      assert.match(result.errors[0].message, /1 spaces remaining.*adding 2 copies/)
    }
    assert.equal(state.rowStatus, 'Ready')
    assert.equal(state.rollbacks, 2)
    assert.equal(state.commits, 0)
    assert.equal(statements.some(sql => /INSERT INTO (titles|physical_copies|materials|barcode_sequences)/.test(sql)), false)
    assert.equal(statements.some(sql => sql.includes("SET status='Imported'")), false)
  } finally { mock.restoreAll() }
})

test('rejects Research/Thesis categories in book import review and commit with a plain message', async () => {
  const data = { title: 'Sample book', author: 'Sample author', isbn: '', edition: '', publisher: '', publicationYear: '', copyrightYear: '', pages: '', copies: '1', missingCopies: '', accessions: '', barcodes: '', callNumber: '', categoryId: 25, location: 'Shelf A', locationId: 1, programId: null, generateAccessions: true }
  const execute = async (sql: string) => {
    if (sql.includes('pg_advisory_xact_lock')) return [[]]
    if (sql.includes('FROM accounts')) return [[{ role: 'Librarian', account_status: 'Active' }]]
    if (sql.includes('SELECT import_row_id FROM catalog_import_rows')) return [[{ import_row_id: 9 }]]
    if (sql.includes('SELECT batch_id FROM catalog_import_batches')) return [[{ batch_id: 1 }]]
    if (sql.includes('SELECT * FROM catalog_import_rows')) return [[{ import_row_id: 9, batch_id: 1, status: 'Ready', row_version: 1, decision: 'new', data_json: data }]]
    if (sql.includes('FROM categories')) return [[{ category_id: 25, record_kind: 'Research/Thesis' }]]
    if (sql.includes('FROM catalog_locations')) return [[{ location_id: 1 }]]
    if (sql.includes('COUNT(*) AS total FROM catalog_import_rows')) return [[{ total: 0 }]]
    if (sql.includes('UPDATE catalog_import_rows SET error_text')) return [{ affectedRows: 1 }]
    throw new Error(`Unexpected import query: ${sql}`)
  }
  const connection = { execute, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} }
  mock.method(db, 'execute', execute as never)
  mock.method(db, 'getConnection', (async () => connection) as never)
  try {
    await assert.rejects(reviewImport(9, { version: 1, decision: 'new', data }, 7), /Choose a book category/)
    const committed = await commitImport(1, 7)
    assert.equal(committed.imported, 0)
    assert.equal(committed.errors[0]?.rowId, 9)
    assert.match(committed.errors[0]?.message ?? '', /Choose a book category/)
  } finally { mock.restoreAll() }
})
