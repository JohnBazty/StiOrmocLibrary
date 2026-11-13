import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import type { Pool } from '../../config/db.js'
import { toPgPlaceholders } from '../../config/sql.js'
import { IsbnLookupRepository } from './isbn-lookup.repository.ts'

test('title lookup queries find local ISBNs and titles, treating % and _ as plain text', async () => {
  const pg = new PGlite()
  await pg.exec(`CREATE TABLE titles (title_id BIGSERIAL PRIMARY KEY, record_type TEXT NOT NULL DEFAULT 'Book', title TEXT NOT NULL, normalized_title TEXT NOT NULL,
      isbn TEXT, publisher TEXT, publication_year INTEGER, lifecycle_status TEXT NOT NULL DEFAULT 'Active');
    CREATE TABLE authors (author_id BIGSERIAL PRIMARY KEY, title_id BIGINT NOT NULL, author_name TEXT NOT NULL, author_order INTEGER NOT NULL DEFAULT 1);
    INSERT INTO titles (title, normalized_title, isbn) VALUES ('Clean Code', 'clean code', '9780132350884'), ('100% Math', '100% math', NULL), ('Thesis', 'thesis', '9780000000002');
    UPDATE titles SET record_type = 'Research/Thesis' WHERE title_id = 3;
    INSERT INTO authors (title_id, author_name) VALUES (1, 'Robert C. Martin');`)
  const execute = async (sql: string, values: unknown[] = []) => { const result = await pg.query(toPgPlaceholders(sql), values); return [result.rows, result] }
  const repository = new IsbnLookupRepository({ execute } as unknown as Pool)

  assert.deepEqual([...await repository.findLocalIsbns(['9780132350884', '9780000000002', '0000000000'])], ['9780132350884'])
  assert.deepEqual(await repository.findLocalByTitle('CLEAN'), [{ titleId: 1, title: 'Clean Code', author: 'Robert C. Martin', isbn: '9780132350884' }])
  assert.equal((await repository.findLocalByTitle('0% m')).length, 1)
  assert.equal((await repository.findLocalByTitle('_lean')).length, 0)
  await pg.close()
})
