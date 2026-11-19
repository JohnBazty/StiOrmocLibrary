import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from '../../config/db.js'
import type { BookMetadataInput, ThesisMetadataInput } from './catalog.validation.ts'
import { forUpdate } from '../../config/sql-dialect.js'
import { buildBookSearchText, buildThesisSearchText, insertAuthors } from './catalog.repository.ts'

export async function listCategories(database: Pool) {
  const [rows] = await database.execute<RowDataPacket[]>(
    'SELECT category_id, category_name, shelf_location, shelf_column, shelf_row, record_kind FROM categories ORDER BY category_name ASC',
  )
  return rows.map((row) => ({
    categoryId: row.category_id,
    categoryName: row.category_name,
    shelfLocation: row.shelf_location,
    shelfColumn: Number(row.shelf_column),
    shelfRow: Number(row.shelf_row),
    recordKind: row.record_kind ? String(row.record_kind) : null,
  }))
}

export async function listPhysicalCopies(database: Pool, limit = 100) {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 250)
  const [rows] = await database.execute<RowDataPacket[]>(
    `SELECT pc.physical_copy_id, pc.material_id, pc.title_id, t.title,
            pc.barcode, pc.accession_number, pc.shelf_location,
            pc.condition_status, pc.availability_status, pc.lifecycle_status,
            pc.last_scanned_at, pc.updated_at,
            (SELECT code FROM dewey_classifications d WHERE d.classification_id=pc.dewey_classification_id) AS dewey_code
       FROM physical_copies pc
       JOIN titles t ON t.title_id = pc.title_id
      ORDER BY pc.physical_copy_id DESC
      LIMIT ${safeLimit}`,
  )
  return rows.map((row) => ({
    physicalCopyId: row.physical_copy_id,
    deweyCode:row.dewey_code??null,
    materialId: row.material_id,
    titleId: row.title_id,
    title: row.title,
    barcode: row.barcode,
    accessionNumber: row.accession_number,
    shelfLocation: row.shelf_location,
    conditionStatus: row.condition_status,
    availabilityStatus: row.availability_status,
    lifecycleStatus: row.lifecycle_status,
    lastScannedAt: row.last_scanned_at,
    updatedAt: row.updated_at,
  }))
}

export async function findRegistryMatch(database: Pool, kind: 'ISBN' | 'Barcode', value: string) {
  const sql = kind === 'ISBN'
    ? `SELECT t.title_id, t.title, t.isbn, t.record_type
         FROM titles t WHERE t.isbn = ? LIMIT 1`
    : `SELECT pc.physical_copy_id, pc.title_id, pc.accession_number, pc.barcode,
              pc.availability_status, t.title, t.record_type
         FROM physical_copies pc JOIN titles t ON t.title_id = pc.title_id
        WHERE pc.barcode = ? OR pc.accession_number = ? LIMIT 1`
  const parameters = kind === 'ISBN' ? [value] : [value, value]
  const [rows] = await database.execute<RowDataPacket[]>(sql, parameters)
  const row = rows[0]
  if (!row) return null
  if (kind === 'Barcode') {
    await database.execute(
      'UPDATE physical_copies SET last_scanned_at = NOW(), updated_at = NOW() WHERE physical_copy_id = ?',
      [row.physical_copy_id],
    )
  }
  return kind === 'ISBN'
    ? { titleId: row.title_id, title: row.title, isbn: row.isbn, recordType: row.record_type }
    : {
        physicalCopyId: row.physical_copy_id,
        titleId: row.title_id,
        title: row.title,
        accessionNumber: row.accession_number,
        barcode: row.barcode,
        availability: row.availability_status,
        recordType: row.record_type,
      }
}

export async function lockTitle(connection: PoolConnection, titleId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT t.title_id, t.title, t.record_type, t.lifecycle_status, t.category_id,
            t.row_version, c.category_name, c.shelf_location AS category_shelf_location
       FROM titles t
       LEFT JOIN categories c ON c.category_id = t.category_id
      WHERE t.title_id = ? LIMIT 1 ${forUpdate('t')}`,
    [titleId],
  )
  return rows[0] ?? null
}

export async function lockCategoryWithManagedShelf(connection: PoolConnection, categoryId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT c.category_id, c.category_name, c.shelf_location, c.shelf_column, c.shelf_row, c.record_kind,
            s.location_id AS shelf_id, s.column_count, s.row_count
       FROM categories c
       LEFT JOIN catalog_locations s ON s.name = c.shelf_location AND s.lifecycle_status = 'Active'
      WHERE c.category_id = ? LIMIT 1 ${forUpdate('c')}`,
    [categoryId],
  )
  return rows[0] ?? null
}

