import { db } from '../../config/db.js'
import { iterateThesisInventoryRows } from '../inventory/thesis-inventory.repository.ts'
import { createIntegrityProtectedCsvStream } from './csv-integrity.ts'
import { createBrandedTablePdf, type PdfTableColumn } from './branded-table-pdf.ts'

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
  return createIntegrityProtectedCsvStream(content(), 'thesis_inventory', COLUMNS.length)
}

export function createThesisInventoryPdf(rows: AsyncIterable<ThesisInventoryExportRow>) {
  const columns: Array<PdfTableColumn<ThesisInventoryExportRow>> = [
    { key: 'title', label: 'TITLE', width: 190 },
    { key: 'authors', label: 'AUTHORS', width: 145 },
    { key: 'adviser', label: 'ADVISER', width: 130 },
    { key: 'publication_year', label: 'YEAR', width: 50 },
    { key: 'accession_number', label: 'ACCESSION', width: 100 },
    { key: 'barcode', label: 'BARCODE', width: 100 },
    { key: 'condition_state', label: 'CONDITION', width: 80 },
    { key: 'availability_status', label: 'AVAILABILITY', width: 90 },
    { key: 'shelf_location', label: 'SHELF', width: 85 },
    {
      key: 'last_audited_at', label: 'LAST AUDITED', width: 156,
      format: (value) => value ? new Intl.DateTimeFormat('en-PH', {
        dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
      }).format(new Date(String(value))) : 'Never audited',
    },
  ]
  return createBrandedTablePdf(rows, {
    title: 'COMPLETE RESEARCH AND THESIS INVENTORY REPORT',
    subtitle: 'All active bound research inventory data',
    emptyMessage: 'No research or thesis inventory records are available.',
    columns,
  })
}

export function thesisReportRows() { return iterateThesisInventoryRows(db) }
