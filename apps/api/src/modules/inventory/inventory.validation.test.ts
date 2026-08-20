import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../../core/http-error.ts'
import { normalizeBarcode, parseAvailabilityBody, parseConditionBody, parseInventoryListFilters } from './inventory.validation.ts'

test('normalizes barcode input and caps pagination at 100', () => {
  assert.equal(normalizeBarcode('  bc-0001  '), 'BC-0001')
  const filters = parseInventoryListFilters({ page: '2', limit: '999', condition_state: 'Damaged' })
  assert.equal(filters.page, 2)
  assert.equal(filters.limit, 100)
  assert.equal(filters.conditionState, 'Damaged')
})

test('rejects control characters and unsupported condition values', () => {
  assert.throws(() => normalizeBarcode('BAD\nCODE'), (error: unknown) => error instanceof HttpError && error.status === 422)
  assert.throws(() => parseConditionBody({ barcode: 'BC-1', condition_state: 'new' }), (error: unknown) => {
    return error instanceof HttpError && error.code === 'INVENTORY_VALIDATION_FAILED'
  })
})

test('maps all five API condition values to database enum values', () => {
  const cases = [
    ['good', 'Good'], ['fair', 'Fair'], ['for_repair', 'For Repair'], ['damaged', 'Damaged'], ['lost', 'Lost'],
  ] as const
  for (const [input, expected] of cases) {
    assert.equal(parseConditionBody({ barcode: 'copy-42', condition_state: input }).conditionState, expected)
  }
})

test('manual availability accepts only available and unavailable', () => {
  assert.deepEqual(parseAvailabilityBody({ barcode: ' copy-42 ', availability_status: 'available' }), {
    barcode: 'COPY-42', availabilityStatus: 'Available',
  })
  assert.equal(parseAvailabilityBody({ barcode: 'copy-42', availability_status: 'unavailable' }).availabilityStatus, 'Unavailable')
  assert.throws(() => parseAvailabilityBody({ barcode: 'copy-42', availability_status: 'borrowed' }), HttpError)
})
