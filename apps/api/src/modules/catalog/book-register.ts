import type { Pool, RowDataPacket } from '../../config/db.js'
import { authorsAgg } from '../../config/sql-dialect.js'
import { HttpError } from '../../core/http-error.ts'
import { FUND_SOURCES } from './bulk-book.validation.ts'

/** Book register (docs/plans/2026-11-13-book-register.md): one row per active book copy, ported from STI ILMS REA "Books received". */
export type RegisterRow = {
  physicalCopyId: number; titleId: number; accessionNumber: string; receivedOn: string | null; classification: string | null
  authors: string; title: string; edition: string | null; volumes: string | null; pages: number | null
  fundSource: string | null; fundDetail: string | null; costPhp: string | null; publisher: string | null; publicationYear: number | null
  remarks: string | null; availability: string
}

const SORTS = { accession: 'pc.accession_number', received: 'pc.acquired_at', title: 't.normalized_title', cost: 'pc.cost_php' } as const
type Sort = keyof typeof SORTS
const MAX_PAGE_SIZE = 100
// shortcut: the CSV holds at most this many rows; stream it in batches if the register ever grows past it.
const MAX_CSV_ROWS = 20000

export type RegisterQuery = {
  from: string | null; to: string | null; unknownDate: boolean; fundSource: string | null; noFundSource: boolean
  sort: Sort; dir: 'asc' | 'desc'; page: number; limit: number
}

const bad = (field: string, message: string): never => { throw new HttpError(400, 'REGISTER_QUERY_INVALID', message, { errors: { [field]: message } }) }
const one = (value: unknown) => (Array.isArray(value) ? value[0] : value)
const flag = (value: unknown) => one(value) === 'true'

function dateOf(value: unknown, field: string) {
  const text = one(value)
  if (text === undefined || text === '') return null
  const parsed = new Date(`${String(text)}T00:00:00Z`)
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) bad(field, 'Use a real date (YYYY-MM-DD).')
  return text as string
}

function wholeNumber(value: unknown, field: string, fallback: number, maximum: number) {
  const text = one(value)
  if (text === undefined || text === '') return fallback
  const number = Number(text)
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) bad(field, `Use a whole number from 1 to ${maximum}.`)
  return number
}

/** Validates the register filters. Every value reaches SQL as a parameter or through the SORTS whitelist. */
export function parseRegisterQuery(query: Record<string, unknown>): RegisterQuery {
  const from = dateOf(query.from, 'from'), to = dateOf(query.to, 'to')
  if (from && to && from > to) bad('to', 'The end date must be on or after the start date.')
  const unknownDate = flag(query.unknownDate)
  if (unknownDate && (from || to)) bad('unknownDate', 'Choose a date range or unknown dates, not both.')
  const fundSource = (one(query.fundSource) as string | undefined) || null
  if (fundSource && !(FUND_SOURCES as readonly string[]).includes(fundSource)) bad('fundSource', 'Unknown source of fund.')
  const sort = (one(query.sort) as string | undefined) || 'accession'
  if (!Object.hasOwn(SORTS, sort)) bad('sort', 'Sort by accession, received, title or cost.')
  const dir = (one(query.dir) as string | undefined) || 'asc'
  if (dir !== 'asc' && dir !== 'desc') bad('dir', 'Direction must be asc or desc.')
  return {
    from, to, unknownDate, fundSource, noFundSource: flag(query.noFundSource), sort: sort as Sort, dir: dir as 'asc' | 'desc',
    page: wholeNumber(query.page, 'page', 1, 100000), limit: wholeNumber(query.limit, 'limit', 50, MAX_PAGE_SIZE),
  }
}

