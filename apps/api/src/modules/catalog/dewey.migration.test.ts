import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('069 preserves existing copies and enforces classification integrity and private storage', async () => {
  const pg = new PGlite()
  try {
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE accounts(account_id BIGINT PRIMARY KEY);
      CREATE TABLE physical_copies(physical_copy_id BIGINT PRIMARY KEY, accession_number TEXT, barcode TEXT);
      INSERT INTO physical_copies VALUES (1,'TEST-ACC-1','TEST-BAR-1');`)
    const migration = readFileSync(new URL('../../../../../database/supabase/069_automatic_dewey.sql', import.meta.url), 'utf8')
    await pg.exec(migration); await pg.exec(migration)
    assert.deepEqual((await pg.query('SELECT * FROM physical_copies')).rows, [{physical_copy_id: 1, accession_number:'TEST-ACC-1', barcode:'TEST-BAR-1', dewey_classification_id:null, dewey_version:0}])
    await pg.exec("INSERT INTO dewey_classifications(code) VALUES ('005.100')")
    await assert.rejects(pg.exec("INSERT INTO dewey_classifications(code) VALUES ('005.100')"), /unique/)
    await assert.rejects(pg.exec("INSERT INTO dewey_classifications(code) VALUES ('5.1')"), /check/)
    await assert.rejects(pg.exec('UPDATE physical_copies SET dewey_classification_id=999'), /foreign key/)
    await pg.exec('UPDATE physical_copies SET dewey_classification_id=1')
    await assert.rejects(pg.exec('DELETE FROM dewey_classifications'), /foreign key/)
    const security = await pg.query<{relrowsecurity:boolean; allowed:boolean}>(`SELECT c.relrowsecurity, has_table_privilege('anon',c.oid,'SELECT') AS allowed FROM pg_class c WHERE c.relname IN ('dewey_classifications','dewey_assignment_events')`)
    assert.equal(security.rows.length, 2)
    assert.ok(security.rows.every(r => r.relrowsecurity && !r.allowed))
  } finally { await pg.close() }
})