export async function moveTitleToCategory(
  connection: PoolConnection,
  title: RowDataPacket,
  targetCategory: RowDataPacket,
) {
  const titleId = Number(title.title_id)
  const targetCategoryId = Number(targetCategory.category_id)
  let bookCopies = 0
  let researchCopies = 0
  let previousShelves: Array<{ shelf: string; count: number }> = []
  const table = title.record_type === 'Book' ? 'physical_copies' : 'research_inventory'
  const [copies] = await connection.execute<RowDataPacket[]>(
    `SELECT shelf_location FROM ${table} WHERE title_id = ? AND lifecycle_status = 'Active'`, [titleId],
  )
  previousShelves = Object.entries(copies.reduce<Record<string, number>>((counts, copy) => {
    const shelf = String(copy.shelf_location || 'Unassigned')
    counts[shelf] = (counts[shelf] ?? 0) + 1
    return counts
  }, {})).map(([shelf, count]) => ({ shelf, count }))
  if (title.record_type === 'Book') {
    bookCopies = copies.length
    await connection.execute<ResultSetHeader>(
      `UPDATE materials m SET category_id = ?, updated_at = NOW()
         FROM physical_copies pc WHERE pc.material_id = m.material_id AND pc.title_id = ?`,
      [targetCategoryId, titleId],
    )
  } else researchCopies = copies.length

  await connection.execute<ResultSetHeader>(
    `UPDATE titles
        SET category_id = ?, row_version = row_version + 1, updated_at = NOW()
      WHERE title_id = ?`,
    [targetCategoryId, titleId],
  )
  return { bookCopies, researchCopies, previousShelves }
}

export async function hasActiveTitleLoan(connection: PoolConnection, titleId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT bt.transaction_id, bt.transaction_status, pc.physical_copy_id, pc.accession_number
       FROM physical_copies pc
       JOIN borrow_transactions bt ON bt.physical_copy_id = pc.physical_copy_id
         OR (pc.material_id IS NOT NULL AND bt.material_id = pc.material_id)
      WHERE pc.title_id = ? AND bt.transaction_status IN ('Pending', 'Borrowed', 'Overdue')
      LIMIT 1 FOR UPDATE`,
    [titleId],
  )
  return rows[0] ?? null
}

export async function hasActiveTitleReservation(connection: PoolConnection, titleId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT reservation_id FROM reservations
      WHERE (book_title_id = ? OR material_id IN
        (SELECT material_id FROM physical_copies WHERE title_id = ? AND material_id IS NOT NULL))
        AND reservation_status IN ('pending', 'approved', 'ready_for_pickup')
      LIMIT 1 FOR UPDATE`, [titleId, titleId],
  )
  return rows[0] ?? null
}

export async function updateBookMetadata(connection: PoolConnection, titleId: number, input: BookMetadataInput) {
  await connection.execute<ResultSetHeader>(
    `UPDATE titles SET category_id = ?, title = ?, normalized_title = ?, isbn = ?,
       publication_year = ?, publisher = ?, call_number = ?, search_text = ?,
       row_version = row_version + 1, updated_at = NOW()
     WHERE title_id = ?`,
    [
      input.categoryId, input.title, input.title.toLocaleLowerCase('en-US'), input.isbn,
      input.publicationYear, input.publisher, input.callNumber,
      buildBookSearchText({ ...input, copy: null as never }), titleId,
    ],
  )
  await connection.execute('DELETE FROM authors WHERE title_id = ?', [titleId])
  await insertAuthors(connection, titleId, input.authors)
}

export async function updateThesisMetadata(connection: PoolConnection, titleId: number, input: ThesisMetadataInput) {
  await connection.execute<ResultSetHeader>(
    `UPDATE titles SET category_id = ?, title = ?, normalized_title = ?, publication_year = ?,
       search_text = ?, row_version = row_version + 1, updated_at = NOW()
     WHERE title_id = ?`,
    [input.categoryId, input.title, input.title.toLocaleLowerCase('en-US'), input.year, buildThesisSearchText(input), titleId],
  )
  await connection.execute<ResultSetHeader>(
    `UPDATE research_records SET research_code = ?, adviser_name = ?, department_or_program = ?,
       abstract_text = ?, keywords_text = ?, updated_at = NOW() WHERE title_id = ?`,
    [input.researchCode, input.adviser, input.departmentOrProgram, input.abstract, input.keywords, titleId],
  )
  await connection.execute('DELETE FROM authors WHERE title_id = ?', [titleId])
  await insertAuthors(connection, titleId, input.authors)
}

export async function setTitleArchived(connection: PoolConnection, titleId: number, reason: string, actorAccountId: number | null = null) {
  await connection.execute(
    `UPDATE materials SET availability_status='Unavailable', updated_at=NOW()
      WHERE material_id IN (SELECT material_id FROM physical_copies WHERE title_id=? AND material_id IS NOT NULL)`,
    [titleId],
  )
  await connection.execute(
    `UPDATE titles SET lifecycle_status = 'Archived', archived_at = NOW(), archive_reason = ?,
       archived_by_account_id = ?, row_version = row_version + 1, updated_at = NOW() WHERE title_id = ?`,
    [reason, actorAccountId, titleId],
  )
  await connection.execute(
    `UPDATE physical_copies SET lifecycle_status = 'Archived', availability_status = 'Archived',
       archived_at = NOW(), archive_reason = ?, row_version = row_version + 1, updated_at = NOW()
     WHERE title_id = ?`,
    [reason, titleId],
  )
  await connection.execute(
    "UPDATE research_records SET viewing_status = 'Archived', updated_at = NOW() WHERE title_id = ?",
    [titleId],
  )
}

export async function countPhysicalCopies(connection: PoolConnection, titleId: number) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    'SELECT COUNT(*) AS total FROM physical_copies WHERE title_id = ?', [titleId],
  )
  return Number(rows[0]?.total ?? 0)
}
