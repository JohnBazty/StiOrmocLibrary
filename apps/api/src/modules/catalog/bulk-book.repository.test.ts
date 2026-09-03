import assert from 'node:assert/strict'
import test from 'node:test'
import { reserveBarcodeSequence } from './bulk-book.repository.ts'

test('barcode sequence allocator quotes MySQL identifiers and reserves one contiguous range', async () => {
  const statements: Array<{ sql: string; values: unknown[] }> = []
  const connection = {
    async execute(sql: string, values: unknown[]) {
      statements.push({ sql, values })
      if (sql.startsWith('SELECT')) return [[{ last_value: 41 }]]
      return [{ affectedRows: 1 }]
    },
  }

  const first = await reserveBarcodeSequence(connection as never, 2026, 3)

  assert.equal(first, 42)
  assert.equal(statements.length, 3)
  assert.match(statements[0].sql, /`sequence_year`.*`last_value`/)
  assert.match(statements[1].sql, /SELECT `last_value`.*`sequence_year` = \? FOR UPDATE/)
  assert.match(statements[2].sql, /SET `last_value` = \?.*`sequence_year` = \?/)
  assert.deepEqual(statements[2].values, [44, 2026])
})
