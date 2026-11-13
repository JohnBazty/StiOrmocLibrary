import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from '../../config/db.js'
import { db } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { reserveBarcodeSequence } from './bulk-book.repository.ts'
import { parseCopyNumbers, validateResearchImportRow } from './catalog.validation.ts'
import { key, readHoldings } from './holdings-parser.ts'

/**
 * Research import from Excel/CSV (plan 2026-11-13-research-import). Preview reads and checks a file and writes nothing;
 * the import re-checks the rows inside one transaction and saves every title and copy, or nothing.
 */
export const RESEARCH_IMPORT_MAX_ROWS = 500
export const RESEARCH_IMPORT_MAX_COPIES = 1000
/** Keeps the saved rows under the API's 3 MB JSON limit, so a clean preview cannot fail on save. */
const MAX_PAYLOAD_BYTES = 2_500_000
/** Rows per multi-row INSERT. */
const CHUNK = 500
/** Serializes imports and single-thesis adds so they cannot hand out the same copy numbers or titles; unique constraints are the backstop. */
export const RESEARCH_LOCK_KEY = 734038

export const RESEARCH_IMPORT_HEADERS = ['Copy numbers', 'Authors', 'Year', 'Title', 'Program', 'Adviser', 'Abstract', 'Keywords', 'Research code', 'Shelf'] as const
const FIELD_BY_HEADER = {
  'copy numbers': 'copyNumbers', authors: 'authors', year: 'year', title: 'title', program: 'program',
  adviser: 'adviser', abstract: 'abstract', keywords: 'keywords', 'research code': 'researchCode', shelf: 'shelf',
} as const
const REQUIRED_HEADERS = ['Copy numbers', 'Authors', 'Year', 'Title', 'Program']
/** Marks a Date cell read from XLSX; Excel turns "1-2" typed into a General cell into a date. */
const DATE_MARK = '￾DATE:'

export type ResearchImportFields = Record<typeof FIELD_BY_HEADER[keyof typeof FIELD_BY_HEADER], string>
export type ResearchImportRowResult = {
  row: number
  fields: ResearchImportFields
  errors: string[]
  /** True when a copy number, research code or title already exists in the catalog (rejected with 409 on import). */
  conflict: boolean
  copies: number[]
  accessionNumbers: string[]
  researchCode: string
  programId: number | null
  programName: string | null
  shelf: string
}
type Item = { fields: ResearchImportFields; row: number }

type Query = Pick<PoolConnection, 'execute'>
type Program = { id: number; name: string; code: string }
const bad = (message: string, code = 'RESEARCH_IMPORT_INVALID', details?: Record<string, unknown>) => new HttpError(422, code, message, details)
const text = (value: unknown) => (value === undefined || value === null ? '' : String(value))
const rowsOf = async (q: Query, sql: string, values: unknown[] = []) => (await q.execute<RowDataPacket[]>(sql, values))[0]
const lower = (value: string) => value.toLocaleLowerCase('en-US')
const titleKey = (title: string, year: number | string, program: string) => `${lower(title)}|${year}|${lower(program)}`
const slices = <T>(items: T[]) => Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, index) => items.slice(index * CHUNK, (index + 1) * CHUNK))
const marks = (count: number, width: number) => Array.from({ length: count }, () => `(${Array(width).fill('?').join(', ')})`).join(', ')

function copyCount(fields: ResearchImportFields) {
  try { return parseCopyNumbers(fields.copyNumbers).length } catch { return 0 }
}
function assertCopyLimit(items: Item[]) {
  const total = items.reduce((sum, item) => sum + copyCount(item.fields), 0)
  if (total > RESEARCH_IMPORT_MAX_COPIES) throw bad(`This list has ${total.toLocaleString('en-PH')} copies; import at most ${RESEARCH_IMPORT_MAX_COPIES.toLocaleString('en-PH')} copies at a time.`)
}

