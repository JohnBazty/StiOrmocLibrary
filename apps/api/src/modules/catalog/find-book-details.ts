import ExcelJS from 'exceljs'
import { HttpError } from '../../core/http-error.ts'
import { mappedRows, readHoldings, type SheetMapping } from './holdings-parser.ts'
import { FILL_BATCH_SIZE, FILL_DEADLINE_MS, lookupBlanks, type FilledValues, type Lookups } from './import-lookup-fill.ts'
import { isbnLookupService } from './isbn-lookup.service.ts'

/**
 * Find book details (plan 2026-11-13-find-book-details): read a spreadsheet, fill its blanks from the book lookups and
 * download the result. Nothing here reads or writes the database.
 */
export const FIND_FIELDS = ['title', 'author', 'isbn', 'edition', 'publisher', 'publicationYear', 'copyrightYear', 'pages', 'copies', 'summary'] as const
type FindField = typeof FIND_FIELDS[number]
type FindData = Record<FindField, string>
const LABELS: Record<FindField, string> = { title: 'Title', author: 'Author', isbn: 'ISBN', edition: 'Edition', publisher: 'Publisher', publicationYear: 'Year published', copyrightYear: 'Copyright year', pages: 'Pages', copies: 'Copies', summary: 'Summary' }
const SOURCES: Record<string, string> = { google_books: 'Google Books', open_library: 'Open Library', local_catalog: 'Library catalog' }
export const FIND_EXPORT_MAX = 5000
const MAX_TEXT = 5000

const bad = (message: string): never => { throw new HttpError(422, 'FIND_BOOKS_INVALID', message) }

/** Cleans one client-sent row: known fields only, strings only, bounded length. */
function dataOf(value: unknown): FindData {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : bad('Each book needs its details.')
  return Object.fromEntries(FIND_FIELDS.map((field) => {
    const text = input[field] === undefined || input[field] === null ? '' : String(input[field])
    if (text.length > MAX_TEXT) bad(`${LABELS[field]} is too long.`)
    return [field, text.trim()]
  })) as FindData
}

export async function readFoundRows(file: { buffer: Buffer; originalname: string } | undefined, mappings: SheetMapping[]) {
  if (!file) bad('Choose a book list file.')
  if (!Array.isArray(mappings) || !mappings.length || mappings.length > 12) bad('Confirm the sheet mappings.')
  const sheets = await readHoldings(file!)
  const { items } = mappedRows(sheets, mappings, undefined, { requireCopies: false })
  if (items.length > FIND_EXPORT_MAX) bad(`This list has ${items.length.toLocaleString('en-PH')} books; split it into files of at most ${FIND_EXPORT_MAX.toLocaleString('en-PH')}.`)
  return { rows: items.map((item, index) => ({ id: index + 1, sheet: item.sheet, sourceRow: item.sourceRow, data: dataOf(item.data) })) }
}

/** Fills the blanks of up to 50 rows; stops early when the providers are down or the 20-second limit passes. */
export async function fillFoundRows(input: unknown, lookups: Lookups = isbnLookupService, clock: () => number = Date.now) {
  if (!Array.isArray(input) || !input.length || input.length > FILL_BATCH_SIZE) bad(`Send 1 to ${FILL_BATCH_SIZE} books at a time.`)
  const rows = (input as unknown[]).map((row) => {
    const value = row as { id?: unknown; data?: unknown }
    if (!Number.isSafeInteger(value?.id)) bad('Each book needs its row number.')
    return { id: Number(value.id), data: dataOf(value.data) }
  })
  const filled: Array<{ id: number; filled: FilledValues }> = []
  const startedAt = clock()
  let unavailable = false, next = 0
  for (; next < rows.length; next += 1) {
    if (clock() - startedAt > FILL_DEADLINE_MS) break
    try { filled.push({ id: rows[next].id, filled: (await lookupBlanks(rows[next].data, lookups)).record }) } catch { unavailable = true; break }
  }
  return { rows: filled, notReached: rows.slice(next).map((row) => row.id), unavailable }
}

type ExportRow = { sheet?: unknown; sourceRow?: unknown; checked?: unknown; data?: unknown; filled?: unknown }
// A leading = + - @, tab or carriage return can run as a spreadsheet formula; a quote keeps it text.
const safe = (text: string) => (/^[=+\-@\t\r]/.test(text) ? `'${text}` : text)

function exportRows(input: unknown) {
  if (!Array.isArray(input) || !input.length || input.length > FIND_EXPORT_MAX) bad(`Download 1 to ${FIND_EXPORT_MAX.toLocaleString('en-PH')} books at a time.`)
  return (input as ExportRow[]).map((row) => {
    const filledInput = row?.filled && typeof row.filled === 'object' ? row.filled as Record<string, { source?: unknown }> : {}
    const filled = Object.fromEntries(FIND_FIELDS.flatMap((field) => {
      const source = filledInput[field]?.source
      return typeof source === 'string' && SOURCES[source] ? [[field, SOURCES[source]]] : []
    })) as Partial<Record<FindField, string>>
    return { data: dataOf(row?.data), filled, checked: row?.checked === true, sheet: String(row?.sheet ?? '').slice(0, 100), sourceRow: Number.isSafeInteger(row?.sourceRow) ? Number(row?.sourceRow) : null }
  })
}

const HEADERS = [...FIND_FIELDS.map((field) => LABELS[field]), 'Filled from', 'Checked', 'Sheet', 'Row in original file']
const filledFrom = (filled: Partial<Record<FindField, string>>) => Object.entries(filled).map(([field, source]) => `${LABELS[field as FindField]}: ${source}`).join('; ')

export async function exportFoundRows(input: unknown, format: 'csv' | 'xlsx') {
  if (format !== 'csv' && format !== 'xlsx') bad('Choose CSV or Excel.')
  const rows = exportRows(input)
  // Only CSV needs the formula guard: ExcelJS writes plain strings as text, which Excel never runs.
  const values = (row: ReturnType<typeof exportRows>[number], guard: (text: string) => string = safe) => [...FIND_FIELDS.map((field) => guard(row.data[field])), guard(filledFrom(row.filled)), row.checked ? 'Yes' : 'No', guard(row.sheet), row.sourceRow === null ? '' : String(row.sourceRow)]
  if (format === 'csv') {
    const cell = (text: string) => `"${text.replace(/"/g, '""')}"`
    const lines = [HEADERS, ...rows.map((row) => values(row))].map((line) => line.map(cell).join(','))
    return { contentType: 'text/csv; charset=utf-8', filename: 'book-details.csv', body: Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8') }
  }
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Book details')
  sheet.addRow(HEADERS).font = { bold: true }
  rows.forEach((row) => {
    const added = sheet.addRow(values(row, (text) => text))
    FIND_FIELDS.forEach((field, index) => {
      const source = row.filled[field]
      if (!source) return
      const cell = added.getCell(index + 1)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6FA' } }
      cell.note = `Filled from ${source}`
    })
  })
  sheet.columns.forEach((column) => { column.width = 20 })
  return { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: 'book-details.xlsx', body: Buffer.from(await workbook.xlsx.writeBuffer()) }
}
