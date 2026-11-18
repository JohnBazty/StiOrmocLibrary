import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { HttpError } from '../../core/http-error.ts'
import { exportFoundRows, fillFoundRows, FIND_EXPORT_MAX, readFoundRows } from './find-book-details.ts'

const csv = (text: string) => ({ buffer: Buffer.from(text, 'utf8'), originalname: 'books.csv' })
const book = { title: 'Clean Code', author: 'Robert C. Martin', isbn: '9780132350884', publisher: 'Prentice Hall', publicationYear: 2008, subjects: [], source: 'google_books' as const }
const lookups = { lookup: async () => book, searchTitles: async () => ({ source: null, localMatches: [], candidates: [] }) }

test('reads a list without a Copies column and keeps ISBN-only rows, without touching the database', async () => {
  const { rows } = await readFoundRows(csv('﻿Title,Author,ISBN,Publisher\r\nClean Code,,9780132350884,Not verified\r\n,,978-0-13-235088-4,\r\nSection only,,,\r\n'), [{ sheet: 'sheet1', headerRow: 1, columns: { title: 1, author: 2, isbn: 3, publisher: 4 } }])
  assert.equal(rows.length, 3)
  assert.deepEqual(rows[0], { id: 1, sheet: 'sheet1', sourceRow: 2, data: { title: 'Clean Code', author: '', isbn: '9780132350884', edition: '', publisher: '', publicationYear: '', copyrightYear: '', pages: '', copies: '', summary: '' } })
  assert.equal(rows[1].data.isbn, '9780132350884')
  await assert.rejects(readFoundRows(csv('Author\r\nX\r\n'), [{ sheet: 'sheet1', headerRow: 1, columns: { author: 1 } }]), /Title or ISBN/)
})

test('fills only blanks, at most 50 rows, and reports rows it did not reach', async () => {
  const result = await fillFoundRows([{ id: 7, data: { title: 'My title', author: '', isbn: '9780132350884', publisher: '' } }], lookups)
  assert.deepEqual(result, { rows: [{ id: 7, filled: { author: { value: 'Robert C. Martin', source: 'google_books' }, publisher: { value: 'Prentice Hall', source: 'google_books' }, publicationYear: { value: '2008', source: 'google_books' } } }], notReached: [], unavailable: false })
  await assert.rejects(fillFoundRows(Array.from({ length: 51 }, (_, id) => ({ id, data: { title: 'x' } })), lookups), (error: unknown) => error instanceof HttpError && error.status === 422)
  await assert.rejects(fillFoundRows([{ id: 1, data: { title: 'x'.repeat(5001) } }], lookups), { status: 422 })
  const down = await fillFoundRows([{ id: 1, data: { isbn: '9780132350884' } }, { id: 2, data: { isbn: '9780132350884' } }], { ...lookups, lookup: async () => { throw new HttpError(503, 'DOWN', 'down') } })
  assert.deepEqual(down, { rows: [], notReached: [1, 2], unavailable: true })
})

const rows = [{ sheet: 'GE', sourceRow: 7, checked: true, data: { title: '=HYPERLINK("x")', author: 'A', isbn: '9780132350884', edition: '', publisher: 'P', publicationYear: '2008', copyrightYear: '', pages: '', copies: '2', summary: '' }, filled: { publisher: { value: 'P', source: 'google_books' as const } } }]

test('CSV export has the book columns plus source, checked and original row, and neutralises formulas', async () => {
  const file = await exportFoundRows(rows, 'csv')
  assert.equal(file.contentType, 'text/csv; charset=utf-8')
  const lines = file.body.toString('utf8').replace('﻿', '').trim().split('\r\n')
  assert.equal(lines[0], '"Title","Author","ISBN","Edition","Publisher","Year published","Copyright year","Pages","Copies","Summary","Filled from","Checked","Sheet","Row in original file"')
  assert.match(lines[1], /^"'=HYPERLINK\(""x""\)","A","9780132350884",/)
  assert.match(lines[1], /"Publisher: Google Books","Yes","GE","7"$/)
  await assert.rejects(exportFoundRows(Array.from({ length: FIND_EXPORT_MAX + 1 }, () => rows[0]), 'csv'), { status: 422 })
  await assert.rejects(exportFoundRows(rows, 'pdf' as never), { status: 422 })
})

test('Excel export marks filled cells and names their source', async () => {
  const file = await exportFoundRows(rows, 'xlsx')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(file.body as never)
  const sheet = workbook.getWorksheet('Book details')!
  assert.equal(sheet.getCell('A1').value, 'Title')
  assert.equal(sheet.getCell('A2').value, '=HYPERLINK("x")', 'kept as plain text, not a formula')
  const publisher = sheet.getCell('E2')
  assert.equal(publisher.value, 'P')
  assert.match(String((publisher.note as { texts?: Array<{ text: string }> } | string | undefined) && (typeof publisher.note === 'string' ? publisher.note : (publisher.note as { texts: Array<{ text: string }> }).texts.map((t) => t.text).join(''))), /Google Books/)
  assert.equal(sheet.getCell('L2').value, 'Yes')
})
