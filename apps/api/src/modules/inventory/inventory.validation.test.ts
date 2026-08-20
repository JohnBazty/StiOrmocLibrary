import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../../core/http-error.ts'
import { normalizeBarcode, parseConditionBody, parseInventoryListFilters } from './inventory.validation.ts'

test('normalizes barcode input and caps pagination at 100', () => {
  assert.equal(normalizeBarcode('  bc-0001  '), 'BC-0001')
  const filters = parseInventoryListFilters({ page: '2', limit: '999', condition_state: 'Damaged' })
  assert.equal(filters.page, 2)
  assert.equal(filters.limit, 100)
  assert.equal(filters.conditionState, 'Damaged')
})

test('rejects control characters and unsupported condition overrides', () => {
  assert.throws(() => normalizeBarcode('BAD\nCODE'), (error: unknown) => error instanceof HttpError && error.status === 422)
  assert.throws(() => parseConditionBody({ barcode: 'BC-1', condition_state: 'good' }), (error: unknown) => {
    return error instanceof HttpError && error.code === 'INVENTORY_VALIDATION_FAILED'
  })
})

test('maps condition override values to database enum values', () => {
  assert.deepEqual(parseConditionBody({ barcode: ' copy-42 ', condition_state: 'damaged' }), {
    barcode: 'COPY-42', conditionState: 'Damaged',
  })
  assert.equal(parseConditionBody({ barcode: 'copy-42', condition_state: 'lost' }).conditionState, 'Lost')
})
