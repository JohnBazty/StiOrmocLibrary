import assert from 'node:assert/strict'
import test from 'node:test'
import { runMigrationInPglite } from '../../test-utils/pglite-migration.ts'

test('pending attendance confirmations are private to the API table owner',async()=>{
  const pg=await runMigrationInPglite('045_attendance_user_confirmation.sql',`
    CREATE TABLE accounts(account_id BIGINT PRIMARY KEY);
    CREATE TABLE users(user_id BIGINT PRIMARY KEY);
    CREATE TABLE attendance_qr_credentials(credential_id BIGINT PRIMARY KEY);
    CREATE TABLE attendance_logs(log_id BIGINT PRIMARY KEY);
  `)
  try{
    assert.deepEqual((await pg.queryAs('library_owner','SELECT * FROM attendance_confirmation_requests')).rows,[])
    for(const role of ['anon','authenticated']){
      await assert.rejects(pg.queryAs(role,'SELECT * FROM attendance_confirmation_requests'),/permission denied/)
      await assert.rejects(pg.queryAs(role,"DELETE FROM attendance_confirmation_requests"),/permission denied/)
    }
  }finally{await pg.close()}
})
