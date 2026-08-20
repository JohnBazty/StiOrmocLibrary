import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { HttpError } from '../../../core/http-error.ts'
import { createCategoryService } from './category.service.ts'

test('creates a unique category with prepared values', async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = []
  const database = {
    async execute(sql: string, values: unknown[]) {
      calls.push({ sql, values })
      if (sql.includes('SELECT category_id')) return [[]]
      return [{ insertId: 14, affectedRows: 1 }]
    },
  } as unknown as Pool
  const result = await createCategoryService(database).create({ categoryName: 'Programming', shelfLocation: 'Shelf A-1' })
  assert.equal(result.categoryId, 14)
  assert.deepEqual(calls[1].values, ['Programming', 'Shelf A-1'])
  assert.match(calls[1].sql, /INSERT INTO categories/)
})

test('halts a duplicate category with the required 422 error', async () => {
  const database = { execute: async () => [[{ category_id: 2, category_name: 'Programming' }]] } as unknown as Pool
  await assert.rejects(createCategoryService(database).create({ categoryName: ' Programming ', shelfLocation: 'Aisle 3' }), (error: unknown) => {
    assert.ok(error instanceof HttpError)
    assert.equal(error.status, 422)
    assert.equal(error.code, 'CATEGORY_NAME_ALREADY_EXISTS')
    return true
  })
})

test('rolls back and preserves data when deleting a category with active materials', async () => {
  const state = { began: 0, committed: 0, rolledBack: 0, released: 0, statements: [] as string[] }
  const connection = {
    async beginTransaction() { state.began += 1 },
    async commit() { state.committed += 1 },
    async rollback() { state.rolledBack += 1 },
    release() { state.released += 1 },
    async execute(sql: string) {
      state.statements.push(sql)
      if (sql.includes('FROM categories WHERE category_id')) return [[{ category_id: 7, category_name: 'Database', shelf_location: 'Shelf B-1' }]]
      if (sql.includes('SELECT pc.physical_copy_id')) return [[{ physical_copy_id: 81 }]]
      if (sql.includes('SELECT rr.research_record_id')) return [[]]
      if (sql.includes('SELECT m.material_id')) return [[]]
      throw new Error(`Unexpected statement: ${sql}`)
    },
  }
  const database = { async getConnection() { return connection } } as unknown as Pool

  await assert.rejects(createCategoryService(database).remove(7), (error: unknown) => {
    assert.ok(error instanceof HttpError)
    assert.equal(error.status, 422)
    assert.equal(error.code, 'CATEGORY_HAS_ASSIGNED_MATERIALS')
    return true
  })
  assert.equal(state.began, 1)
  assert.equal(state.committed, 0)
  assert.equal(state.rolledBack, 1)
  assert.equal(state.released, 1)
  assert.equal(state.statements.some((sql) => /^DELETE FROM categories/.test(sql)), false)
})

test('reassigns title and legacy identifiers before deleting the old category in one transaction', async () => {
  const state = { committed: 0, rolledBack: 0, statements: [] as string[] }
  const connection = {
    async beginTransaction() {}, async commit() { state.committed += 1 }, async rollback() { state.rolledBack += 1 }, release() {},
    async execute(sql: string) {
      state.statements.push(sql)
      if (sql.includes('WHERE category_id IN')) return [[{ category_id: 3 }, { category_id: 9 }]]
      if (sql.includes('UPDATE titles')) return [{ affectedRows: 6 }]
      if (sql.includes('UPDATE materials')) return [{ affectedRows: 2 }]
      if (sql.includes('DELETE FROM categories')) return [{ affectedRows: 1 }]
      throw new Error(`Unexpected statement: ${sql}`)
    },
  }
  const result = await createCategoryService({ getConnection: async () => connection } as unknown as Pool).reassign({ oldCategoryId: 3, targetCategoryId: 9 })
  assert.equal(result.reassignedTitles, 6)
  assert.equal(result.reassignedLegacyMaterials, 2)
  assert.equal(state.committed, 1)
  assert.equal(state.rolledBack, 0)
  assert.ok(state.statements.findIndex((sql) => sql.includes('UPDATE titles')) < state.statements.findIndex((sql) => sql.includes('DELETE FROM categories')))
})