/** Reads the template's columns from the first sheet; unknown columns are ignored. Row numbers are the spreadsheet's own. */
export async function readResearchFile(file: { buffer: Buffer; originalname: string } | undefined): Promise<Item[]> {
  if (!file) throw bad('Choose a research list file.')
  const [sheet] = await readHoldings(file, (date) => `${DATE_MARK}${date.getFullYear()}`)
  const header = sheet?.rows[0] ?? []
  const columns = new Map<string, number>()
  header.forEach((value, index) => { const name = key(value); if (name in FIELD_BY_HEADER && !columns.has(name)) columns.set(name, index) })
  const missing = REQUIRED_HEADERS.filter((name) => !columns.has(key(name)))
  if (missing.length) throw bad(`The first row must hold the template columns. Missing: ${missing.join(', ')}.`)
  const items = sheet.rows.slice(1).map((cells, index): Item => ({
    row: index + 2,
    fields: Object.fromEntries(Object.entries(FIELD_BY_HEADER).map(([name, field]) => {
      const value = text(cells[columns.get(name) ?? -1]).trim()
      // Only the Copy numbers column keeps the mark; a date in another column (Year) is read as its year.
      return [field, field !== 'copyNumbers' && value.startsWith(DATE_MARK) ? value.slice(DATE_MARK.length) : value]
    })) as ResearchImportFields,
  })).filter((item) => Object.values(item.fields).some(Boolean))
  if (!items.length) throw bad('The file has no research rows.')
  if (items.length > RESEARCH_IMPORT_MAX_ROWS) throw bad(`Import at most ${RESEARCH_IMPORT_MAX_ROWS} research titles at a time; split the file.`)
  assertCopyLimit(items)
  if (JSON.stringify(items.map((item) => item.fields)).length > MAX_PAYLOAD_BYTES) throw bad('This list is too large to import in one go; split the file.')
  return items
}

/** Existing catalog values that could collide with the candidate copy numbers, research codes and titles. */
async function loadTaken(q: Query, accessions: string[], codes: string[], titles: string[]) {
  const taken = { accessions: new Set<string>(), codes: new Set<string>(), titles: new Set<string>() }
  if (accessions.length) for (const row of await rowsOf(q, 'SELECT accession_number FROM research_inventory WHERE accession_number = ANY(?)', [accessions])) taken.accessions.add(String(row.accession_number))
  if (codes.length) for (const row of await rowsOf(q, 'SELECT research_code FROM research_records WHERE research_code = ANY(?)', [codes])) taken.codes.add(String(row.research_code))
  if (titles.length) {
    const found = await rowsOf(q, 'SELECT t.normalized_title, t.publication_year, rr.department_or_program FROM titles t JOIN research_records rr ON rr.title_id = t.title_id WHERE t.normalized_title = ANY(?)', [titles])
    for (const row of found) taken.titles.add(titleKey(String(row.normalized_title), Number(row.publication_year), String(row.department_or_program ?? '')))
  }
  return taken
}

