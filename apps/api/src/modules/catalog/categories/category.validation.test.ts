import assert from 'node:assert/strict'
import test from 'node:test'
import { validateCategoryPayload } from './category.validation.ts'

test('trims valid category names and physical shelf layouts', () => {
  const result = validateCategoryPayload({ categoryName: '  Computer Science  ', shelfLocation: ' Shelf A-1 ' })
  assert.equal(result.isValid, true)
  assert.deepEqual(result.data, { categoryName: 'Computer Science', shelfLocation: 'Shelf A-1' })
})

test('rejects non-string names and malformed shelf locations', () => {
  const result = validateCategoryPayload({ categoryName: 123, shelfLocation: 'Room@Back' })
  assert.equal(result.isValid, false)
  assert.match(result.errors.categoryName, /string/i)
  assert.match(result.errors.shelfLocation, /Shelf A-1/i)
})

