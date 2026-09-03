import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import type { InventoryExportRow } from './catalog-export.service.ts'
import { createCsvStream, createInventoryPdf } from './catalog-export.service.ts'
import { CSV_INTEGRITY_MARKER, verifyIntegrityProtectedCsv } from './csv-integrity.ts'

async function* rows(): AsyncGenerator<InventoryExportRow> {
  yield {
    recordType: 'Book', title: '=DANGEROUS()', authors: 'A "Quoted" Author', isbn: '9780132350884',
    category: 'Programming', publicationYear: '2008', accessionNumber: 'ACC-1', barcode: 'BC-1',
    shelfLocation: 'IT-A1', condition: 'Good', availability: 'Available', researchCode: '', adviser: '',
  }
}

async function collect(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = []
  stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
  await once(stream, 'end')
  return Buffer.concat(chunks)
}

test('streams escaped CSV and neutralizes spreadsheet formulas', async () => {
  const buffer = await collect(createCsvStream(rows()))
  const output = buffer.toString('utf8')
  assert.match(output, /^\uFEFF"Record Type"/)
  assert.match(output, /"'=DANGEROUS\(\)"/)
  assert.match(output, /"A ""Quoted"" Author"/)
  assert.match(output, new RegExp(CSV_INTEGRITY_MARKER))
  assert.deepEqual(verifyIntegrityProtectedCsv(buffer), { valid: true, dataset: 'catalog_inventory' })
})

test('detects any manipulation of a downloaded inventory CSV', async () => {
  const original = await collect(createCsvStream(rows()))
  const changed = Buffer.from(original.toString('utf8').replace('BC-1', 'BC-9'), 'utf8')
  const result = verifyIntegrityProtectedCsv(changed)
  assert.equal(result.valid, false)
  assert.equal(result.dataset, 'catalog_inventory')
  assert.match(result.reason ?? '', /changed after export/i)
})

test('creates a valid PDF stream with the STI inventory header', async () => {
  const output = await collect(createInventoryPdf(rows()))
  assert.equal(output.subarray(0, 4).toString(), '%PDF')
  assert.ok(output.length > 500)
})
