import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('082 records when a replacement copy arrived and who received it', async () => {
  const pg = new PGlite()
  try {
    await pg.exec(`CREATE TABLE users(user_id BIGINT PRIMARY KEY); INSERT INTO users VALUES(2);
      CREATE TABLE lost_book_reports(lost_book_report_id BIGINT PRIMARY KEY,charge_resolution VARCHAR(24) NOT NULL DEFAULT 'Awaiting Review');
      INSERT INTO lost_book_reports VALUES(3,'Awaiting Replacement');`)
    await pg.exec(await readFile(new URL('../../../../../database/supabase/082_lost_book_replacement.sql', import.meta.url), 'utf8'))
    await pg.query("UPDATE lost_book_reports SET charge_resolution='Replaced',replacement_received_at=NOW(),replacement_received_by_user_id=2 WHERE lost_book_report_id=3")
    await assert.rejects(pg.query('UPDATE lost_book_reports SET replacement_received_by_user_id=99 WHERE lost_book_report_id=3'))
  } finally { await pg.close() }
})
