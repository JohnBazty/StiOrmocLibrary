import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import type { Pool } from '../../config/db.js'
import { toPgPlaceholders } from '../../config/sql.js'
import { parseRegisterQuery, readRegister, registerCsv } from './book-register.ts'


async function database() {
  const pg = new PGlite()
  await pg.exec(`CREATE TABLE titles (title_id BIGSERIAL PRIMARY KEY, record_type TEXT NOT NULL DEFAULT 'Book', title TEXT NOT NULL, normalized_title TEXT NOT NULL,
      publisher TEXT, publication_year INTEGER, purchase_price DECIMAL(10,2), lifecycle_status TEXT NOT NULL DEFAULT 'Active');
    CREATE TABLE authors (author_id BIGSERIAL PRIMARY KEY, title_id BIGINT NOT NULL, author_name TEXT NOT NULL, author_order INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE catalog_title_details (title_id BIGINT PRIMARY KEY, edition VARCHAR(100), page_count INTEGER);
    CREATE TABLE physical_copies (physical_copy_id BIGSERIAL PRIMARY KEY, title_id BIGINT NOT NULL, accession_number TEXT NOT NULL,
      availability_status TEXT NOT NULL DEFAULT 'Available', lifecycle_status TEXT NOT NULL DEFAULT 'Active', acquired_at DATE);`)
  await pg.exec(readFileSync(new URL('../../../../../database/supabase/037_book_register.sql', import.meta.url), 'utf8'))
  await pg.exec(`INSERT INTO titles (title, normalized_title, publisher, publication_year, classification, volumes, remarks) VALUES
      ('Clean Code', 'clean code', 'Prentice Hall', 2008, '005.1', '1 vol.', 'Donated set'),
      ('Algebra', 'algebra', NULL, NULL, NULL, NULL, NULL);
    INSERT INTO authors (title_id, author_name, author_order) VALUES (1, 'Robert C. Martin', 1), (2, 'Second Author', 2), (2, 'First Author', 1);
    INSERT INTO catalog_title_details VALUES (1, '1st ed.', 464);
    INSERT INTO physical_copies (title_id, accession_number, acquired_at, fund_source, fund_detail, cost_php, lifecycle_status) VALUES
      (1, 'STI-ACC-2026-000001', '2026-11-02', 'Donation', 'Alumni', 450, 'Active'),
      (1, 'STI-ACC-2026-000002', '2026-10-01', 'School fund', NULL, 500, 'Active'),
      (2, 'STI-ACC-2026-000003', NULL, NULL, NULL, NULL, 'Active'),
      (2, 'STI-ACC-2026-000004', '2026-01-01', 'Donation', NULL, 1, 'Archived');`)
  const execute = async (sql: string, values: unknown[] = []) => { const result = await pg.query(toPgPlaceholders(sql), values); return [result.rows, result] }
  return { pg, pool: { execute, query: execute } as unknown as Pool }
}

test('register lists one row per active copy with the 13 register columns', async () => {
  const { pg, pool } = await database()
  const page = await readRegister(pool, parseRegisterQuery({}))
  assert.equal(page.total, 3)
  assert.deepEqual(page.rows[0], {
    physicalCopyId: 1, titleId: 1, accessionNumber: 'STI-ACC-2026-000001', receivedOn: '2026-11-02', classification: '005.1',
    authors: 'Robert C. Martin', title: 'Clean Code', edition: '1st ed.', volumes: '1 vol.', pages: 464,
    fundSource: 'Donation', fundDetail: 'Alumni', costPhp: '450.00', publisher: 'Prentice Hall', publicationYear: 2008,
    remarks: 'Donated set', availability: 'Available',
  })
  assert.equal(page.rows[2].authors, 'First Author; Second Author')
  await pg.close()
})

test('register filters by date, unknown date and fund, and sorts unknown values last', async () => {
  const { pg, pool } = await database()
  const accessions = async (query: Record<string, unknown>) => (await readRegister(pool, parseRegisterQuery(query))).rows.map((row) => row.accessionNumber.slice(-1))
  assert.deepEqual(await accessions({ from: '2026-10-15', to: '2026-11-13' }), ['1'])
  assert.deepEqual(await accessions({ unknownDate: 'true' }), ['3'])
  assert.deepEqual(await accessions({ fundSource: 'Donation' }), ['1'])
  assert.deepEqual(await accessions({ noFundSource: 'true' }), ['3'])
  assert.deepEqual(await accessions({ sort: 'cost', dir: 'desc' }), ['2', '1', '3'])
  assert.deepEqual(await accessions({ sort: 'cost', dir: 'asc' }), ['1', '2', '3'])
  assert.deepEqual(await accessions({ sort: 'received', dir: 'asc' }), ['2', '1', '3'])
  assert.deepEqual(await accessions({ sort: 'title', dir: 'asc' }), ['3', '1', '2'])
  assert.deepEqual(await accessions({ limit: '2', page: '2' }), ['3'])
  await pg.close()
})

test('register refuses unknown filters and bad values', () => {
  for (const query of [{ sort: 'price; DROP' }, { dir: 'sideways' }, { from: '2026-02-30' }, { from: '2026-11-10', to: '2026-11-01' }, { fundSource: 'Lottery' }, { limit: '101' }, { page: '0' }, { unknownDate: 'true', from: '2026-01-01' }]) {
    assert.throws(() => parseRegisterQuery(query), { status: 400 }, JSON.stringify(query))
  }
})

test('register CSV has the 13 columns and neutralises spreadsheet formulas', async () => {
  const { pg, pool } = await database()
  await pg.exec("UPDATE titles SET remarks = '=HYPERLINK(1)', classification = E'\\t=1' WHERE title_id = 1")
  const csv = await registerCsv(pool, parseRegisterQuery({}))
  const lines = csv.replace('﻿', '').trim().split('\r\n')
  assert.equal(lines[0], '"No.","Date received","Class","Author","Title","Edition","Volumes","Pages","Source of fund","Cost price","Publisher","Year","Remarks"')
  assert.equal(lines.length, 4)
  assert.match(lines[1], /"'=HYPERLINK\(1\)"/)
  assert.match(lines[1], /"'\t=1"/)
  await pg.close()
})
