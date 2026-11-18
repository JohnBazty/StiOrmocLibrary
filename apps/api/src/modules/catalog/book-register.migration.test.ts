import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(new URL('../../../../../database/supabase/037_book_register.sql', import.meta.url), 'utf8')

async function database() {
  const pg = new PGlite()
  await pg.exec(`CREATE TABLE titles (title_id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, purchase_price DECIMAL(10,2));
    CREATE TABLE physical_copies (physical_copy_id BIGSERIAL PRIMARY KEY, title_id BIGINT NOT NULL REFERENCES titles(title_id));
    INSERT INTO titles (title, purchase_price) VALUES ('Priced', 450.00), ('Unpriced', NULL), ('Free', 0), ('Too dear', 1000000);
    INSERT INTO physical_copies (title_id) VALUES (1), (1), (2), (3), (4);`)
  return pg
}

test('037 adds the register columns, backfills copy cost from the title price, and can run twice', async () => {
  const pg = await database()
  await pg.exec(migration)
  await pg.exec(migration)

  const costs = await pg.query<{ physical_copy_id: number; cost_php: string | null }>('SELECT physical_copy_id, cost_php FROM physical_copies ORDER BY physical_copy_id')
  assert.deepEqual(costs.rows.map((row) => row.cost_php), ['450.00', '450.00', null, '0.00', null])

  await pg.exec("UPDATE titles SET classification = '813.54', volumes = '2 vols.', remarks = 'Donated set' WHERE title_id = 1")
  await pg.exec("UPDATE physical_copies SET fund_source = 'Donation', fund_detail = 'Alumni 2026', cost_php = 0 WHERE physical_copy_id = 3")
  await pg.close()
})

test('037 rejects out-of-range register values', async () => {
  const pg = await database()
  await pg.exec(migration)
  for (const sql of [
    'UPDATE physical_copies SET cost_php = -1 WHERE physical_copy_id = 1',
    'UPDATE physical_copies SET cost_php = 1000000 WHERE physical_copy_id = 1',
    "UPDATE physical_copies SET fund_source = '' WHERE physical_copy_id = 1",
    "UPDATE titles SET classification = '' WHERE title_id = 1",
    `UPDATE titles SET remarks = '${'x'.repeat(2001)}' WHERE title_id = 1`,
  ]) await assert.rejects(pg.exec(sql), /check constraint/, sql)
  await pg.close()
})
