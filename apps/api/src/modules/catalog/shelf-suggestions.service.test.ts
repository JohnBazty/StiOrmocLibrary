import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { toPgPlaceholders } from '../../config/sql.js'
import type { Pool } from '../../config/db.js'
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost/test'
const { createShelfSuggestionsService } = await import('./shelf-suggestions.service.ts')

async function fixture() {
  const pg = new PGlite()
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE catalog_locations(location_id BIGINT PRIMARY KEY,name TEXT,lifecycle_status TEXT DEFAULT 'Active',row_version INT DEFAULT 1);
    CREATE TABLE categories(category_id BIGINT PRIMARY KEY,category_name TEXT,shelf_location TEXT);
    CREATE TABLE titles(title_id BIGINT PRIMARY KEY,title TEXT,category_id BIGINT,call_number TEXT,record_type TEXT DEFAULT 'Book',lifecycle_status TEXT DEFAULT 'Active');
    CREATE TABLE dewey_classifications(classification_id BIGINT PRIMARY KEY,code TEXT);
    CREATE TABLE physical_copies(physical_copy_id BIGINT PRIMARY KEY,title_id BIGINT,accession_number TEXT,shelf_location TEXT,shelf_column INT DEFAULT 1,shelf_row INT DEFAULT 1,dewey_classification_id BIGINT,condition_status TEXT DEFAULT 'Good',availability_status TEXT DEFAULT 'Available',lifecycle_status TEXT DEFAULT 'Active');
    INSERT INTO catalog_locations(location_id,name) VALUES(1,'Shelf A'),(2,'Shelf B');
    INSERT INTO categories VALUES(10,'Programming','Shelf A'),(20,'History','Shelf B');
    INSERT INTO dewey_classifications VALUES(1,'005.133'),(2,'005.1'),(3,'900'),(4,'004.6');
    INSERT INTO titles VALUES(100,'Clean Code',10,'005.1 MAR'),(101,'Python',10,'005.133 LUT'),(102,'World History',20,'900 ROB'),(103,'Networks',20,'004.6 TAN');
    INSERT INTO physical_copies(physical_copy_id,title_id,accession_number,shelf_location,dewey_classification_id,availability_status,condition_status) VALUES
      (1,100,'A-1','Shelf A',2,'Available','Good'),
      (2,101,'A-2','Shelf B',1,'Available','Good'),
      (3,101,'A-3',NULL,1,'Available','Good'),
      (4,102,'A-4','Shelf B',3,'Available','Good'),
      (5,103,'A-5','Shelf B',4,'Available','Good'),
      (6,101,'A-6','Shelf B',1,'Borrowed','Good'),
      (7,101,'A-7','Shelf B',1,'Available','Lost');`)
  await pg.exec(await readFile(new URL('../../../../../database/supabase/081_shelf_ddc_range.sql', import.meta.url), 'utf8'))
  const execute = async (sql: string, values: readonly unknown[] = []) => {
    const result = await pg.query<Record<string, unknown>>(toPgPlaceholders(sql), [...values])
    return /^\s*(INSERT|UPDATE|DELETE)/i.test(sql) ? [{ affectedRows: result.affectedRows ?? 0, rows: result.rows }] : [result.rows]
  }
  return { pg, service: createShelfSuggestionsService({ execute, query: execute } as unknown as Pool) }
}

test('081 adds an optional DDC range to shelves and refuses a reversed or out-of-range one', async () => {
  const { pg } = await fixture()
  try {
    await pg.query('UPDATE catalog_locations SET ddc_from=4,ddc_to=5.999 WHERE location_id=1')
    await assert.rejects(pg.query('UPDATE catalog_locations SET ddc_from=6,ddc_to=5 WHERE location_id=2'))
    await assert.rejects(pg.query('UPDATE catalog_locations SET ddc_from=1000,ddc_to=1001 WHERE location_id=2'))
    await assert.rejects(pg.query('UPDATE catalog_locations SET ddc_from=1,ddc_to=NULL WHERE location_id=2'))
  } finally { await pg.close() }
})

test('suggests copies whose category or DDC range belongs on the shelf, unassigned ones included, in call-number order', async () => {
  const { pg, service } = await fixture()
  try {
    const byCategory = await service.suggestions(1)
    assert.deepEqual(byCategory.suggestions.map(item => [item.accession, item.currentShelf, item.reason]), [['A-2', 'Shelf B', 'category'], ['A-3', null, 'category']])
    assert.deepEqual(byCategory.onShelf.map(item => item.accession), ['A-1'])
    const saved = await service.saveDdcRange(1, { ddcFrom: '004', ddcTo: '005.999' })
    assert.deepEqual([saved.ddcFrom, saved.ddcTo], ['004.000', '005.999'])
    const withRange = await service.suggestions(1)
    // 004.6 (Networks, a History-category title) now belongs here by DDC; order follows the DDC number.
    assert.deepEqual(withRange.suggestions.map(item => [item.accession, item.reason]), [['A-5', 'ddc'], ['A-2', 'category'], ['A-3', 'category']])
    await assert.rejects(service.saveDdcRange(1, { ddcFrom: '6', ddcTo: '5' }), { code: 'SHELF_DDC_RANGE_INVALID' })
    await assert.rejects(service.saveDdcRange(1, { ddcFrom: '4', ddcTo: '' }), { code: 'SHELF_DDC_RANGE_INVALID' })
    const cleared = await service.saveDdcRange(1, { ddcFrom: '', ddcTo: '' })
    assert.deepEqual([cleared.ddcFrom, cleared.ddcTo], [null, null])
    await assert.rejects(service.suggestions(99), { code: 'SHELF_NOT_FOUND' })
  } finally { await pg.close() }
})
