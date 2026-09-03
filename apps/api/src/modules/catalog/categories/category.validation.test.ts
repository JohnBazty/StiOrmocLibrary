import assert from 'node:assert/strict'
import test from 'node:test'
import { validateCategoryPayload } from './category.validation.ts'

test('trims valid category names and physical shelf layouts', () => {
  const result = validateCategoryPayload({ categoryName: '  Computer Science  ', shelfLocation: ' Shelf A-1 ' })
  assert.equal(result.isValid, true)
  assert.deepEqual(result.data, { categoryName: 'Computer Science', shelfLocation: 'Shelf A-1' })
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
