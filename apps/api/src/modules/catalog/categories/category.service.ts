import type { Pool } from 'mysql2/promise'
import { db } from '../../../config/db.js'
import { HttpError } from '../../../core/http-error.ts'
import {
  findCategoryByName, insertCategory, listCategoriesWithCounts, lockActiveCategoryAssets,
  lockCategory, lockReassignmentCategories, reassignAndDeleteCategory, updateCategoryRow,
} from './category.repository.ts'
import { parseCategoryId, validateCategoryPayload } from './category.validation.ts'

function validationError(errors: Record<string, string>) {
  return new HttpError(422, 'CATEGORY_VALIDATION_FAILED', 'The category contains invalid fields.', { errors })
}

function duplicateError(categoryName: string) {
  return new HttpError(422, 'CATEGORY_NAME_ALREADY_EXISTS', 'A category with this name already exists.', {
    errors: { categoryName: `"${categoryName}" is already registered.` },
  })
}

function isDuplicateKey(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY'
}

export function createCategoryService(database: Pool = db) {
  return {
    list: () => listCategoriesWithCounts(database),

    async create(body: unknown) {
      const validation = validateCategoryPayload(body)
      if (!validation.isValid) throw validationError(validation.errors)
      if (await findCategoryByName(database, validation.data.categoryName)) throw duplicateError(validation.data.categoryName)
      try {
        const categoryId = await insertCategory(database, validation.data)
        return { categoryId, ...validation.data }
      } catch (error) {
        if (isDuplicateKey(error)) throw duplicateError(validation.data.categoryName)
        throw error
      }
    },

    async update(categoryIdValue: unknown, body: unknown) {
      const parsed = parseCategoryId(categoryIdValue)
      if (parsed.value === null) throw new HttpError(422, 'INVALID_CATEGORY_ID', parsed.error as string)
      const categoryId = parsed.value
      const validation = validateCategoryPayload(body)
      if (!validation.isValid) throw validationError(validation.errors)
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        if (!await lockCategory(connection, categoryId)) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'The requested category does not exist.')
        if (await findCategoryByName(connection, validation.data.categoryName, categoryId)) throw duplicateError(validation.data.categoryName)
        await updateCategoryRow(connection, categoryId, validation.data)
        await connection.commit()
        return { categoryId, ...validation.data }
      } catch (error) {
        await connection.rollback()
        if (isDuplicateKey(error)) throw duplicateError(validation.data.categoryName)
        throw error
      } finally { connection.release() }
    },

    async remove(categoryIdValue: unknown) {
      const parsed = parseCategoryId(categoryIdValue)
      if (parsed.value === null) throw new HttpError(422, 'INVALID_CATEGORY_ID', parsed.error as string)
      const categoryId = parsed.value
      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const category = await lockCategory(connection, categoryId)
        if (!category) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'The requested category does not exist.')
        const counts = await lockActiveCategoryAssets(connection, categoryId)
        if (counts.books + counts.theses + counts.legacyAssets > 0) {
          throw new HttpError(422, 'CATEGORY_HAS_ASSIGNED_MATERIALS', 'Cannot delete category while materials are assigned to it.', {
            categoryId, categoryName: category.category_name,
            totalBooksCount: counts.books, totalThesisCount: counts.theses, legacyAssetsCount: counts.legacyAssets,
          })
        }
        await connection.execute('DELETE FROM categories WHERE category_id = ?', [categoryId])
        await connection.commit()
        return { categoryId, deleted: true }
      } catch (error) {
        await connection.rollback()
        throw error
      } finally { connection.release() }
    },

    async reassign(body: unknown) {
      const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}
      const oldId = parseCategoryId(input.oldCategoryId ?? input.old_category_id, 'oldCategoryId')
      const targetId = parseCategoryId(input.targetCategoryId ?? input.target_category_id, 'targetCategoryId')
      const errors: Record<string, string> = {}
      if (oldId.error) errors.oldCategoryId = oldId.error
      if (targetId.error) errors.targetCategoryId = targetId.error
      if (oldId.value !== null && oldId.value === targetId.value) errors.targetCategoryId = 'Target category must be different from the old category.'
      if (Object.keys(errors).length) throw validationError(errors)

      const connection = await database.getConnection()
      try {
        await connection.beginTransaction()
        const categories = await lockReassignmentCategories(connection, oldId.value as number, targetId.value as number)
        if (!categories.some((category) => Number(category.category_id) === oldId.value)) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'The old category does not exist.')
        if (!categories.some((category) => Number(category.category_id) === targetId.value)) throw new HttpError(404, 'TARGET_CATEGORY_NOT_FOUND', 'The target category does not exist.')
        const result = await reassignAndDeleteCategory(connection, oldId.value as number, targetId.value as number)
        await connection.commit()
        return { oldCategoryId: oldId.value, targetCategoryId: targetId.value, deletedOldCategory: true, ...result }
      } catch (error) {
        await connection.rollback()
        throw error
      } finally { connection.release() }
    },
  }
}

export const categoryService = createCategoryService()

