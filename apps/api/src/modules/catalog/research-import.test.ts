import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import type { Pool } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'
import { importResearch, previewResearch, RESEARCH_IMPORT_MAX_COPIES, RESEARCH_IMPORT_MAX_ROWS } from './research-import.ts'

const HEADER = 'Copy numbers,Authors,Year,Title,Program,Adviser,Abstract,Keywords,Research code,Shelf'
const csv = (...lines: string[]) => ({ buffer: Buffer.from([HEADER, ...lines].join('\n')), originalname: 'hm.csv' })
const HM = { program_id: 7, name: 'Hospitality Management', code: 'BSHM' }

type Options = {
  takenAccessions?: string[]; takenCodes?: string[]; takenTitles?: Array<{ title: string; year: number; program: string }>
  dupOn?: string; constraint?: string; programs?: Array<typeof HM>; failRollback?: boolean
}
function fakeDatabase(options: Options = {}) {
  const state = { begins: 0, commits: 0, rollbacks: 0, statements: [] as Array<{ sql: string; values: unknown[] }>, nextId: 100 }
  const run = async (sql: string, values: unknown[] = []) => {
    state.statements.push({ sql, values })
    if (sql.includes('FROM catalog_programs')) return [options.programs ?? [HM]]
    if (sql.includes('FROM catalog_locations')) return [[{ name: 'Thesis A-1' }, { name: 'Thesis B-2' }]]
    if (sql.includes('FROM research_inventory') && sql.includes('accession_number = ANY')) return [(options.takenAccessions ?? []).map((accession_number) => ({ accession_number }))]
    if (sql.includes('FROM research_records') && sql.includes('research_code = ANY')) return [(options.takenCodes ?? []).map((research_code) => ({ research_code }))]
    if (sql.includes('FROM titles t')) return [(options.takenTitles ?? []).map((row) => ({ normalized_title: row.title.toLowerCase(), publication_year: row.year, department_or_program: row.program }))]
    if (sql.includes('last_value FROM barcode_sequences')) return [[{ last_value: 10 }]]
    if (options.dupOn && sql.includes(options.dupOn)) throw Object.assign(new Error('duplicate key'), { code: '23505', constraint: options.constraint })
    if (sql.includes('INSERT INTO titles')) return [{ insertId: 1, rows: Array.from({ length: values.length / 4 }, () => ({ title_id: state.nextId++ })) }]
    if (sql.startsWith('INSERT') || sql.startsWith('UPDATE')) return [{ insertId: state.nextId++, affectedRows: 1, rows: [] }]
    return [[]]
  }
  const connection = {
    async beginTransaction() { state.begins += 1 }, async commit() { state.commits += 1 },
    async rollback() { state.rollbacks += 1; if (options.failRollback) throw new Error('connection lost') },
    release() {}, execute: run,
  }
  return { state, database: { execute: run, getConnection: async () => connection } as unknown as Pool }
}
const writes = (state: ReturnType<typeof fakeDatabase>['state']) => state.statements.filter(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql))

test('preview reads the file, builds copy numbers and research codes, and writes nothing', async () => {
  const { state, database } = fakeDatabase()
  const result = await previewResearch(database, csv(
    '1 – 2,"Alamil, B.B.; Cruz, A.",2022,Impact of COVID-19,Hospitality Management,,,,,',
    '25,"Cataros, A.J.P.",2023,Effects of inflation,bshm,,,,,Thesis B-2',
  ), 'Thesis A-1')
  assert.equal(result.errorCount, 0)
  assert.deepEqual(result.rows[0].accessionNumbers, ['BSHM-1', 'BSHM-2'])
  assert.equal(result.rows[0].researchCode, 'BSHM-2022-1')
  assert.equal(result.rows[0].shelf, 'Thesis A-1')
  assert.deepEqual(result.rows[1].accessionNumbers, ['BSHM-25'])
  assert.equal(result.rows[1].shelf, 'Thesis B-2')
  assert.equal(writes(state).length, 0)
  assert.equal(state.statements.some(({ sql }) => /\bLIKE\b/i.test(sql)), false)
  const accessionQuery = state.statements.find(({ sql }) => sql.includes('accession_number = ANY'))
  assert.deepEqual(accessionQuery?.values, [['BSHM-1', 'BSHM-2', 'BSHM-25']])
})