/** Checks every row against the file itself and against the catalog; shared by preview and import. */
async function evaluate(q: Query, items: Item[], defaultShelf: string) {
  const programs = (await rowsOf(q, "SELECT program_id, name, code FROM catalog_programs WHERE lifecycle_status = 'Active'"))
    .map((row): Program => ({ id: Number(row.program_id), name: String(row.name), code: String(row.code) }))
  const shelves = (await rowsOf(q, "SELECT name FROM catalog_locations WHERE lifecycle_status = 'Active'")).map((row) => String(row.name))
  // First pass: everything a row would save, so the catalog is asked about the exact copy numbers and codes (generated ones included).
  const prepared = items.map(({ fields, row }) => {
    const validation = validateResearchImportRow(fields)
    const lookup = key(fields.program)
    const matches = fields.program ? programs.filter((candidate) => key(candidate.name) === lookup || key(candidate.code) === lookup) : []
    const program = matches.length === 1 ? matches[0] : null
    const copies = validation.data.copyNumbers
    const accessionNumbers = program ? copies.map((copy) => `${program.code}-${copy}`) : []
    const researchCode = validation.data.researchCode || (program && copies.length && validation.data.year ? `${program.code}-${validation.data.year}-${copies[0]}`.toUpperCase() : '')
    return { fields, row, validation, matches, program, copies, accessionNumbers, researchCode }
  })
  const taken = await loadTaken(q,
    [...new Set(prepared.flatMap((item) => item.accessionNumbers))],
    [...new Set(prepared.map((item) => item.researchCode).filter(Boolean))],
    [...new Set(prepared.map((item) => lower(item.validation.data.title)).filter(Boolean))])
  const seen = { accessions: new Map<string, number>(), codes: new Map<string, number>(), titles: new Map<string, number>() }
  const unknown = new Set<string>()
  const results = prepared.map(({ fields, row, validation, matches, program, copies, accessionNumbers, researchCode }): ResearchImportRowResult => {
    const errors = Object.values(validation.errors)
    let conflict = false
    const fail = (message: string, isConflict = false) => { errors.push(message); conflict ||= isConflict }
    if (fields.copyNumbers.startsWith(DATE_MARK)) { errors.splice(errors.indexOf(validation.errors.copyNumbers), 1); fail('Excel turned the copy numbers into a date. Format the Copy numbers column as Text and enter them again.') }
    if (matches.length > 1) fail(`Program "${fields.program}" is ambiguous: more than one active program uses it.`)
    else if (fields.program && !program) { unknown.add(fields.program); fail(`Program "${fields.program}" does not exist yet.`) }
    const wanted = fields.shelf || defaultShelf
    const shelf = shelves.find((name) => lower(name) === lower(wanted)) ?? ''
    if (!shelf) fail(wanted ? `Shelf "${wanted}" is not a managed location.` : 'Choose a shelf.')
    for (const accession of accessionNumbers) {
      if (taken.accessions.has(accession)) fail(`Copy ${accession} is already in the catalog.`, true)
      else if (seen.accessions.has(accession)) fail(`Copy ${accession} is also in row ${seen.accessions.get(accession)}.`)
      else seen.accessions.set(accession, row)
    }
    if (researchCode) {
      if (taken.codes.has(researchCode)) fail(`Research code ${researchCode} is already in the catalog.`, true)
      else if (seen.codes.has(researchCode)) fail(`Research code ${researchCode} is also in row ${seen.codes.get(researchCode)}.`)
      else seen.codes.set(researchCode, row)
    }
    if (program && validation.data.title) {
      const { title, year } = validation.data
      const identity = titleKey(title, year, program.name)
      // Older rows may hold the program code instead of its name.
      if (taken.titles.has(identity) || taken.titles.has(titleKey(title, year, program.code))) fail('A research title with this title, year and program is already in the catalog.', true)
      else if (seen.titles.has(identity)) fail(`The same title, year and program is also in row ${seen.titles.get(identity)}.`)
      else seen.titles.set(identity, row)
    }
    return { row, fields, errors, conflict, copies, accessionNumbers, researchCode, programId: program?.id ?? null, programName: program?.name ?? null, shelf }
  })
  return { results, unknownPrograms: [...unknown] }
}

export async function previewResearch(database: Pool, file: { buffer: Buffer; originalname: string } | undefined, defaultShelf: string) {
  const items = await readResearchFile(file)
  const { results, unknownPrograms } = await evaluate(database, items, text(defaultShelf).trim())
  // Rows needing attention first.
  const ordered = [...results].sort((a, b) => Number(b.errors.length > 0) - Number(a.errors.length > 0) || a.row - b.row)
  return { rows: ordered, unknownPrograms, total: results.length, errorCount: results.filter((row) => row.errors.length).length }
}

function importBody(body: unknown) {
  const input = body && typeof body === 'object' ? body as { rows?: unknown; shelf?: unknown } : {}
  if (!Array.isArray(input.rows) || input.rows.length < 1) throw bad('Add at least one research row to import.')
  if (input.rows.length > RESEARCH_IMPORT_MAX_ROWS) throw bad(`Import at most ${RESEARCH_IMPORT_MAX_ROWS} research titles at a time.`)
  const items = input.rows.map((raw, index): Item => {
    const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const row = Number.isSafeInteger(value.row) && Number(value.row) > 0 ? Number(value.row) : index + 2
    return { row, fields: Object.fromEntries(Object.values(FIELD_BY_HEADER).map((field) => [field, text(value[field]).trim()])) as ResearchImportFields }
  })
  assertCopyLimit(items)
  return { items, shelf: text(input.shelf).trim() }
}

/** Names the key a concurrent import collided on, from the Postgres constraint name. */
function duplicateMessage(error: { constraint?: string; table?: string }) {
  const name = `${error.constraint ?? ''} ${error.table ?? ''}`
  const what = /accession/i.test(name) ? 'copy number' : /barcode/i.test(name) ? 'barcode' : /research_code|research_records/i.test(name) ? 'research code' : 'copy number, research code or barcode'
  return `Another import or entry just used the same ${what}. Nothing was saved; check the file again.`
}

