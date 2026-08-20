import PDFDocument from 'pdfkit'
import { Readable } from 'node:stream'
import { db } from '../../config/db.js'
import { iterateThesisInventoryRows } from '../inventory/thesis-inventory.repository.ts'

export type ThesisInventoryExportRow = Awaited<ReturnType<typeof import('../inventory/thesis-inventory.repository.ts').thesisInventoryDto>>

function safeSpreadsheetValue(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value
}

function csvCell(value: unknown) {
  return `"${safeSpreadsheetValue(String(value ?? '')).replace(/"/g, '""')}"`
}

const COLUMNS: Array<[keyof ThesisInventoryExportRow, string]> = [
  ['title', 'Title'], ['authors', 'Authors'], ['adviser', 'Adviser'], ['publication_year', 'Publication Year'],
  ['accession_number', 'Accession Number'], ['barcode', 'Barcode'], ['condition_state', 'Condition'],
  ['availability_status', 'Availability'], ['shelf_location', 'Shelf Location'], ['last_audited_at', 'Last Audited'],
]

export function createThesisCsvStream(rows: AsyncIterable<ThesisInventoryExportRow>) {
  async function* content() {
    yield '\uFEFF' + COLUMNS.map(([, label]) => csvCell(label)).join(',') + '\r\n'
    for await (const row of rows) yield COLUMNS.map(([key]) => csvCell(row[key])).join(',') + '\r\n'
  }
  return Readable.from(content())
}

export function createThesisInventoryPdf(rows: AsyncIterable<ThesisInventoryExportRow>) {
  const document = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32, bufferPages: false })
  const blue = '#003399'; const yellow = '#FFF200'; const white = '#FFFFFF'
  const columns = [
    { key: 'title' as const, label: 'TITLE', x: 32, width: 170 },
    { key: 'authors' as const, label: 'AUTHORS', x: 205, width: 130 },
    { key: 'adviser' as const, label: 'ADVISER', x: 338, width: 105 },
    { key: 'publication_year' as const, label: 'YEAR', x: 446, width: 45 },
    { key: 'accession_number' as const, label: 'ACCESSION', x: 494, width: 85 },
    { key: 'condition_state' as const, label: 'CONDITION', x: 582, width: 75 },
    { key: 'availability_status' as const, label: 'STATUS', x: 660, width: 92 },
  ]

  function header() {
    document.rect(0, 0, document.page.width, 66).fill(blue)
    document.fillColor(white).font('Helvetica-Bold').fontSize(17).text('STI ORMOC SMART LIBRARY', 32, 19)
    document.fillColor(yellow).fontSize(10).text('RESEARCH AND THESIS INVENTORY REPORT', 32, 43)
    document.rect(32, 80, document.page.width - 64, 23).fill(yellow)
    document.fillColor(blue).fontSize(7).font('Helvetica-Bold')
    for (const column of columns) document.text(column.label, column.x + 3, 88, { width: column.width - 6 })
  }

  async function render() {
    header(); let y = 109; let index = 0
    for await (const row of rows) {
      if (y > document.page.height - 48) { document.addPage(); header(); y = 109 }
      document.fillColor(blue).font('Helvetica').fontSize(7)
      for (const column of columns) document.text(String(row[column.key] ?? ''), column.x + 3, y, { width: column.width - 6, height: 18, ellipsis: true })
      document.moveTo(32, y + 22).lineTo(document.page.width - 32, y + 22).strokeColor(blue).opacity(0.15).stroke().opacity(1)
      y += 25; index += 1
    }
    if (index === 0) document.fillColor(blue).fontSize(10).text('No research or thesis inventory records are available.', 32, 122)
    document.end()
  }
  void render().catch((error) => document.destroy(error))
  return document
}

export function thesisReportRows() { return iterateThesisInventoryRows(db) }
