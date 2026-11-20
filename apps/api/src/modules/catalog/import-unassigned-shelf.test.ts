import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { validateHoldingsData, type HoldingsData } from './holdings-parser.ts'
import { importCopyPlacement } from './import-placement.ts'

const row: HoldingsData = { title: 'Book', author: 'Author', isbn: '', edition: '', publisher: '', publicationYear: '', copyrightYear: '', pages: '', copies: '2', missingCopies: '', accessions: '', barcodes: '', callNumber: '', categoryId: 1, location: '', programId: null, generateAccessions: true } as unknown as HoldingsData

test('080 lets a copy (and its legacy material) have no shelf yet', async () => {
  const pg = new PGlite()
  try {
    await pg.exec(`CREATE TABLE physical_copies(physical_copy_id BIGINT PRIMARY KEY,shelf_location VARCHAR(100) NOT NULL);
      CREATE TABLE materials(material_id BIGINT PRIMARY KEY,shelf_location VARCHAR(100) NOT NULL);`)
    await pg.exec(await readFile(new URL('../../../../../database/supabase/080_unassigned_copy_shelf.sql', import.meta.url), 'utf8'))
    await pg.query('INSERT INTO physical_copies VALUES(1,NULL)')
    await pg.query('INSERT INTO materials VALUES(1,NULL)')
    await assert.rejects(pg.query("INSERT INTO physical_copies VALUES(2,'  ')"))
  } finally { await pg.close() }
})

test('an import row needs a category but not a shelf; an unmatched shelf name imports as Unassigned', () => {
  assert.deepEqual(validateHoldingsData(row), [])
  assert.ok(validateHoldingsData({ ...row, categoryId: null } as never).some(e => e.includes('category')))
  assert.deepEqual(validateHoldingsData({ ...row, shelfLocation: 'Shelf Z' } as never), [])
  assert.ok(validateHoldingsData({ ...row, location: 'x'.repeat(101) } as never).some(e => e.includes('shelf')))
})

test('a copy with no shelf is placed as Unassigned without a shelf capacity check', async () => {
  let queried = false
  const c = { execute: async () => { queried = true; return [[]] } }
  assert.deepEqual(await importCopyPlacement(c as never, row, { shelfLocation: 'Shelf A', shelfColumn: 2, shelfRow: 3 }, 2), { shelfLocation: null, shelfColumn: 1, shelfRow: 1 })
  assert.equal(queried, false)
})
