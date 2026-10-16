import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { RowDataPacket } from 'mysql2/promise'
import { db, dbDriver } from '../src/config/db.js'
import { createConsolidatedRoleRepairService } from '../src/modules/users/account-consolidation.service.ts'

const snapshot=`phase1_role_repair_20261016_${randomUUID().replaceAll('-','').slice(0,8)}`
const input={survivorSchoolId:'ADMIN-PORTAL-001',retiredSchoolId:'LIB-TEST-001',reason:'Owner-authorized repair of QA P1-01: restore the retained combined Librarian/Admin login to its previously approved canonical Librarian role.'}
try {
  assert.equal(dbDriver,'postgres')
  const [identities]=await db.execute<RowDataPacket[]>('SELECT account_id,user_id,school_id,role,account_status FROM accounts WHERE school_id IN (?,?) ORDER BY account_id',[input.survivorSchoolId,input.retiredSchoolId])
  assert.deepEqual(identities.map(a=>[Number(a.account_id),Number(a.user_id),a.school_id]),[[5,5,input.survivorSchoolId],[47,35,input.retiredSchoolId]])
  if (!process.argv.includes('--apply')) console.log(JSON.stringify({mode:'preview',identities,dashboard:'/librarian/dashboard'}))
  else {
    const result=await createConsolidatedRoleRepairService(db).repair(input,async(q,accountIds,userIds)=>{
      assert.deepEqual(accountIds,[5,47]);assert.deepEqual(userIds,[5,35])
      assert.match(snapshot,/^phase1_role_repair_20261016_[a-f0-9]{8}$/)
      await q.execute(`CREATE SCHEMA ${snapshot}`)
      await q.execute(`REVOKE ALL ON SCHEMA ${snapshot} FROM PUBLIC,anon,authenticated`)
      await q.execute(`CREATE TABLE ${snapshot}.accounts AS SELECT * FROM public.accounts WHERE account_id IN (?,?)`,accountIds)
      await q.execute(`CREATE TABLE ${snapshot}.users AS SELECT * FROM public.users WHERE user_id IN (?,?)`,userIds)
      await q.execute(`CREATE TABLE ${snapshot}.account_recovery_challenges AS SELECT * FROM public.account_recovery_challenges WHERE account_id IN (?,?)`,accountIds)
      await q.execute(`CREATE TABLE ${snapshot}.account_management_events AS SELECT * FROM public.account_management_events WHERE account_id IN (?,?)`,accountIds)
      await q.execute(`REVOKE ALL ON ALL TABLES IN SCHEMA ${snapshot} FROM PUBLIC,anon,authenticated`)
    })
    if (result.changed) {
      const [checks]=await db.execute<RowDataPacket[]>(`SELECT
        (SELECT bool_and(a.password_hash=b.password_hash AND a.user_id=b.user_id AND a.school_id=b.school_id AND a.account_status=b.account_status)
          FROM public.accounts a JOIN ${snapshot}.accounts b USING(account_id)) credentials_preserved,
        (SELECT bool_and(u.password_hash=b.password_hash AND u.full_name=b.full_name AND u.email=b.email AND u.user_role=b.user_role AND u.role_id=b.role_id)
          FROM public.users u JOIN ${snapshot}.users b USING(user_id)) profiles_preserved`)
      assert.equal(checks[0].credentials_preserved,true);assert.equal(checks[0].profiles_preserved,true)
    }
    console.log(JSON.stringify({...result,snapshot:result.changed?snapshot:null,passwords:'unchanged',retiredLogin:'Archived'}))
  }
} finally {await db.end()}
