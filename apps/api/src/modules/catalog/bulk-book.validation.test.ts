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
