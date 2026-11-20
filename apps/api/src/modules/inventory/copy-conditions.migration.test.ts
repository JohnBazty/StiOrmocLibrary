import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

async function migrated() {
  const pg = new PGlite()
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE accounts(account_id BIGINT PRIMARY KEY);
    CREATE TABLE physical_copies(physical_copy_id BIGINT PRIMARY KEY,condition_status VARCHAR(30) NOT NULL DEFAULT 'Good');
    INSERT INTO physical_copies VALUES(1,'Good'),(2,'Good');`)
  await pg.exec(await readFile(new URL('../../../../../database/supabase/079_copy_conditions.sql', import.meta.url), 'utf8'))
  return pg
}

test('079 seeds the five base conditions, each behaving as itself', async () => {
  const pg = await migrated()
  try {
    const { rows } = await pg.query<{ name: string; behaves_as: string; is_base: boolean }>('SELECT name,behaves_as,is_base FROM copy_conditions ORDER BY sort_order')
    assert.deepEqual(rows.map(r => r.name), ['Good', 'Fair', 'For Repair', 'Damaged', 'Lost'])
    assert.ok(rows.every(r => r.is_base && r.name === r.behaves_as))
    await assert.rejects(pg.query("INSERT INTO copy_conditions(name,behaves_as,is_base) VALUES('Shiny','Good',true)"))
    await assert.rejects(pg.query("INSERT INTO copy_conditions(name,behaves_as) VALUES('Odd','Sparkly')"))
  } finally { await pg.close() }
})

test('a custom condition must match the copy base condition, and changing the base condition clears it', async () => {
  const pg = await migrated()
  try {
    const { rows: [water] } = await pg.query<{ condition_id: number }>("INSERT INTO copy_conditions(name,behaves_as) VALUES('Water damage','Damaged') RETURNING condition_id")
    await pg.query('UPDATE physical_copies SET condition_status=$1,condition_detail_id=$2 WHERE physical_copy_id=1', ['Damaged', water.condition_id])
    assert.equal((await pg.query<{ id: number }>('SELECT condition_detail_id AS id FROM physical_copies WHERE physical_copy_id=1')).rows[0].id, water.condition_id)
    await assert.rejects(pg.query('UPDATE physical_copies SET condition_detail_id=$1 WHERE physical_copy_id=2', [water.condition_id]), /does not match/)
    // Another flow (a return, a stocktake) changes only the base condition: the stale detail is cleared.
    await pg.query("UPDATE physical_copies SET condition_status='Good' WHERE physical_copy_id=1")
    assert.equal((await pg.query<{ id: number | null }>('SELECT condition_detail_id AS id FROM physical_copies WHERE physical_copy_id=1')).rows[0].id, null)
    // A used custom condition cannot be deleted out from under a copy.
    await pg.query('UPDATE physical_copies SET condition_status=$1,condition_detail_id=$2 WHERE physical_copy_id=2', ['Damaged', water.condition_id])
    await assert.rejects(pg.query('DELETE FROM copy_conditions WHERE condition_id=$1', [water.condition_id]))
  } finally { await pg.close() }
})
