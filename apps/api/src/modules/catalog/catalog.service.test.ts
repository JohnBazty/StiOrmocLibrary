import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { HttpError } from '../../core/http-error.ts'
import { createCatalogService } from './catalog.service.ts'

function fakePool() {
  const state = { began: 0, committed: 0, rolledBack: 0, released: 0, statements: [] as string[] }
  const connection = {
    async beginTransaction() { state.began += 1 },
    async commit() { state.committed += 1 },
    async rollback() { state.rolledBack += 1 },
    release() { state.released += 1 },
    async execute(sql: string) {
      state.statements.push(sql)
      if (sql.includes('SELECT physical_copy_id')) return [[]]
      if (sql.includes('SELECT title_id') && sql.includes('FROM titles')) return [[]]
      if (sql.includes('SELECT research_record_id')) return [[]]
      if (sql.includes('INSERT INTO titles')) return [{ insertId: 101 }]
      if (sql.includes('INSERT INTO physical_copies')) return [{ insertId: 202 }]
      if (sql.includes('INSERT INTO research_records')) return [{ insertId: 303 }]
      return [{ insertId: 1 }]
    },
  }
  return { state, database: { async getConnection() { return connection } } as unknown as Pool }
}

test('creates a book and physical copy in one committed transaction', async () => {
  const { state, database } = fakePool()
  const service = createCatalogService(database)
  const result = await service.createBookEntry({
    title: 'Clean Code', author: 'Robert C. Martin', isbn: '9780132350884', publicationYear: 2008,
    barcode: 'BC-100', accessionNumber: 'ACC-100', shelfLocation: 'IT-A1', condition: 'Good',
  })

  assert.deepEqual(result, { titleId: 101, physicalCopyId: 202, createdTitle: true, addedCopyToExistingTitle: false })
  assert.equal(state.committed, 1)
  assert.equal(state.rolledBack, 0)
  assert.equal(state.released, 1)
})

test('creates a thesis title, authors, and research metadata transactionally', async () => {
  const { state, database } = fakePool()
  const result = await createCatalogService(database).createThesisEntry({
    title: 'Smart Campus Library', author: 'Maria Santos', adviser: 'Dr. Ana Cruz', year: 2026,
    abstract: 'This research evaluates a secure smart campus library management platform.',
    researchCode: 'TH-BSIT-2026-009', department: 'BS Information Technology',
  })
  assert.deepEqual(result, { titleId: 101, researchRecordId: 303, physicalCopyId: null })
  assert.equal(state.committed, 1)
  assert.equal(state.rolledBack, 0)
})

test('returns the module 422 error before opening a transaction when mandatory fields are missing', async () => {
  let connectionRequested = false
  const service = createCatalogService({ getConnection: async () => { connectionRequested = true; throw new Error('must not run') } } as unknown as Pool)
  await assert.rejects(service.createBookEntry({ title: '' }), (error: unknown) => {
    assert.ok(error instanceof HttpError)
    assert.equal(error.status, 422)
    assert.equal(error.code, 'CATALOG_VALIDATION_FAILED')
    return true
  })
  assert.equal(connectionRequested, false)
})

