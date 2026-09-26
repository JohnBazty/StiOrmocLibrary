import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { HttpError } from '../../../core/http-error.ts'
import { createCategoryService } from './category.service.ts'
import { findCategoryByName } from './category.repository.ts'

test('category name lookup does not send an untyped nullable parameter', async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = []
  const database = { async execute(sql: string, values: unknown[]) { calls.push({ sql, values }); return [[]] } } as unknown as Pool
  await findCategoryByName(database, 'Programming')
  await findCategoryByName(database, 'Programming', 7)
  assert.deepEqual(calls.map((call) => call.values), [['Programming'], ['Programming', 7]])
  assert.doesNotMatch(calls[0].sql, /IS NULL/)
  assert.match(calls[1].sql, /category_id <> \?/)
})

test('creates a unique category with prepared values', async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = []
  const database = {
    async execute(sql: string, values: unknown[]) {
      calls.push({ sql, values })
      if (sql.includes('SELECT category_id')) return [[]]
      if (sql.includes('FROM floor_plan_shelves')) return [[{ id: 4, label: 'Shelf A-1' }]]
      return [{ insertId: 14, affectedRows: 1 }]
    },
  } as unknown as Pool
  const result = await createCategoryService(database).create({ categoryName: 'Programming', shelfLocation: 'Shelf A-1' })
  assert.equal(result.categoryId, 14)
  assert.deepEqual(calls[2].values, ['Programming', 'Shelf A-1', 1, 1])
  assert.match(calls[2].sql, /INSERT INTO categories/)
})

test('rejects a category shelf that is not managed in Category Management', async () => {
  const database = {
    async execute(sql: string) {
      if (sql.includes('FROM categories')) return [[]]
      if (sql.includes('FROM floor_plan_shelves')) return [[]]
      throw new Error(`Unexpected statement: ${sql}`)
    },
  } as unknown as Pool
  await assert.rejects(createCategoryService(database).create({ categoryName: 'Programming', shelfLocation: 'Typed shelf' }), (error: unknown) => {
    assert.ok(error instanceof HttpError)
    assert.equal(error.code, 'CATEGORY_SHELF_NOT_MANAGED')
    assert.deepEqual(error.details, { errors: { shelfLocation: 'Select one of the managed shelves in Category Management.' } })
    return true
  })
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

test('translates a PostgreSQL duplicate category into a clear validation error', async () => {
  const database = {
    async execute(sql: string) {
      if (sql.includes('FROM categories')) return [[]]
      if (sql.includes('FROM floor_plan_shelves')) return [[{ id: 1, label: 'Shelf A-1', column_count: 2, row_count: 2 }]]
      throw Object.assign(new Error('duplicate key'), { code: '23505' })
    },
  } as unknown as Pool
  await assert.rejects(createCategoryService(database).create({ categoryName: 'Programming', shelfLocation: 'Shelf A-1' }), (error: unknown) => {
    assert.ok(error instanceof HttpError)
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
      if (sql.includes('WHERE category_id IN')) return [[{ category_id: 3, shelf_location: 'Old shelf' }, { category_id: 9, shelf_location: 'Shelf 1A' }]]
      if (sql.includes('FROM floor_plan_shelves')) return [[{ id: 1, label: 'Shelf 1A' }]]
      if (sql.includes('SELECT pc.physical_copy_id')) return [[{ physical_copy_id: 1, shelf_location: 'F-A' }]]
      if (sql.includes('SELECT ri.research_inventory_id')) return [[]]
      if (sql.includes('UPDATE titles')) return [{ affectedRows: 6 }]
      if (sql.includes('UPDATE materials')) return [{ affectedRows: 2 }]
      if (sql.includes('UPDATE physical_copies')) return [{ affectedRows: 1 }]
      if (sql.includes('UPDATE research_inventory')) return [{ affectedRows: 0 }]
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

test('saving a category synchronizes every active book and research copy to its managed shelf', async () => {
  const state = { committed: 0, rolledBack: 0, statements: [] as string[] }
  const connection = {
    async beginTransaction() {}, async commit() { state.committed += 1 }, async rollback() { state.rolledBack += 1 }, release() {},
    async execute(sql: string) {
      state.statements.push(sql)
      if (sql.includes('FROM categories WHERE category_id')) return [[{ category_id: 7, category_name: 'Action', shelf_location: 'F-A' }]]
      if (sql.includes('category_name = ?')) return [[]]
      if (sql.includes('FROM floor_plan_shelves')) return [[{ id: 5, label: 'SHELF 1A' }]]
      if (sql.includes('SELECT pc.physical_copy_id')) return [[{ physical_copy_id: 1, shelf_location: 'F-A' }, { physical_copy_id: 2, shelf_location: 'SHELF 1A' }]]
      if (sql.includes('SELECT ri.research_inventory_id')) return [[{ research_inventory_id: 8, shelf_location: 'Old research shelf' }]]
      if (sql.includes('INSERT INTO floor_plan_events')) return [{ insertId: 1 }]
      if (sql.startsWith('UPDATE') || sql.includes('UPDATE ')) return [{ affectedRows: 1 }]
      throw new Error(`Unexpected statement: ${sql}`)
    },
  }
  const result = await createCategoryService({ getConnection: async () => connection } as unknown as Pool).update(7, { categoryName: 'Action', shelfLocation: 'SHELF 1A' }, 1)
  assert.equal(result.bookCopies, 2)
  assert.equal(result.movedBookCopies, 1)
  assert.equal(result.researchCopies, 1)
  assert.equal(result.movedResearchCopies, 1)
  assert.equal(state.committed, 1)
  assert.equal(state.rolledBack, 0)
  assert.ok(state.statements.some((sql) => sql.includes('UPDATE physical_copies')))
  assert.ok(state.statements.some((sql) => sql.includes('UPDATE research_inventory')))
  assert.ok(state.statements.some((sql) => sql.includes('INSERT INTO floor_plan_events')))
})
