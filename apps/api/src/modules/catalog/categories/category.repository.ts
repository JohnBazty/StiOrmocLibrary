import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { forUpdate, isPostgres } from '../../../config/sql-dialect.js'
import type { CategoryInput } from './category.validation.ts'

export type CategoryRecord = {
  categoryId: number
  categoryName: string
  shelfLocation: string
  shelfColumn: number
  shelfRow: number
  totalBooksCount: number
  totalThesisCount: number
  createdAt: Date | string
  updatedAt: Date | string | null
}

export async function listCategoriesWithCounts(database: Pool): Promise<CategoryRecord[]> {
  const [rows] = await database.execute<RowDataPacket[]>(
    `SELECT c.category_id, c.category_name, c.shelf_location, c.shelf_column, c.shelf_row, c.created_at, c.updated_at,
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
    shelfColumn: Number(row.shelf_column),
    shelfRow: Number(row.shelf_row),
    totalBooksCount: Number(row.total_books_count ?? 0),
    totalThesisCount: Number(row.total_thesis_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export async function findCategoryByName(database: Pool | PoolConnection, categoryName: string, excludedId: number | null = null) {
  const excludedClause = excludedId === null ? '' : ' AND category_id <> ?'
  const [rows] = await database.execute<RowDataPacket[]>(
    `SELECT category_id, category_name FROM categories
      WHERE category_name = ?${excludedClause} LIMIT 1`,
    excludedId === null ? [categoryName] : [categoryName, excludedId],
  )
  return rows[0] ?? null
}

export async function findManagedShelfByLabel(database: Pool | PoolConnection, shelfLocation: string) {
  const [rows] = await database.execute<RowDataPacket[]>(
    'SELECT id, label, column_count, row_count FROM floor_plan_shelves WHERE label = ? LIMIT 1',
    [shelfLocation],
  )
  return rows[0] ?? null
}

export async function lockManagedShelfByLabel(connection: PoolConnection, shelfLocation: string) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    'SELECT id, label, column_count, row_count FROM floor_plan_shelves WHERE label = ? LIMIT 1 FOR UPDATE',
    [shelfLocation],
  )
  return rows[0] ?? null
}

export async function synchronizeCategoryShelf(connection: PoolConnection, categoryId: number, shelfLocation: string, shelfColumn = 1, shelfRow = 1) {
  const [bookRows] = await connection.execute<RowDataPacket[]>(
    `SELECT pc.physical_copy_id, pc.shelf_location
       FROM titles t
       JOIN physical_copies pc ON pc.title_id = t.title_id
      WHERE t.category_id = ? AND t.record_type = 'Book'
        AND t.lifecycle_status = 'Active' AND pc.lifecycle_status = 'Active'
      ${forUpdate('pc')}`, [categoryId],
  )
  const [researchRows] = await connection.execute<RowDataPacket[]>(
    `SELECT ri.research_inventory_id, ri.shelf_location
       FROM titles t
       JOIN research_inventory ri ON ri.title_id = t.title_id
      WHERE t.category_id = ? AND t.record_type = 'Research/Thesis'
        AND t.lifecycle_status = 'Active' AND ri.lifecycle_status = 'Active'
      ${forUpdate('ri')}`, [categoryId],
  )
  await connection.execute(
    isPostgres
      ? `UPDATE physical_copies pc
            SET shelf_location = ?, shelf_column = ?, shelf_row = ?, updated_at = NOW()
           FROM titles t
          WHERE t.title_id = pc.title_id AND t.category_id = ? AND t.record_type = 'Book'
            AND t.lifecycle_status = 'Active' AND pc.lifecycle_status = 'Active'`
      : `UPDATE physical_copies pc
           JOIN titles t ON t.title_id = pc.title_id
            SET pc.shelf_location = ?, pc.shelf_column = ?, pc.shelf_row = ?, pc.updated_at = NOW()
          WHERE t.category_id = ? AND t.record_type = 'Book'
            AND t.lifecycle_status = 'Active' AND pc.lifecycle_status = 'Active'`,
    [shelfLocation, shelfColumn, shelfRow, categoryId],
  )
  await connection.execute(
    'UPDATE materials SET shelf_location = ?, updated_at = NOW() WHERE category_id = ?',
    [shelfLocation, categoryId],
  )
  await connection.execute(
    isPostgres
      ? `UPDATE research_inventory ri
            SET shelf_location = ?, shelf_column = ?, shelf_row = ?, updated_at = NOW(), row_version = ri.row_version + 1
           FROM titles t
          WHERE t.title_id = ri.title_id AND t.category_id = ? AND t.record_type = 'Research/Thesis'
            AND t.lifecycle_status = 'Active' AND ri.lifecycle_status = 'Active'`
      : `UPDATE research_inventory ri
           JOIN titles t ON t.title_id = ri.title_id
            SET ri.shelf_location = ?, ri.shelf_column = ?, ri.shelf_row = ?, ri.updated_at = NOW(), ri.row_version = ri.row_version + 1
          WHERE t.category_id = ? AND t.record_type = 'Research/Thesis'
            AND t.lifecycle_status = 'Active' AND ri.lifecycle_status = 'Active'`,
    [shelfLocation, shelfColumn, shelfRow, categoryId],
  )
  const distribution = (rows: RowDataPacket[]) => Object.entries(rows.reduce<Record<string, number>>((result, row) => {
    const previous = String(row.shelf_location || 'Unassigned')
    result[previous] = (result[previous] ?? 0) + 1
    return result
  }, {})).map(([shelf, count]) => ({ shelf, count }))
  return {
    bookCopies: bookRows.length,
    movedBookCopies: bookRows.filter((row) => row.shelf_location !== shelfLocation).length,
    researchCopies: researchRows.length,
    movedResearchCopies: researchRows.filter((row) => row.shelf_location !== shelfLocation).length,
    previousBookShelves: distribution(bookRows),
    previousResearchShelves: distribution(researchRows),
  }
}

export async function recordCategoryShelfEvent(connection: PoolConnection, actorAccountId: number | null, eventType: string, details: unknown) {
  if (!actorAccountId) return
  await connection.execute(
    'INSERT INTO floor_plan_events (account_id, event_type, details) VALUES (?, ?, ?)',
    [actorAccountId, eventType, JSON.stringify(details)],
  )
}

export async function insertCategory(database: Pool, input: CategoryInput) {
  const [result] = await database.execute<ResultSetHeader>(
    `INSERT INTO categories (category_name, shelf_location, shelf_column, shelf_row, created_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [input.categoryName, input.shelfLocation, input.shelfColumn, input.shelfRow],
  )
  return result.insertId
}

export async function lockCategory(connection: PoolConnection, categoryId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT category_id, category_name, shelf_location, shelf_column, shelf_row
       FROM categories WHERE category_id = ? LIMIT 1 FOR UPDATE`, [categoryId],
  )
  return rows[0] ?? null
}

export async function updateCategoryRow(connection: PoolConnection, categoryId: number, input: CategoryInput) {
  await connection.execute<ResultSetHeader>(
    `UPDATE categories SET category_name = ?, shelf_location = ?, shelf_column = ?, shelf_row = ?, updated_at = NOW()
      WHERE category_id = ?`, [input.categoryName, input.shelfLocation, input.shelfColumn, input.shelfRow, categoryId],
  )
}

export async function lockActiveCategoryAssets(connection: PoolConnection, categoryId: number) {
  const [bookRows] = await connection.execute<RowDataPacket[]>(
    `SELECT pc.physical_copy_id
       FROM titles t JOIN physical_copies pc ON pc.title_id = t.title_id
      WHERE t.category_id = ? AND t.record_type = 'Book'
        AND t.lifecycle_status = 'Active' AND pc.lifecycle_status = 'Active'
      ${forUpdate('pc')}`, [categoryId],
  )
  const [thesisRows] = await connection.execute<RowDataPacket[]>(
    `SELECT rr.research_record_id
       FROM titles t JOIN research_records rr ON rr.title_id = t.title_id
      WHERE t.category_id = ? AND t.record_type = 'Research/Thesis'
        AND t.lifecycle_status = 'Active' AND rr.viewing_status <> 'Archived'
      ${forUpdate('rr')}`, [categoryId],
  )
  const [legacyRows] = await connection.execute<RowDataPacket[]>(
    `SELECT m.material_id
       FROM materials m
       LEFT JOIN physical_copies pc ON pc.material_id = m.material_id
      WHERE m.category_id = ? AND pc.physical_copy_id IS NULL
      ${forUpdate('m')}`, [categoryId],
  )
  return { books: bookRows.length, theses: thesisRows.length, legacyAssets: legacyRows.length }
}

export async function lockReassignmentCategories(connection: PoolConnection, oldCategoryId: number, targetCategoryId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT category_id, category_name, shelf_location, shelf_column, shelf_row FROM categories
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
