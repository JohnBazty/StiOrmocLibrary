import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanImportValue, matchImportReference } from './holdings-cleanup.ts'

test('formatting cleanup reports before/after values without inventing book facts', () => {
  assert.deepEqual(cleanImportValue('title', '  A\tbook\n title  '), { value: 'A book title', correction: { field: 'title', before: '  A\tbook\n title  ', after: 'A book title', reason: 'spaces' } })
  assert.equal(cleanImportValue('author', '').value, '')
  assert.equal(cleanImportValue('copies', '').value, '')
  assert.equal(cleanImportValue('copies', 'unknown').value, 'unknown')
})

test('ISBN formatting keeps every digit, including invalid check digits', () => {
  assert.equal(cleanImportValue('isbn', ' ISBN-13: 978-0-14-144114-6 ').value, '9780141441146')
  assert.equal(cleanImportValue('isbn', '978-0-14-144114-7').value, '9780141441147')
  assert.equal(cleanImportValue('isbn', ' 0-8044-2957-x ').value, '080442957X')
})

test('whole-number formatting is limited to unambiguous decimal values', () => {
  for (const field of ['copies', 'missingCopies', 'pages', 'publicationYear', 'copyrightYear']) assert.equal(cleanImportValue(field, ' 003.00 ').value, '3')
  for (const value of ['2.5', '1e2', '0x10', '1,000', '-2', '9007199254740993']) assert.equal(cleanImportValue('copies', value).value, value)
  assert.equal(cleanImportValue('copies', '0').value, '0')
})

test('accessions and barcodes retain leading zeros, separators and internal spacing', () => {
  for (const field of ['accessions', 'barcodes']) assert.equal(cleanImportValue(field, ' 00102\n00 103;000104 ').value, '00102\n00 103;000104')
  assert.equal(cleanImportValue('callNumber', '001.20').value, '001.20')
})

test('reference matching requires one active exact name after case and space normalization', () => {
  const choices = [{ id: 1, name: 'Shelf A', status: 'Active' }, { id: 2, name: 'Shelf B', status: 'Archived' }]
  assert.equal(matchImportReference('  SHELF\tＡ  ', choices)?.id, 1)
  assert.equal(matchImportReference('Shelf B', choices), null)
  assert.equal(matchImportReference('Shefl A', choices), null)
  assert.equal(matchImportReference('Shelf-A', choices), null)
  assert.equal(matchImportReference('Shelf A', [...choices, { id: 3, name: 'SHELF A', status: 'Active' }]), null)
  assert.equal(matchImportReference('', choices), null)
})
