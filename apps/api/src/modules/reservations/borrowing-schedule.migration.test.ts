import assert from 'node:assert/strict'
import test from 'node:test'
import { runMigrationInPglite } from '../../test-utils/pglite-migration.ts'

test('schedule migration denies browser roles and preserves existing reservations', async () => {
  const db=await runMigrationInPglite('071_scheduled_borrowing.sql', `
    CREATE TABLE users(user_id BIGINT PRIMARY KEY);
    CREATE TABLE titles(title_id BIGINT PRIMARY KEY);
    CREATE TABLE reservations(reservation_id BIGINT PRIMARY KEY);
    INSERT INTO users VALUES(1); INSERT INTO titles VALUES(2); INSERT INTO reservations VALUES(3);
  `)
  try {
    for(const role of ['anon','authenticated']) await assert.rejects(db.queryAs(role,'SELECT * FROM borrowing_schedules'),/permission denied/)
    await db.queryAs('library_owner',"INSERT INTO borrowing_schedules(user_id,title_id,pickup_date,client_request_id) VALUES(1,2,'2026-11-24','request-123456789')")
    assert.equal((await db.queryAs('library_owner','SELECT * FROM borrowing_schedules')).rows.length,1)
    assert.equal((await db.queryAs('library_owner','SELECT scheduled_pickup_date FROM reservations WHERE reservation_id=3')).rows[0].scheduled_pickup_date,null)
    await assert.rejects(db.queryAs('library_owner',"INSERT INTO borrowing_schedules(user_id,title_id,pickup_date,client_request_id) VALUES(1,2,'2026-11-25','another-request-123')"),/unique/)
  } finally {await db.close()}
})