async function insertAll(connection: Query, rows: ResearchImportRowResult[], year: number, firstSerial: number) {
  const data = rows.map((result) => ({ result, ...validateResearchImportRow(result.fields).data }))
  const titleIds: number[] = []
  for (const part of slices(data)) {
    const [header] = await connection.execute<ResultSetHeader>(
      `INSERT INTO titles (category_id, record_type, title, normalized_title, isbn, publication_year, publisher, call_number, search_text, lifecycle_status, created_at)
       VALUES ${part.map(() => "(NULL, 'Research/Thesis', ?, ?, NULL, ?, NULL, NULL, ?, 'Active', NOW())").join(', ')} RETURNING title_id`,
      part.flatMap((item) => [item.title, lower(item.title), item.year, [item.title, ...item.authors, item.adviser, item.result.researchCode, item.result.programName, item.keywords].filter(Boolean).join(' ')]))
    // RETURNING follows VALUES order.
    titleIds.push(...header.rows.map((row) => Number(row.title_id)))
  }
  if (titleIds.length !== data.length) throw new Error('The titles were not all saved.')
  const authors = data.flatMap((item, index) => item.authors.map((author, order) => [titleIds[index], author, lower(author), order + 1]))
  for (const part of slices(authors)) await connection.execute(`INSERT INTO authors (title_id, author_name, normalized_name, author_order, created_at) VALUES ${part.map(() => '(?, ?, ?, ?, NOW())').join(', ')}`, part.flat())
  for (const part of slices(data.map((item, index) => ({ item, titleId: titleIds[index] })))) {
    await connection.execute(
      `INSERT INTO research_records (title_id, research_code, adviser_name, department_or_program, abstract_text, keywords_text, viewing_status, created_at)
       VALUES ${part.map(() => "(?, ?, ?, ?, ?, ?, 'Available for Viewing', NOW())").join(', ')}`,
      part.flatMap(({ item, titleId }) => [titleId, item.result.researchCode, item.adviser, item.result.programName, item.abstract, item.keywords]))
  }
  let serial = firstSerial
  const copies = data.flatMap((item, index) => item.result.accessionNumbers.map((accession) => {
    const barcode = `STIORMOC${year}${String(serial).padStart(6, '0')}`
    serial += 1
    return [titleIds[index], item.title, item.authors.join(', '), item.adviser, item.year, accession, barcode, item.result.shelf]
  }))
  // qr_code_data stays empty: the asset routes draw the QR from the copy's identity when none is stored.
  for (const part of slices(copies)) {
    await connection.execute(
      `INSERT INTO research_inventory (title_id, title, authors, adviser, publication_year, accession_number, barcode, qr_code_data, condition_state, availability_status, shelf_location, created_at)
       VALUES ${part.map(() => "(?, ?, ?, ?, ?, ?, ?, NULL, 'good', 'available', ?, NOW())").join(', ')}`, part.flat())
  }
  return copies.length
}

export async function importResearch(database: Pool = db, body: unknown) {
  const { items, shelf } = importBody(body)
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    await connection.execute('SELECT pg_advisory_xact_lock(?)', [RESEARCH_LOCK_KEY])
    const { results } = await evaluate(connection, items, shelf)
    const failed = results.filter((result) => result.errors.length)
    if (failed.length) {
      const conflict = failed.some((result) => result.conflict)
      throw new HttpError(conflict ? 409 : 422, conflict ? 'RESEARCH_IMPORT_CONFLICT' : 'RESEARCH_IMPORT_INVALID',
        'Some rows cannot be imported. Nothing was saved.', { rows: failed.map(({ row, errors }) => ({ row, errors })) })
    }
    const year = new Date().getFullYear()
    const totalCopies = results.reduce((sum, result) => sum + result.copies.length, 0)
    // One sequence reservation for the whole import.
    const firstSerial = await reserveBarcodeSequence(connection, year, totalCopies)
    await insertAll(connection, results, year, firstSerial)
    await connection.commit()
    return { titles: results.length, copies: totalCopies }
  } catch (error) {
    try { await connection.rollback() } catch { /* the original error matters more than a broken connection */ }
    if (['23505', 'ER_DUP_ENTRY'].includes((error as { code?: string } | null)?.code ?? '')) {
      throw new HttpError(409, 'RESEARCH_IMPORT_CONFLICT', duplicateMessage(error as { constraint?: string; table?: string }))
    }
    throw error
  } finally {
    connection.release()
  }
}