function selectSql(query: RegisterQuery) {
  const where = ["t.record_type = 'Book'", "pc.lifecycle_status = 'Active'"]
  const values: unknown[] = []
  if (query.from) { where.push('pc.acquired_at >= ?'); values.push(query.from) }
  if (query.to) { where.push('pc.acquired_at <= ?'); values.push(query.to) }
  if (query.unknownDate) where.push('pc.acquired_at IS NULL')
  if (query.fundSource) { where.push('pc.fund_source = ?'); values.push(query.fundSource) }
  if (query.noFundSource) where.push('pc.fund_source IS NULL')
  const dir = query.dir === 'desc' ? 'DESC' : 'ASC'
  // Unknown values sort last in both directions; the accession number breaks ties.
  const order = query.sort === 'accession' ? `pc.accession_number ${dir}` : `${SORTS[query.sort]} ${dir} NULLS LAST, pc.accession_number ${dir}`
  const sql = `SELECT pc.physical_copy_id, t.title_id, pc.accession_number, to_char(pc.acquired_at, 'YYYY-MM-DD') AS received_on,
          t.classification, (SELECT ${authorsAgg('a', '; ')} FROM authors a WHERE a.title_id = t.title_id) AS authors,
          t.title, d.edition, t.volumes, d.page_count, pc.fund_source, pc.fund_detail, pc.cost_php, t.publisher, t.publication_year,
          t.remarks, pc.availability_status, COUNT(*) OVER () AS total_rows
     FROM physical_copies pc
     JOIN titles t ON t.title_id = pc.title_id
     LEFT JOIN catalog_title_details d ON d.title_id = t.title_id
    WHERE ${where.join(' AND ')}
    ORDER BY ${order}`
  return { sql, values }
}

const text = (value: unknown) => (value === null || value === undefined ? null : String(value))
const mapRow = (row: RowDataPacket): RegisterRow => ({
  physicalCopyId: Number(row.physical_copy_id), titleId: Number(row.title_id), accessionNumber: String(row.accession_number),
  receivedOn: text(row.received_on), classification: text(row.classification), authors: String(row.authors ?? ''), title: String(row.title),
  edition: text(row.edition), volumes: text(row.volumes), pages: row.page_count === null ? null : Number(row.page_count),
  fundSource: text(row.fund_source), fundDetail: text(row.fund_detail), costPhp: row.cost_php === null ? null : Number(row.cost_php).toFixed(2),
  publisher: text(row.publisher), publicationYear: row.publication_year === null ? null : Number(row.publication_year),
  remarks: text(row.remarks), availability: String(row.availability_status),
})

export async function readRegister(database: Pool, query: RegisterQuery) {
  const { sql, values } = selectSql(query)
  const [rows] = await database.execute<RowDataPacket[]>(`${sql} LIMIT ? OFFSET ?`, [...values, query.limit, (query.page - 1) * query.limit])
  return { rows: rows.map(mapRow), total: Number(rows[0]?.total_rows ?? 0), page: query.page, limit: query.limit }
}

const CSV_COLUMNS: Array<[string, (row: RegisterRow) => unknown]> = [
  ['No.', (r) => r.accessionNumber], ['Date received', (r) => r.receivedOn], ['Class', (r) => r.classification], ['Author', (r) => r.authors],
  ['Title', (r) => r.title], ['Edition', (r) => r.edition], ['Volumes', (r) => r.volumes], ['Pages', (r) => r.pages],
  ['Source of fund', (r) => [r.fundSource, r.fundDetail].filter(Boolean).join(': ')], ['Cost price', (r) => r.costPhp],
  ['Publisher', (r) => r.publisher], ['Year', (r) => r.publicationYear], ['Remarks', (r) => r.remarks],
]
// A leading = + - @, tab or carriage return can run as a spreadsheet formula; prefix a quote so it stays text.
const cell = (value: unknown) => { const raw = value === null || value === undefined ? '' : String(value); return `"${(/^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw).replace(/"/g, '""')}"` }

export async function registerCsv(database: Pool, query: RegisterQuery) {
  const { sql, values } = selectSql(query)
  const [rows] = await database.execute<RowDataPacket[]>(`${sql} LIMIT ?`, [...values, MAX_CSV_ROWS])
  const lines = [CSV_COLUMNS.map(([label]) => cell(label)).join(','), ...rows.map(mapRow).map((row) => CSV_COLUMNS.map(([, read]) => cell(read(row))).join(','))]
  return `﻿${lines.join('\r\n')}\r\n`
}