test('preview lists unknown programs and reports duplicates per row', async () => {
  const { database } = fakeDatabase({ takenAccessions: ['BSHM-25'], takenTitles: [{ title: 'Taken title', year: 2024, program: 'Hospitality Management' }] })
  const result = await previewResearch(database, csv(
    '1,A. One,2022,First,Hospitality Management,,,,,',
    '1,B. Two,2022,Second,Hospitality Management,,,,,',
    '25,C. Three,2023,Third,Hospitality Management,,,,,',
    '30,D. Four,2024,Taken title,Hospitality Management,,,,,',
    '31,E. Five,2024,Fifth,Culinary Arts,,,,,',
  ), 'Thesis A-1')
  assert.deepEqual(result.unknownPrograms, ['Culinary Arts'])
  assert.deepEqual(result.rows.map((row) => row.errors.length > 0), [true, true, true, true, false], 'rows needing attention come first')
  const byRow = [...result.rows].sort((a, b) => a.row - b.row)
  assert.match(byRow[1].errors.join(' '), /BSHM-1/)
  assert.match(byRow[2].errors.join(' '), /already/)
  assert.match(byRow[3].errors.join(' '), /title/i)
  assert.equal(result.errorCount, 4)
})

test('preview checks generated research codes against the catalog', async () => {
  const { database } = fakeDatabase({ takenCodes: ['BSHM-2022-1'] })
  const result = await previewResearch(database, csv('1-2,A. One,2022,First,BSHM,,,,,'), 'Thesis A-1')
  assert.match(result.rows[0].errors.join(' '), /Research code BSHM-2022-1 is already/)
  assert.equal(result.rows[0].conflict, true)
})

test('a title already saved under the program code counts as a duplicate', async () => {
  const { database } = fakeDatabase({ takenTitles: [{ title: 'Old title', year: 2022, program: 'bshm' }] })
  const result = await previewResearch(database, csv('3,A. One,2022,Old Title,Hospitality Management,,,,,'), 'Thesis A-1')
  assert.match(result.rows[0].errors.join(' '), /title/i)
})

test('two programs with the same name or code make the row ambiguous', async () => {
  const { database } = fakeDatabase({ programs: [HM, { program_id: 8, name: 'Hotel Mgmt', code: 'BSHM' }] })
  const result = await previewResearch(database, csv('1,A. One,2022,First,BSHM,,,,,'), 'Thesis A-1')
  assert.match(result.rows[0].errors.join(' '), /ambiguous/i)
  assert.deepEqual(result.unknownPrograms, [])
})

test('preview reports the real spreadsheet row numbers across blank rows', async () => {
  const { database } = fakeDatabase()
  const result = await previewResearch(database, csv('1,A. One,2022,First,BSHM,,,,,', ',,,,,,,,,', '2,B. Two,2022,Second,BSHM,,,,,'), 'Thesis A-1')
  assert.deepEqual(result.rows.map((row) => row.row), [2, 4])
})

test('preview rejects a file without the template headers', async () => {
  const { database } = fakeDatabase()
  await assert.rejects(previewResearch(database, { buffer: Buffer.from('Title,Year\nX,2022'), originalname: 'x.csv' }, 'Thesis A-1'),
    (error: unknown) => error instanceof HttpError && error.status === 422)
})

test('preview asks for a Text format when Excel turned copy numbers into a date', async () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('HM')
  sheet.addRow(HEADER.split(','))
  sheet.addRow([new Date(Date.UTC(2026, 0, 2)), 'A. One', 2022, 'First', 'BSHM'])
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
  const { database } = fakeDatabase()
  const result = await previewResearch(database, { buffer, originalname: 'hm.xlsx' }, 'Thesis A-1')
  assert.match(result.rows[0].errors.join(' '), /Format the Copy numbers column as Text/)
  assert.equal(result.rows[0].fields.year, '2022')
})

test('preview and import refuse more than 1,000 copies in total', async () => {
  const { database } = fakeDatabase()
  const lines = Array.from({ length: 21 }, (_, index) => `${index * 50 + 1}-${index * 50 + 50},A. One,2022,Title ${index},BSHM,,,,,`)
  await assert.rejects(previewResearch(database, csv(...lines), 'Thesis A-1'), (error: unknown) => error instanceof HttpError && error.status === 422 && /1,000/.test(error.message))
  const rows = lines.map((line, index) => ({ copyNumbers: `${index * 50 + 1}-${index * 50 + 50}`, authors: 'A. One', year: '2022', title: `Title ${index}`, program: 'BSHM' }))
  assert.equal(RESEARCH_IMPORT_MAX_COPIES, 1000)
  await assert.rejects(importResearch(database, { shelf: 'Thesis A-1', rows }), (error: unknown) => error instanceof HttpError && error.status === 422 && /1,000/.test(error.message))
})

const goodRow = { copyNumbers: '1-2', authors: 'Alamil, B.B.; Cruz, A.', year: '2022', title: 'Impact of COVID-19', program: 'Hospitality Management' }

