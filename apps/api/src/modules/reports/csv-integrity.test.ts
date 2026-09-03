import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createIntegrityProtectedCsvStream, verifyIntegrityProtectedCsvFile } from './csv-integrity.ts'

const TEST_SECRET = 'smartlib-test-report-integrity-secret-2026'

async function collect(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

test('verifies a streamed report file and rejects a modified file', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'smartlib-csv-integrity-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const filePath = join(directory, 'inventory.csv')

  async function* source() {
    yield '\uFEFF"Barcode","Condition"\r\n'
    yield '"BC-001","Good"\r\n'
  }

  const original = await collect(createIntegrityProtectedCsvStream(source(), 'physical_inventory', 5, TEST_SECRET))
  await writeFile(filePath, original)
  assert.deepEqual(await verifyIntegrityProtectedCsvFile(filePath, TEST_SECRET), {
    valid: true,
    dataset: 'physical_inventory',
  })

  await writeFile(filePath, Buffer.from(original.toString('utf8').replace('Good', 'Lost'), 'utf8'))
  const modified = await verifyIntegrityProtectedCsvFile(filePath, TEST_SECRET)
  assert.equal(modified.valid, false)
  assert.match(modified.reason ?? '', /changed after export/i)
})
