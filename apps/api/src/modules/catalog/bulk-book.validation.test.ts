import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../../core/http-error.ts'
import { validateBulkBookInput } from './bulk-book.validation.ts'

test('bulk validator normalizes the documented multi-copy payload', () => {
  const result = validateBulkBookInput({
    title: '  Clean Code  ', author: ' Robert C. Martin ', isbn: '978-0-13-235088-4',
    category_id: 2, shelf_location: ' Shelf A-1 ', number_of_copies: 2,
  })
  assert.equal(result.title, 'Clean Code')
  assert.equal(result.isbn, '9780132350884')
  assert.equal(result.numberOfCopies, 2)
  assert.equal(result.shelfLocation, 'Shelf A-1')
})

test('bulk validator rejects invalid ISBN, category, shelf, and quantity boundaries', () => {
  assert.throws(() => validateBulkBookInput({ title: 'Book', author: 'Author', isbn: '123', number_of_copies: 101 }), (error: unknown) => {
    assert.ok(error instanceof HttpError)
    assert.equal(error.status, 422)
    assert.equal(error.code, 'BULK_BOOK_VALIDATION_FAILED')
    assert.ok((error.details as { errors: Record<string, string> }).errors.number_of_copies)
    assert.ok((error.details as { errors: Record<string, string> }).errors.category_id)
    return true
  })
})

test('bulk validator accepts valid ISBN-10 and explains an invalid ISBN-13 check digit', () => {
  const valid = validateBulkBookInput({
    title: 'Clean Code', author: 'Robert C. Martin', isbn: 'ISBN-10: 0-13-235088-2',
    category_id: 2, shelf_location: 'Shelf A-1', number_of_copies: 1,
  })
  assert.equal(valid.isbn, '0132350882')

  assert.throws(() => validateBulkBookInput({
    title: "Charlotte's Web", author: 'E. B. White', isbn: '9780062638500',
    category_id: 2, shelf_location: 'F-A', number_of_copies: 1,
  }), (error: unknown) => {
    assert.ok(error instanceof HttpError)
    assert.equal((error.details as { errors: Record<string, string> }).errors.isbn,
      'ISBN-13 check digit is incorrect. For these first 12 digits, the final digit must be 2.')
    return true
  })
})

const registerBase = { title: 'Clean Code', author: 'Robert C. Martin', isbn: '9780132350884', category_id: 2, shelf_location: 'Shelf A-1', number_of_copies: 1 }
const registerErrors = (body: Record<string, unknown>) => {
  try { validateBulkBookInput({ ...registerBase, ...body }) } catch (error) { return (error as HttpError & { details: { errors: Record<string, string> } }).details.errors }
  return {}
}

test('bulk validator reads the book register fields', () => {
  const result = validateBulkBookInput({
    ...registerBase, classification: ' 005.1 ', edition: '2nd ed.', pages: '464', volumes: '1 vol.', remarks: ' Donated set ',
    fund_source: 'Donation', fund_detail: 'Alumni batch 2010', cost_php: '450.5', received_on: '2026-11-02',
  }, new Date('2026-11-13T00:00:00Z'))
  assert.deepEqual(
    [result.classification, result.edition, result.pages, result.volumes, result.remarks, result.fundSource, result.fundDetail, result.costPhp, result.receivedOn],
    ['005.1', '2nd ed.', 464, '1 vol.', 'Donated set', 'Donation', 'Alumni batch 2010', '450.50', '2026-11-02'],
  )
})

test('bulk validator leaves empty register fields null', () => {
  const result = validateBulkBookInput({ ...registerBase, classification: '', cost_php: '', received_on: '' })
  assert.deepEqual([result.classification, result.edition, result.pages, result.fundSource, result.costPhp, result.receivedOn], [null, null, null, null, null, null])
})

test('bulk validator refuses bad register values instead of trimming them', () => {
  const now = new Date('2026-11-13T00:00:00Z')
  const errorsAt = (body: Record<string, unknown>) => { try { validateBulkBookInput({ ...registerBase, ...body }, now) } catch (error) { return (error as HttpError & { details: { errors: Record<string, string> } }).details.errors } return {} }
  assert.ok(registerErrors({ cost_php: '-1' }).cost_php)
  assert.ok(registerErrors({ cost_php: '1000000' }).cost_php)
  assert.ok(registerErrors({ cost_php: '12.345' }).cost_php)
  assert.ok(registerErrors({ cost_php: 'abc' }).cost_php)
  assert.ok(registerErrors({ fund_source: 'Lottery' }).fund_source)
  assert.ok(registerErrors({ remarks: 'x'.repeat(2001) }).remarks)
  assert.ok(registerErrors({ classification: 'x'.repeat(101) }).classification)
  assert.ok(registerErrors({ pages: '0' }).pages)
  assert.ok(registerErrors({ received_on: '2026-02-30' }).received_on)
  assert.ok(errorsAt({ received_on: '2026-11-14' }).received_on, 'a future date is refused')
  assert.deepEqual(errorsAt({ received_on: '2026-11-13' }), {}, 'today in Manila is accepted')
})
