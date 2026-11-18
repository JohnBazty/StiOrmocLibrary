import type { Pool, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { authorsAgg } from '../../config/sql-dialect.js'
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
    where.push(`EXISTS (SELECT 1 FROM authors af WHERE af.title_id = ${alias}.title_id AND af.author_name ILIKE ? ESCAPE '!')`)
    parameters.push(`%${filters.author.toLocaleLowerCase('en-US').replace(/[!%_]/g,'!$&')}%`)
  }
  if (filters.query) {
    where.push(`(${alias}.title ILIKE ? ESCAPE '!' OR ${alias}.isbn ILIKE ? ESCAPE '!' OR EXISTS (SELECT 1 FROM authors aq WHERE aq.title_id = ${alias}.title_id AND aq.author_name ILIKE ? ESCAPE '!'))`)
    const like = `%${filters.query.toLocaleLowerCase('en-US').replace(/[!%_]/g,'!$&')}%`
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
  const copyAvailability="CASE WHEN pc.condition_status IN ('Lost','Damaged','ForRepair') THEN 'Unavailable' WHEN pc.availability_status='Available' THEN COALESCE(m.availability_status,pc.availability_status) ELSE pc.availability_status END"
  if (filters.scope !== 'research' && filters.availability !== 'Available for Viewing') {
    let cursor = 0
    for (;;) {
      const common = commonWhere(filters)
      const where = [...common.where, "t.record_type = 'Book'", "pc.lifecycle_status = 'Active'", 'pc.physical_copy_id > ?']
      const parameters = [...common.parameters, cursor]
      if (filters.availability && filters.availability !== 'Available for Viewing') {
        where.push(`${copyAvailability} = ?`)
        parameters.push(filters.availability)
      }
      const [rows] = await database.execute<RowDataPacket[]>(
        `SELECT pc.physical_copy_id, t.record_type, t.title, t.isbn, t.publication_year,
                c.category_name, pc.accession_number, pc.barcode, pc.shelf_location,
                pc.condition_status, ${copyAvailability} AS availability,
                (SELECT ${authorsAgg('a')}
                   FROM authors a WHERE a.title_id = t.title_id) AS authors,
                NULL AS research_code, NULL AS adviser_name
           FROM physical_copies pc
           JOIN titles t ON t.title_id = pc.title_id
           LEFT JOIN materials m ON m.material_id=pc.material_id
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
      const where = [...common.where, "t.record_type = 'Research/Thesis'", "rr.viewing_status <> 'Archived'", 't.title_id > ?']
      const parameters = [...common.parameters, cursor]
      if (filters.availability === 'Available' || filters.availability === 'Available for Viewing') where.push("rr.viewing_status = 'Available for Viewing'")
      else if (filters.availability) { where.push('rr.viewing_status = ?'); parameters.push(filters.availability) }
      const [rows] = await database.execute<RowDataPacket[]>(
        `SELECT t.title_id, t.record_type, t.title, t.isbn, t.publication_year,
                c.category_name, '' AS accession_number, '' AS barcode, '' AS shelf_location,
                '' AS condition_status, rr.viewing_status AS availability,
                (SELECT ${authorsAgg('a')}
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
  return /^\s*[=+\-@]/.test(value) ? `'${value}` : value
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

function inventoryCriteria(filters?:CatalogSearchFilters) {
  return `Current snapshot | Scope: ${filters?.scope??'all'} | Search: ${filters?.query||'All'} | Category: ${filters?.categoryId??'All'} | Author: ${filters?.author||'All'} | Publication year: ${filters?.publicationYear??'All'} | Availability: ${filters?.availability||'All'} | Generated ${new Date().toLocaleString('en-PH',{timeZone:'Asia/Manila'})} Asia/Manila`
}

export function createCsvStream(rows: AsyncIterable<InventoryExportRow>, filters?:CatalogSearchFilters) {
  const criteria=inventoryCriteria(filters)
  async function* content() {
    if(filters)yield '\uFEFF'+csvCell('REPORT CRITERIA')+','+csvCell(criteria)+'\r\n'
    yield (filters?'':'\uFEFF') + CSV_COLUMNS.map(([, label]) => csvCell(label)).join(',') + '\r\n'
    for await (const row of rows) yield CSV_COLUMNS.map(([key]) => csvCell(row[key])).join(',') + '\r\n'
  }
  return createIntegrityProtectedCsvStream(content(), 'catalog_inventory', CSV_COLUMNS.length)
}

export function createInventoryPdf(rows: AsyncIterable<InventoryExportRow>,filters?:CatalogSearchFilters) {
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
    title: 'CURRENT BOOK AND RESEARCH HOLDINGS',
    subtitle: inventoryCriteria(filters),
    emptyMessage: 'No inventory records matched the selected filters.',
    columns,
  })
}

export function inventoryRows(filters: CatalogSearchFilters) {
  return iterateInventoryRows(db, filters)
}
