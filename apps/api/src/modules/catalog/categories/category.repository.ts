import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import type { CategoryInput } from './category.validation.ts'

export type CategoryRecord = {
  categoryId: number
  categoryName: string
  shelfLocation: string
  totalBooksCount: number
  totalThesisCount: number
  createdAt: Date | string
  updatedAt: Date | string | null
}

export async function listCategoriesWithCounts(database: Pool): Promise<CategoryRecord[]> {
  const [rows] = await database.execute<RowDataPacket[]>(
    `SELECT c.category_id, c.category_name, c.shelf_location, c.created_at, c.updated_at,
            COALESCE(book_totals.total_books_count, 0) AS total_books_count,
            COALESCE(thesis_totals.total_thesis_count, 0) AS total_thesis_count
       FROM categories c
       LEFT JOIN (
         SELECT t.category_id, COUNT(pc.physical_copy_id) AS total_books_count
           FROM titles t
           JOIN physical_copies pc ON pc.title_id = t.title_id
          WHERE t.record_type = 'Book' AND t.lifecycle_status = 'Active'
            AND pc.lifecycle_status = 'Active'
          GROUP BY t.category_id
       ) book_totals ON book_totals.category_id = c.category_id
       LEFT JOIN (
         SELECT t.category_id, COUNT(rr.research_record_id) AS total_thesis_count
           FROM titles t
           JOIN research_records rr ON rr.title_id = t.title_id
          WHERE t.record_type = 'Research/Thesis' AND t.lifecycle_status = 'Active'
            AND rr.viewing_status <> 'Archived'
          GROUP BY t.category_id
       ) thesis_totals ON thesis_totals.category_id = c.category_id
      ORDER BY c.category_name ASC`,
  )
  return rows.map((row) => ({
    categoryId: Number(row.category_id),
    categoryName: String(row.category_name),
    shelfLocation: String(row.shelf_location),
    totalBooksCount: Number(row.total_books_count ?? 0),
    totalThesisCount: Number(row.total_thesis_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export async function findCategoryByName(database: Pool | PoolConnection, categoryName: string, excludedId: number | null = null) {
  const [rows] = await database.execute<RowDataPacket[]>(
    `SELECT category_id, category_name FROM categories
      WHERE category_name = ? AND (? IS NULL OR category_id <> ?) LIMIT 1`,
    [categoryName, excludedId, excludedId],
  )
  return rows[0] ?? null
}

export async function insertCategory(database: Pool, input: CategoryInput) {
  const [result] = await database.execute<ResultSetHeader>(
    `INSERT INTO categories (category_name, shelf_location, created_at)
     VALUES (?, ?, NOW())`,
    [input.categoryName, input.shelfLocation],
  )
  return result.insertId
}

export async function lockCategory(connection: PoolConnection, categoryId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT category_id, category_name, shelf_location
       FROM categories WHERE category_id = ? LIMIT 1 FOR UPDATE`, [categoryId],
  )
  return rows[0] ?? null
}

export async function updateCategoryRow(connection: PoolConnection, categoryId: number, input: CategoryInput) {
  await connection.execute<ResultSetHeader>(
    `UPDATE categories SET category_name = ?, shelf_location = ?, updated_at = NOW()
      WHERE category_id = ?`, [input.categoryName, input.shelfLocation, categoryId],
  )
}

export async function lockActiveCategoryAssets(connection: PoolConnection, categoryId: number) {
  const [bookRows] = await connection.execute<RowDataPacket[]>(
    `SELECT pc.physical_copy_id
       FROM titles t JOIN physical_copies pc ON pc.title_id = t.title_id
      WHERE t.category_id = ? AND t.record_type = 'Book'
        AND t.lifecycle_status = 'Active' AND pc.lifecycle_status = 'Active'
      FOR UPDATE`, [categoryId],
  )
  const [thesisRows] = await connection.execute<RowDataPacket[]>(
    `SELECT rr.research_record_id
       FROM titles t JOIN research_records rr ON rr.title_id = t.title_id
      WHERE t.category_id = ? AND t.record_type = 'Research/Thesis'
        AND t.lifecycle_status = 'Active' AND rr.viewing_status <> 'Archived'
      FOR UPDATE`, [categoryId],
  )
  const [legacyRows] = await connection.execute<RowDataPacket[]>(
    `SELECT m.material_id
       FROM materials m
       LEFT JOIN physical_copies pc ON pc.material_id = m.material_id
      WHERE m.category_id = ? AND pc.physical_copy_id IS NULL
      FOR UPDATE`, [categoryId],
  )
  return { books: bookRows.length, theses: thesisRows.length, legacyAssets: legacyRows.length }
}

export async function lockReassignmentCategories(connection: PoolConnection, oldCategoryId: number, targetCategoryId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT category_id, category_name FROM categories
      WHERE category_id IN (?, ?) ORDER BY category_id ASC FOR UPDATE`,
    [oldCategoryId, targetCategoryId],
  )
  return rows
}

export async function reassignAndDeleteCategory(connection: PoolConnection, oldCategoryId: number, targetCategoryId: number) {
  const [titleResult] = await connection.execute<ResultSetHeader>(
    `UPDATE titles SET category_id = ?, row_version = row_version + 1, updated_at = NOW()
      WHERE category_id = ?`, [targetCategoryId, oldCategoryId],
  )
  const [legacyResult] = await connection.execute<ResultSetHeader>(
    `UPDATE materials SET category_id = ?, updated_at = NOW() WHERE category_id = ?`,
    [targetCategoryId, oldCategoryId],
  )
  await connection.execute<ResultSetHeader>('DELETE FROM categories WHERE category_id = ?', [oldCategoryId])
  return { reassignedTitles: titleResult.affectedRows, reassignedLegacyMaterials: legacyResult.affectedRows }
}

