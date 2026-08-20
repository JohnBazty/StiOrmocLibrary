import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../../core/http-error.ts'
import { parseThesisAuditBody, parseThesisAvailabilityBody, parseThesisInventoryFilters } from './thesis-inventory.validation.ts'

test('accepts all five thesis conditions and normalizes barcodes', () => {
  for (const condition of ['good', 'fair', 'for_repair', 'damaged', 'lost'] as const) {
    const parsed = parseThesisAuditBody({ barcode: ' thesis-001 ', condition_state: condition })
    assert.equal(parsed.barcode, 'THESIS-001')
    assert.equal(parsed.conditionState, condition)
  }
})

test('rejects invalid condition and circulation-owned availability states', () => {
  assert.throws(() => parseThesisAuditBody({ barcode: 'T-1', condition_state: 'missing' }), HttpError)
  assert.throws(() => parseThesisAvailabilityBody({ barcode: 'T-1', availability_status: 'borrowed' }), HttpError)
})

test('builds bounded thesis inventory filters', () => {
  const filters = parseThesisInventoryFilters({ page: '2', limit: '999', condition_state: 'damaged', publication_year: '2026' })
  assert.equal(filters.page, 2)
  assert.equal(filters.limit, 100)
  assert.equal(filters.conditionState, 'damaged')
  assert.equal(filters.publicationYear, 2026)
})
