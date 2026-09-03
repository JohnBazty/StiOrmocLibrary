import type { Pool, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import type { CatalogSearchFilters } from '../catalog/catalog-search.repository.ts'
import { createIntegrityProtectedCsvStream } from './csv-integrity.ts'
import { createBrandedTablePdf, type PdfTableColumn } from './branded-table-pdf.ts'

export type InventoryExportRow = {
  recordType: string
  title: string
  authors: string
  isbn: string
  category: string
  publicationYear: string
  accessionNumber: string
  barcode: string
  shelfLocation: string
  condition: string
  availability: string
  researchCode: string
  adviser: string
}

function commonWhere(filters: CatalogSearchFilters, alias = 't') {
  const where = [`${alias}.lifecycle_status = 'Active'`]
  const parameters: Array<string | number> = []
  if (filters.categoryId !== null) { where.push(`${alias}.category_id = ?`); parameters.push(filters.categoryId) }
  if (filters.publicationYear !== null) { where.push(`${alias}.publication_year = ?`); parameters.push(filters.publicationYear) }
  if (filters.author) {
    where.push(`EXISTS (SELECT 1 FROM authors af WHERE af.title_id = ${alias}.title_id AND af.normalized_name LIKE ?)`)
    parameters.push(`%${filters.author.toLocaleLowerCase('en-US')}%`)
  }
  if (filters.query) {
    where.push(`(${alias}.title LIKE ? OR ${alias}.isbn LIKE ? OR EXISTS (SELECT 1 FROM authors aq WHERE aq.title_id = ${alias}.title_id AND aq.author_name LIKE ?))`)
    const like = `%${filters.query}%`
    parameters.push(like, like, like)
  }
  return { where, parameters }
}

function mapRow(row: RowDataPacket): InventoryExportRow {
  return {
    recordType: String(row.record_type ?? ''), title: String(row.title ?? ''), authors: String(row.authors ?? ''),
    isbn: String(row.isbn ?? ''), category: String(row.category_name ?? ''), publicationYear: String(row.publication_year ?? ''),
    accessionNumber: String(row.accession_number ?? ''), barcode: String(row.barcode ?? ''), shelfLocation: String(row.shelf_location ?? ''),
    condition: String(row.condition_status ?? ''), availability: String(row.availability ?? ''), researchCode: String(row.research_code ?? ''),
    adviser: String(row.adviser_name ?? ''),
  }
}

/** Keyset pagination holds only one bounded result batch in memory. */
export async function* iterateInventoryRows(
  database: Pool,
  filters: CatalogSearchFilters,
  batchSize = 250,
): AsyncGenerator<InventoryExportRow> {
  const safeBatchSize = Math.min(Math.max(Math.trunc(batchSize), 1), 1000)
  if (filters.scope !== 'research') {
    let cursor = 0
    for (;;) {
      const common = commonWhere(filters)
      const where = [...common.where, "t.record_type = 'Book'", 'pc.physical_copy_id > ?']
      const parameters = [...common.parameters, cursor]
      if (filters.availability && filters.availability !== 'Available for Viewing') {
        where.push('pc.availability_status = ?')
        parameters.push(filters.availability)
      }
      const [rows] = await database.execute<RowDataPacket[]>(
        `SELECT pc.physical_copy_id, t.record_type, t.title, t.isbn, t.publication_year,
                c.category_name, pc.accession_number, pc.barcode, pc.shelf_location,
                pc.condition_status, pc.availability_status AS availability,
                (SELECT GROUP_CONCAT(a.author_name ORDER BY a.author_order SEPARATOR ', ')
                   FROM authors a WHERE a.title_id = t.title_id) AS authors,
                NULL AS research_code, NULL AS adviser_name
           FROM physical_copies pc
           JOIN titles t ON t.title_id = pc.title_id
           LEFT JOIN categories c ON c.category_id = t.category_id
          WHERE ${where.join(' AND ')}
          ORDER BY pc.physical_copy_id ASC LIMIT ${safeBatchSize}`,
        parameters,
      )
      if (!rows.length) break
      for (const row of rows) yield mapRow(row)
      cursor = Number(rows[rows.length - 1].physical_copy_id)
    }
  }

  if (filters.scope !== 'books' && (!filters.availability || ['Available', 'Available for Viewing', 'Archived', 'Missing'].includes(filters.availability))) {
    let cursor = 0
    for (;;) {
      const common = commonWhere(filters)
      const where = [...common.where, "t.record_type = 'Research/Thesis'", 't.title_id > ?']
      const parameters = [...common.parameters, cursor]
      if (filters.availability === 'Available' || filters.availability === 'Available for Viewing') where.push("rr.viewing_status = 'Available for Viewing'")
      else if (filters.availability) { where.push('rr.viewing_status = ?'); parameters.push(filters.availability) }
      const [rows] = await database.execute<RowDataPacket[]>(
        `SELECT t.title_id, t.record_type, t.title, t.isbn, t.publication_year,
                c.category_name, '' AS accession_number, '' AS barcode, '' AS shelf_location,
                '' AS condition_status, rr.viewing_status AS availability,
                (SELECT GROUP_CONCAT(a.author_name ORDER BY a.author_order SEPARATOR ', ')
                   FROM authors a WHERE a.title_id = t.title_id) AS authors,
                rr.research_code, rr.adviser_name
           FROM titles t
           JOIN research_records rr ON rr.title_id = t.title_id
           LEFT JOIN categories c ON c.category_id = t.category_id
          WHERE ${where.join(' AND ')}
          ORDER BY t.title_id ASC LIMIT ${safeBatchSize}`,
        parameters,
      )
      if (!rows.length) break
      for (const row of rows) yield mapRow(row)
      cursor = Number(rows[rows.length - 1].title_id)
    }
  }
}

function safeSpreadsheetValue(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value
}

function csvCell(value: string) {
  return `"${safeSpreadsheetValue(value).replace(/"/g, '""')}"`
}

const CSV_COLUMNS: Array<[keyof InventoryExportRow, string]> = [
  ['recordType', 'Record Type'], ['title', 'Title'], ['authors', 'Authors'], ['isbn', 'ISBN'],
  ['category', 'Category'], ['publicationYear', 'Publication Year'], ['accessionNumber', 'Accession Number'],
  ['barcode', 'Barcode'], ['shelfLocation', 'Shelf Location'], ['condition', 'Condition'],
  ['availability', 'Availability'], ['researchCode', 'Research Code'], ['adviser', 'Adviser'],
]

export function createCsvStream(rows: AsyncIterable<InventoryExportRow>) {
  async function* content() {
    yield '\uFEFF' + CSV_COLUMNS.map(([, label]) => csvCell(label)).join(',') + '\r\n'
    for await (const row of rows) yield CSV_COLUMNS.map(([key]) => csvCell(row[key])).join(',') + '\r\n'
  }
  return createIntegrityProtectedCsvStream(content(), 'catalog_inventory', CSV_COLUMNS.length)
}

export function createInventoryPdf(rows: AsyncIterable<InventoryExportRow>) {
  const columns: Array<PdfTableColumn<InventoryExportRow>> = [
    { key: 'recordType', label: 'TYPE', width: 55 },
    { key: 'title', label: 'TITLE', width: 160 },
    { key: 'authors', label: 'AUTHOR(S)', width: 125 },
    { key: 'isbn', label: 'ISBN', width: 90 },
    { key: 'category', label: 'CATEGORY', width: 85 },
    { key: 'publicationYear', label: 'YEAR', width: 45 },
    { key: 'accessionNumber', label: 'ACCESSION', width: 85 },
    { key: 'barcode', label: 'BARCODE', width: 85 },
    { key: 'shelfLocation', label: 'SHELF', width: 75 },
    { key: 'condition', label: 'CONDITION', width: 70 },
    { key: 'availability', label: 'AVAILABILITY', width: 80 },
    { key: 'researchCode', label: 'RESEARCH CODE', width: 75 },
    { key: 'adviser', label: 'ADVISER', width: 96 },
  ]
  return createBrandedTablePdf(rows, {
    title: 'COMPLETE INVENTORY REPORT',
    subtitle: 'All active book and research inventory data',
    emptyMessage: 'No inventory records matched the selected filters.',
    columns,
  })
}

export function inventoryRows(filters: CatalogSearchFilters) {
  return iterateInventoryRows(db, filters)
}
