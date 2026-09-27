import assert from 'node:assert/strict'
import test from 'node:test'
import { validateCategoryPayload } from './category.validation.ts'

test('trims valid category names and physical shelf layouts', () => {
  const result = validateCategoryPayload({ categoryName: '  Computer Science  ', shelfLocation: ' Shelf A-1 ' })
  assert.equal(result.isValid, true)
  assert.deepEqual(result.data, { categoryName: 'Computer Science', description: '', shelfLocation: 'Shelf A-1', shelfColumn: 1, shelfRow: 1 })
})

test('accepts versatile administrator-defined location text', () => {
  for (const shelfLocation of ['Aisle 3', 'Cabinet 4-B', 'Room@Back', 'Research Area West']) {
    const result = validateCategoryPayload({ categoryName: 'Computer Science', shelfLocation })
    assert.equal(result.isValid, true)
    assert.equal(result.data.shelfLocation, shelfLocation)
  }
})

test('rejects non-string names and empty shelf locations', () => {
  const result = validateCategoryPayload({ categoryName: 123, shelfLocation: '   ' })
  assert.equal(result.isValid, false)
  assert.match(result.errors.categoryName, /string/i)
  assert.match(result.errors.shelfLocation, /required/i)
})

test('accepts an optional description but rejects non-text or oversized values', () => {
  assert.equal(validateCategoryPayload({ categoryName: 'Programming', description: '  Apps   and algorithms ', shelfLocation: 'A1' }).data.description, 'Apps and algorithms')
  assert.match(validateCategoryPayload({ categoryName: 'Programming', description: 5, shelfLocation: 'A1' }).errors.description, /string/i)
  assert.match(validateCategoryPayload({ categoryName: 'Programming', description: 'x'.repeat(256), shelfLocation: 'A1' }).errors.description, /255/)
})
