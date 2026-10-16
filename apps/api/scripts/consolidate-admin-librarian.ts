import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { db, dbDriver } from '../src/config/db.js'
import { createAccountConsolidationService } from '../src/modules/users/account-consolidation.service.ts'
import type { RowDataPacket } from 'mysql2/promise'

// Deliberately limited to the two identities selected by the owner. No credentials as arguments.
const backupSchema=`admin_librarian_merge_20261012_${randomUUID().replaceAll('-','').slice(0,8)}`
const input={survivorSchoolId:'ADMIN-PORTAL-001',retiredSchoolId:'LIB-TEST-001',reason:'Owner-approved consolidation into one Librarian/Admin login on 2026-10-12.'}
try {
  assert.equal(dbDriver,'postgres','This operation targets the configured Postgres database.')
  const [before]=await db.execute<RowDataPacket[]>(`SELECT account_id,user_id,school_id,role,account_status FROM accounts WHERE school_id IN (?,?) ORDER BY account_id`,[input.survivorSchoolId,input.retiredSchoolId])
  assert.deepEqual(before.map(r=>[Number(r.account_id),Number(r.user_id),r.school_id]),[[5,5,input.survivorSchoolId],[47,35,input.retiredSchoolId]],'Unexpected identity links; no changes permitted.')
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({mode:'preview',accounts:before,retainedDashboard:'/librarian/dashboard',nextStep:'Use --apply after reviewing tests and the work record.'}))
  } else {
    const result=await createAccountConsolidationService(db).merge(input,async(q,accountIds,userIds)=>{
      assert.deepEqual(accountIds,[5,47]);assert.deepEqual(userIds,[5,35]);assert.match(backupSchema,/^admin_librarian_merge_20261012_[a-f0-9]{8}$/)
      await q.execute(`CREATE SCHEMA ${backupSchema}`)
      await q.execute(`REVOKE ALL ON SCHEMA ${backupSchema} FROM PUBLIC,anon,authenticated`)
      await q.execute(`CREATE TABLE ${backupSchema}.accounts AS SELECT * FROM public.accounts WHERE account_id IN (?,?)`,accountIds)
      await q.execute(`CREATE TABLE ${backupSchema}.users AS SELECT * FROM public.users WHERE user_id IN (?,?)`,userIds)
      await q.execute(`CREATE TABLE ${backupSchema}.account_recovery_challenges AS SELECT * FROM public.account_recovery_challenges WHERE account_id IN (?,?)`,accountIds)
      await q.execute(`CREATE TABLE ${backupSchema}.account_management_events AS SELECT * FROM public.account_management_events WHERE account_id IN (?,?) OR actor_account_id IN (?,?)`,[...accountIds,...accountIds])
      await q.execute(`REVOKE ALL ON ALL TABLES IN SCHEMA ${backupSchema} FROM PUBLIC,anon,authenticated`)
    })
    if(result.changed){
      const [preserved]=await db.execute<RowDataPacket[]>(`SELECT
        (SELECT bool_and(a.password_hash=b.password_hash AND a.user_id=b.user_id AND a.school_id=b.school_id) FROM accounts a JOIN ${backupSchema}.accounts b USING(account_id)) account_credentials_preserved,
        (SELECT bool_and(u.password_hash=b.password_hash AND u.full_name=b.full_name AND u.email=b.email AND u.school_id=b.school_id) FROM users u JOIN ${backupSchema}.users b USING(user_id)) profiles_preserved`)
      assert.equal(preserved[0].account_credentials_preserved,true);assert.equal(preserved[0].profiles_preserved,true)
    }
    console.log(JSON.stringify({...result,backupSchema:result.changed?backupSchema:null,password:'unchanged',history:'original IDs and operator references retained'}))
  }
} finally {await db.end()}
