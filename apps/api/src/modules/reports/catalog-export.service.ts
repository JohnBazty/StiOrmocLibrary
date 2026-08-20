import PDFDocument from 'pdfkit'
import { Readable } from 'node:stream'
import type { Pool, RowDataPacket } from 'mysql2/promise'
import { db } from '../../config/db.js'
import type { CatalogSearchFilters } from '../catalog/catalog-search.repository.ts'

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
  return Readable.from(content())
}

export function createInventoryPdf(rows: AsyncIterable<InventoryExportRow>) {
  const document = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32, bufferPages: false })
  const blue = '#003399'
  const yellow = '#FFF200'
  const white = '#FFFFFF'
  const columns = [
    { key: 'recordType' as const, label: 'TYPE', x: 32, width: 65 },
    { key: 'title' as const, label: 'TITLE', x: 100, width: 190 },
    { key: 'authors' as const, label: 'AUTHOR(S)', x: 293, width: 135 },
    { key: 'accessionNumber' as const, label: 'ACCESSION', x: 431, width: 90 },
    { key: 'shelfLocation' as const, label: 'SHELF', x: 524, width: 70 },
    { key: 'condition' as const, label: 'CONDITION', x: 597, width: 75 },
    { key: 'availability' as const, label: 'STATUS', x: 675, width: 95 },
  ]

  function header() {
    document.rect(0, 0, document.page.width, 66).fill(blue)
    document.fillColor(white).fontSize(17).font('Helvetica-Bold').text('STI ORMOC SMART LIBRARY', 32, 19)
    document.fillColor(yellow).fontSize(10).text('BOOK & RESEARCH/THESIS INVENTORY REPORT', 32, 43)
    document.rect(32, 80, document.page.width - 64, 23).fill(yellow)
    document.fillColor(blue).fontSize(7).font('Helvetica-Bold')
    for (const column of columns) document.text(column.label, column.x + 3, 88, { width: column.width - 6 })
  }

  async function render() {
    header()
    let y = 109
    let index = 0
    for await (const row of rows) {
      if (y > document.page.height - 48) { document.addPage(); header(); y = 109 }
      if (index % 2 === 0) document.rect(32, y - 3, document.page.width - 64, 25).fill('#FFFFFF')
      document.fillColor(blue).font('Helvetica').fontSize(7)
      for (const column of columns) document.text(row[column.key], column.x + 3, y, { width: column.width - 6, height: 18, ellipsis: true })
      document.moveTo(32, y + 22).lineTo(document.page.width - 32, y + 22).strokeColor(blue).opacity(0.15).stroke().opacity(1)
      y += 25
      index += 1
    }
    if (index === 0) document.fillColor(blue).fontSize(10).text('No inventory records matched the selected filters.', 32, 122)
    document.end()
  }
  void render().catch((error) => document.destroy(error))
  return document
}

export function inventoryRows(filters: CatalogSearchFilters) {
  return iterateInventoryRows(db, filters)
}
