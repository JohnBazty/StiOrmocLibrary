import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { createBulkBookService } from './bulk-book.service.ts'

function fakePool() {
  const state = { commits: 0, rollbacks: 0, materialInserts: 0, copyInserts: 0, copyParameters: [] as unknown[][] }
  const connection = {
    async beginTransaction() {}, async commit() { state.commits += 1 }, async rollback() { state.rollbacks += 1 }, release() {},
    async execute(sql: string, parameters: unknown[] = []) {
      if (sql.includes('SELECT category_id FROM categories')) return [[{ category_id: 2 }]]
      if (sql.includes('FROM titles t')) return [[{ title_id: 44, title: 'Clean Code', author_name: 'Robert C. Martin', category_id: 2 }]]
      if (sql.includes('INSERT INTO barcode_sequences')) return [{ affectedRows: 1 }]
      if (sql.includes('SELECT `last_value` FROM barcode_sequences')) return [[{ last_value: 141 }]]
      if (sql.includes('UPDATE barcode_sequences')) return [{ affectedRows: 1 }]
      if (sql.includes('INSERT INTO materials')) { state.materialInserts += 1; return [{ insertId: 100 + state.materialInserts }] }
      if (sql.includes('INSERT INTO physical_copies')) { state.copyInserts += 1; state.copyParameters.push(parameters); return [{ insertId: 200 + state.copyInserts }] }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  return { state, database: { getConnection: async () => connection } as unknown as Pool }
}

const body = { title: 'Clean Code', author: 'Robert C. Martin', isbn: '9780132350884', category_id: 2, shelf_location: 'Shelf A-1', number_of_copies: 2 }

test('creates two isolated copies under one title with consecutive institutional identities', async () => {
  const { state, database } = fakePool()
  const renderer = async (payload: { title_id: number; barcode: string; accession_number: string }) => ({
    trackingJson: JSON.stringify(payload), qrCodeData: `data:image/png;base64,${payload.barcode}`, barcodeImageData: `data:image/svg+xml;base64,${payload.barcode}`,
  })
  const result = await createBulkBookService(database, () => new Date('2026-08-23T08:00:00+08:00'), renderer).addBulk(body)
  assert.equal(result.titleId, 44)
  assert.equal(result.numberOfCopies, 2)
  assert.deepEqual(result.copies.map((copy) => copy.barcode), ['STIORMOC2026000142', 'STIORMOC2026000143'])
  assert.deepEqual(result.copies.map((copy) => copy.accessionNumber), ['STI-ACC-2026-000142', 'STI-ACC-2026-000143'])
  assert.ok(result.copies.every((copy) => copy.titleId === 44))
  assert.equal(state.materialInserts, 2); assert.equal(state.copyInserts, 2); assert.equal(state.commits, 1); assert.equal(state.rollbacks, 0)
  assert.match(String(state.copyParameters[0][3]), /^data:image\/png;base64,STIORMOC/)
})

test('rejects a typed location that is not currently managed by a category', async () => {
  const state = { rollbacks: 0 }
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() { state.rollbacks += 1 }, release() {},
    async execute(sql: string) {
      if (sql.includes('WHERE category_id = ?')) return [[{ category_id: 2 }]]
      if (sql.includes('WHERE shelf_location = ?')) return [[]]
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  const database = { getConnection: async () => connection } as unknown as Pool
  await assert.rejects(
    createBulkBookService(database).addBulk({ ...body, shelf_location: 'Unknown Room' }),
    (error: unknown) => (error as { code?: string }).code === 'BOOK_LOCATION_NOT_FOUND',
  )
  assert.equal(state.rollbacks, 1)
})

test('rejects an ISBN already assigned to different catalog metadata before creating a copy', async () => {
  const state = { rollbacks: 0, copyInserts: 0 }
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() { state.rollbacks += 1 }, release() {},
    async execute(sql: string) {
      if (sql.includes('SELECT category_id FROM categories')) return [[{ category_id: 2 }]]
      if (sql.includes('FROM titles t')) return [[{ title_id: 44, title: 'Existing Book', author_name: 'Existing Author', category_id: 2 }]]
      if (sql.includes('INSERT INTO physical_copies')) { state.copyInserts += 1; return [{ insertId: 1 }] }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  const database = { getConnection: async () => connection } as unknown as Pool
  await assert.rejects(
    createBulkBookService(database).addBulk(body),
    (error: unknown) => (error as { code?: string }).code === 'ISBN_CATALOG_CONFLICT',
  )
  assert.equal(state.copyInserts, 0)
  assert.equal(state.rollbacks, 1)
})
