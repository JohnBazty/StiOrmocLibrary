import assert from 'node:assert/strict'
import test from 'node:test'
import { isbnValidationMessage, isValidIsbn, normalizeIsbn, validateBookEntry, validateThesisEntry, validateThesisMetadata } from './catalog.validation.ts'

test('validates and normalizes a complete thesis metadata entry', () => {
  const result = validateThesisMetadata({
    title: '  Smart Library Management System  ',
    author: '  Maria Dela Cruz  ',
    adviser: ' Prof. Ana Santos ',
    year: new Date().getFullYear(),
    abstract: 'This study evaluates a smart library platform for STI College Ormoc.',
    researchCode: ' th-bsit-2026-001 ',
    department: 'BS Information Technology',
  })

  assert.equal(result.isValid, true)
  assert.deepEqual(result.errors, {})
  assert.equal(result.data.title, 'Smart Library Management System')
  assert.deepEqual(result.data.authors, ['Maria Dela Cruz'])
  assert.equal(result.data.adviser, 'Prof. Ana Santos')
  assert.equal(result.data.researchCode, 'TH-BSIT-2026-001')
})

test('returns field-specific thesis errors for Title, Author, Adviser, Year, and Abstract', () => {
  const result = validateThesisMetadata({
    title: '',
    author: '',
    adviser: '',
    year: 'not-a-year',
    abstract: 'Too short',
    researchCode: '',
    department: '',
  })

  assert.equal(result.isValid, false)
  assert.ok(result.errors.title)
  assert.ok(result.errors.author)
  assert.ok(result.errors.adviser)
  assert.ok(result.errors.year)
  assert.ok(result.errors.abstract)
})

test('requires only a shelf and defaults generated thesis identity fields', () => {
  const result = validateThesisEntry({
    title: 'Smart Library Research', author: 'Maria Santos', adviser: 'Dr. Ana Cruz',
    year: new Date().getFullYear(), abstract: 'This complete abstract describes the research inventory workflow.',
    researchCode: 'TH-2026-010', department: 'BSIT',
    copy: { shelfLocation: 'Research A-2' },
  })
  assert.equal(result.isValid, true)
  assert.equal(result.data.copy.barcode, '')
  assert.equal(result.data.copy.accessionNumber, '')
  assert.equal(result.data.copy.conditionStatus, 'Good')

  const missingCopy = validateThesisEntry({
    title: 'Smart Library Research', author: 'Maria Santos', adviser: 'Dr. Ana Cruz',
    year: new Date().getFullYear(), abstract: 'This complete abstract describes the research inventory workflow.',
    researchCode: 'TH-2026-011', department: 'BSIT',
  })
  assert.equal(missingCopy.isValid, false)
  assert.ok(missingCopy.errors.shelfLocation)
})

test('validates ISBN checksums and physical-copy fields for books', () => {
  assert.equal(normalizeIsbn('978-0-13-235088-4'), '9780132350884')
  assert.equal(isValidIsbn('9780132350884'), true)
  assert.equal(isValidIsbn('9780132350885'), false)

  const result = validateBookEntry({
    title: 'Clean Code',
    author: 'Robert C. Martin',
    isbn: '978-0-13-235088-4',
    year: 2008,
    barcode: 'bc-00128',
    accessionNumber: 'acc-00128',
    shelfLocation: 'IT-A12',
    condition: 'Good',
  })

  assert.equal(result.isValid, true)
  assert.equal(result.data.isbn, '9780132350884')
  assert.equal(result.data.copy.barcode, 'BC-00128')
  assert.equal(result.data.copy.accessionNumber, 'ACC-00128')
})

test('normalizes common ISBN-10 and ISBN-13 labels and Unicode separators', () => {
  assert.equal(normalizeIsbn('ISBN-13: 978‑0‑13‑235088‑4'), '9780132350884')
  assert.equal(normalizeIsbn('ISBN-10: 0-13-235088-2'), '0132350882')
  assert.equal(isValidIsbn(normalizeIsbn('ISBN-10: 0-13-235088-2')), true)
  assert.equal(isValidIsbn(normalizeIsbn('ISBN-10: 0-8044-2957-X')), true)
})

test('reports the expected ISBN check digit instead of a generic validation error', () => {
  assert.equal(isbnValidationMessage('9780062638500'), 'ISBN-13 check digit is incorrect. For these first 12 digits, the final digit must be 2.')
  assert.equal(isbnValidationMessage('0132350881'), 'ISBN-10 check digit is incorrect. For these first 9 digits, the final character must be 2.')
  assert.equal(isbnValidationMessage('9780132350884'), null)
  assert.equal(isbnValidationMessage('0132350882'), null)
})
