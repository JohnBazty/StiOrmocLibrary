import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import type { BookEntryInput, PhysicalCopyInput, ThesisEntryInput, ThesisMetadataInput } from './catalog.validation.ts'

type IdRow = RowDataPacket & { title_id: number }
type DuplicateCopyRow = RowDataPacket & {
  physical_copy_id: number
  barcode: string
  accession_number: string
}

type DuplicateResearchInventoryRow = RowDataPacket & {
  research_inventory_id: number
  barcode: string
  accession_number: string
}

export async function ensureCategoryExists(connection: PoolConnection, categoryId: number | null) {
  if (categoryId === null) return true
  const [rows] = await connection.execute<RowDataPacket[]>(
    'SELECT category_id FROM categories WHERE category_id = ? LIMIT 1',
    [categoryId],
  )
  return rows.length > 0
}

export async function findBookTitleByIsbnForUpdate(connection: PoolConnection, isbn: string | null) {
  if (!isbn) return null
  const [rows] = await connection.execute<IdRow[]>(
    `SELECT title_id
       FROM titles
      WHERE isbn = ? AND record_type = 'Book'
      LIMIT 1
      FOR UPDATE`,
    [isbn],
  )
  return rows[0] ?? null
}

export async function findDuplicatePhysicalCopyForUpdate(
  connection: PoolConnection,
  copy: PhysicalCopyInput,
) {
  const [rows] = await connection.execute<DuplicateCopyRow[]>(
    `SELECT physical_copy_id, barcode, accession_number
       FROM physical_copies
      WHERE barcode = ? OR accession_number = ?
      LIMIT 1
      FOR UPDATE`,
    [copy.barcode, copy.accessionNumber],
  )
  return rows[0] ?? null
}

export async function findResearchCodeForUpdate(connection: PoolConnection, researchCode: string) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT research_record_id, title_id
       FROM research_records
      WHERE research_code = ?
      LIMIT 1
      FOR UPDATE`,
    [researchCode],
  )
  return rows[0] ?? null
}

export async function findDuplicateResearchInventoryForUpdate(
  connection: PoolConnection,
  copy: PhysicalCopyInput,
) {
  const [rows] = await connection.execute<DuplicateResearchInventoryRow[]>(
    `SELECT research_inventory_id, barcode, accession_number
       FROM research_inventory
      WHERE barcode = ? OR accession_number = ?
      LIMIT 1
      FOR UPDATE`,
    [copy.barcode, copy.accessionNumber],
  )
  return rows[0] ?? null
}

export async function insertTitle(
  connection: PoolConnection,
  input: {
    categoryId: number | null
    recordType: 'Book' | 'Research/Thesis'
    title: string
    isbn: string | null
    publicationYear: number | null
    publisher: string | null
    callNumber: string | null
    searchText: string
  },
) {
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO titles
       (category_id, record_type, title, normalized_title, isbn,
        publication_year, publisher, call_number, search_text,
        lifecycle_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', NOW())`,
    [
      input.categoryId,
      input.recordType,
      input.title,
      input.title.toLocaleLowerCase('en-US'),
      input.isbn,
      input.publicationYear,
      input.publisher,
      input.callNumber,
      input.searchText,
    ],
  )
  return result.insertId
}

export async function insertAuthors(connection: PoolConnection, titleId: number, authors: string[]) {
  for (const [index, author] of authors.entries()) {
    await connection.execute<ResultSetHeader>(
      `INSERT INTO authors
         (title_id, author_name, normalized_name, author_order, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [titleId, author, author.toLocaleLowerCase('en-US'), index + 1],
    )
  }
}

export async function insertPhysicalCopy(
  connection: PoolConnection,
  titleId: number,
  copy: PhysicalCopyInput,
) {
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO physical_copies
       (title_id, material_id, barcode, accession_number, shelf_location,
        condition_status, availability_status, lifecycle_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'Available', 'Active', NOW())`,
    [
      titleId,
      copy.legacyMaterialId,
      copy.barcode,
      copy.accessionNumber,
      copy.shelfLocation,
      copy.conditionStatus,
    ],
  )
  return result.insertId
}

export async function insertResearchRecord(
  connection: PoolConnection,
  titleId: number,
  input: ThesisMetadataInput,
) {
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO research_records
       (title_id, research_code, adviser_name, department_or_program,
        abstract_text, keywords_text, viewing_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'Available for Viewing', NOW())`,
    [
      titleId,
      input.researchCode,
      input.adviser,
      input.departmentOrProgram,
      input.abstract,
      input.keywords,
    ],
  )
  return result.insertId
}

export async function insertResearchInventory(
  connection: PoolConnection,
  input: ThesisEntryInput,
) {
  const condition = input.copy.conditionStatus.toLowerCase().replace(/\s+/g, '_')
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO research_inventory
       (title, authors, adviser, publication_year, accession_number, barcode,
        condition_state, availability_status, shelf_location, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'available', ?, NOW())`,
    [
      input.title,
      input.authors.join(', '),
      input.adviser,
      input.year,
      input.copy.accessionNumber,
      input.copy.barcode,
      condition,
      input.copy.shelfLocation,
    ],
  )
  return result.insertId
}

export function buildBookSearchText(input: BookEntryInput) {
  return [input.title, ...input.authors, input.isbn, input.publisher, input.callNumber]
    .filter(Boolean)
    .join(' ')
}

export function buildThesisSearchText(input: ThesisMetadataInput) {
  return [
    input.title,
    ...input.authors,
    input.adviser,
    input.researchCode,
    input.departmentOrProgram,
    input.keywords,
  ].filter(Boolean).join(' ')
}
