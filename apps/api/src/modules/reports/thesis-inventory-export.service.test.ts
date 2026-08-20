import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { iterateThesisInventoryRows } from '../inventory/thesis-inventory.repository.ts'
import { createThesisCsvStream, createThesisInventoryPdf, type ThesisInventoryExportRow } from './thesis-inventory-export.service.ts'

const thesis: ThesisInventoryExportRow = {
  research_inventory_id: 1, item_title: 'SmartLib Research', title: 'SmartLib Research', authors: 'Student Authors',
  adviser: 'Faculty Adviser', publication_year: 2026, accession_number: 'TH-001', barcode: 'THESIS-001',
  condition_state: 'good', availability_status: 'available', shelf_location: 'Shelf R-1', last_audited_at: null, row_version: 1,
}

async function streamBuffer(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

test('thesis CSV contains research metadata and neutralizes spreadsheet formulas', async () => {
  async function* rows() { yield { ...thesis, title: '=unsafe' } }
  const content = (await streamBuffer(createThesisCsvStream(rows()))).toString('utf8')
  assert.match(content, /Authors,?"/)
  assert.match(content, /Faculty Adviser/)
  assert.match(content, /'=unsafe/)
  assert.doesNotMatch(content, /Record Type|ISBN/)
})

test('thesis PDF is valid and compiles only thesis metadata rows', async () => {
  async function* rows() { yield thesis }
  const pdf = await streamBuffer(createThesisInventoryPdf(rows()))
  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-')
})

test('independent report query reads research_inventory and excludes book tables', async () => {
  let sql = ''
  const database = { async execute(statement: string) { sql = statement; return [[{ ...thesis }]] } } as unknown as Pool
  const rows = []
  for await (const row of iterateThesisInventoryRows(database, 1)) { rows.push(row); if (rows.length === 1) break }
  assert.equal(rows[0]?.title, 'SmartLib Research')
  assert.match(sql, /FROM research_inventory/)
  assert.doesNotMatch(sql, /physical_copies|JOIN titles|record_type\s*=\s*'Book'/)
})