test('import saves every row and copy in one transaction with batched, parameterized inserts', async () => {
  const { state, database } = fakeDatabase()
  const result = await importResearch(database, { shelf: 'Thesis A-1', rows: [goodRow, { ...goodRow, copyNumbers: '25', title: 'Inflation' }] })
  const year = new Date().getFullYear()
  assert.equal(result.titles, 2)
  assert.equal(result.copies, 3)
  assert.equal(state.begins, 1)
  assert.equal(state.commits, 1)
  assert.equal(state.rollbacks, 0)
  const count = (table: string) => state.statements.filter(({ sql }) => sql.startsWith(`INSERT INTO ${table}`)).length
  assert.deepEqual([count('titles'), count('authors'), count('research_records'), count('research_inventory')], [1, 1, 1, 1])
  const inventory = state.statements.find(({ sql }) => sql.startsWith('INSERT INTO research_inventory'))!
  const copies = Array.from({ length: 3 }, (_, index) => inventory.values.slice(index * 8, index * 8 + 8))
  assert.deepEqual(copies.map((values) => values[5]), ['BSHM-1', 'BSHM-2', 'BSHM-25'])
  assert.deepEqual(copies.map((values) => values[6]), [11, 12, 13].map((serial) => `STIORMOC${year}${String(serial).padStart(6, '0')}`))
  assert.equal(copies[0][0], copies[1][0], 'two copies of one title share its id')
  assert.equal(Number(copies[2][0]), Number(copies[0][0]) + 1)
  assert.equal(state.statements.filter(({ sql }) => sql.includes('barcode_sequences') && sql.startsWith('UPDATE')).length, 1)
  const records = state.statements.find(({ sql }) => sql.startsWith('INSERT INTO research_records'))!
  assert.ok(records.values.includes('BSHM-2022-1'))
  assert.ok(state.statements.some(({ sql }) => sql.includes('pg_advisory_xact_lock')))
  assert.equal(state.statements.find(({ sql }) => sql.startsWith('INSERT INTO authors'))!.values.filter((value) => value === 'Cruz, A.').length, 2, 'author rows are batched across titles')
})

test('import rejects the whole file when one row conflicts, writing nothing', async () => {
  const { state, database } = fakeDatabase({ takenAccessions: ['BSHM-2'] })
  await assert.rejects(importResearch(database, { shelf: 'Thesis A-1', rows: [goodRow] }),
    (error: unknown) => error instanceof HttpError && error.status === 409 && error.code === 'RESEARCH_IMPORT_CONFLICT')
  assert.equal(writes(state).length, 0)
  assert.equal(state.commits, 0)
  assert.equal(state.rollbacks, 1)
})

test('import rejects invalid rows with 422 and unknown programs', async () => {
  const { database } = fakeDatabase()
  await assert.rejects(importResearch(database, { shelf: 'Thesis A-1', rows: [{ ...goodRow, program: 'Nowhere' }] }),
    (error: unknown) => error instanceof HttpError && error.status === 422)
  await assert.rejects(importResearch(database, { shelf: 'Thesis A-1', rows: [] }), (error: unknown) => error instanceof HttpError && error.status === 422)
})

test('a unique violation from a concurrent import is a 409 that names the colliding key, and rolls back', async () => {
  for (const [constraint, word] of [['uq_research_inventory_accession', /copy number/i], ['uq_research_inventory_barcode', /barcode/i]] as const) {
    const { state, database } = fakeDatabase({ dupOn: 'INSERT INTO research_inventory', constraint })
    await assert.rejects(importResearch(database, { shelf: 'Thesis A-1', rows: [goodRow] }),
      (error: unknown) => error instanceof HttpError && error.status === 409 && word.test(error.message))
    assert.equal(state.commits, 0)
    assert.equal(state.rollbacks, 1)
  }
  const { database } = fakeDatabase({ dupOn: 'INSERT INTO research_records', constraint: 'research_records_research_code_key' })
  await assert.rejects(importResearch(database, { shelf: 'Thesis A-1', rows: [goodRow] }), (error: unknown) => error instanceof HttpError && /research code/i.test(error.message))
})

test('a failing rollback does not hide the original error', async () => {
  const { database } = fakeDatabase({ failRollback: true, dupOn: 'INSERT INTO research_records', constraint: 'x' })
  await assert.rejects(importResearch(database, { shelf: 'Thesis A-1', rows: [goodRow] }), (error: unknown) => error instanceof HttpError && error.status === 409)
})

test('import accepts at most 500 rows', async () => {
  const { database } = fakeDatabase()
  const rows = Array.from({ length: RESEARCH_IMPORT_MAX_ROWS + 1 }, (_, index) => ({ ...goodRow, copyNumbers: String(index + 1) }))
  await assert.rejects(importResearch(database, { shelf: 'Thesis A-1', rows }), (error: unknown) => error instanceof HttpError && error.status === 422)
})
