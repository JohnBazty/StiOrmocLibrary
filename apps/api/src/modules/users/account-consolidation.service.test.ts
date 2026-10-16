import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { createAccountConsolidationService, createConsolidatedRoleRepairService } from './account-consolidation.service.ts'

const input={survivorSchoolId:'ADMIN-PORTAL-001',retiredSchoolId:'LIB-TEST-001',reason:'Owner selected the Admin login.'}
function fixture(openActivity=0) {
  let state={accounts:[{account_id:5,user_id:5,school_id:input.survivorSchoolId,role:'Admin',account_status:'Active',auth_version:1,password_hash:'original-admin-hash'},
    {account_id:47,user_id:35,school_id:input.retiredSchoolId,role:'Librarian',account_status:'Active',auth_version:1,password_hash:'original-library-hash'}],
    users:[{user_id:5,school_id:input.survivorSchoolId,user_role:'Admin',role_id:1,account_status:'Active',auth_version:1},
      {user_id:35,school_id:input.retiredSchoolId,user_role:'Librarian',role_id:2,account_status:'Active',auth_version:1}],events:[] as object[],processedBy:35,recoveryValid:true}
  let transaction=structuredClone(state),commits=0,rollbacks=0,released=0
  const writes:string[]=[]
  const connection={beginTransaction:async()=>{transaction=structuredClone(state)},commit:async()=>{state=structuredClone(transaction);commits++},rollback:async()=>{rollbacks++},release:()=>{released++},
    execute:async(sql:string,args:number[]=[])=>{
      if(sql.includes('FROM accounts WHERE school_id'))return [transaction.accounts]
      if(sql.includes('FROM users WHERE user_id'))return [transaction.users]
      if(sql.startsWith('SELECT role_id'))return [[{role_id:2}]]
      if(sql.includes('SELECT event_id'))return [transaction.events]
      if(sql.includes('COUNT(*) FROM borrow_transactions'))return [[{loans:openActivity,requests:0,reading:0,visits:0,printing:0}]]
      writes.push(sql)
      if(sql.startsWith('UPDATE accounts')){const a=transaction.accounts.find(a=>a.account_id===args[0])!;a.auth_version++;if(sql.includes("role='Librarian'"))a.role='Librarian';else a.account_status='Archived'}
      else if(sql.startsWith('UPDATE users')){const u=transaction.users.find(u=>u.user_id===args.at(-1))!;u.auth_version++;if(sql.includes("user_role='Librarian'")){u.user_role='Librarian';u.role_id=args[0]}else if(sql.includes("account_status='Archived'"))u.account_status='Archived'}
      else if(sql.startsWith('UPDATE account_recovery_challenges'))transaction.recoveryValid=false
      else if(sql.startsWith('INSERT INTO account_management_events')){if(sql.includes("'RoleReconciled'"))transaction.events.push({action:'RoleReconciled'});else transaction.events.push({action:'RoleConsolidated'},{action:'ConsolidatedInto'})}
      else throw new Error('Unexpected mutation')
      return [{affectedRows:1}]
    }}
  return {pool:{getConnection:async()=>connection} as unknown as Pool,read:()=>state,writes,counters:()=>({commits,rollbacks,released}),replace:(fn:(s:typeof state)=>void)=>fn(state)}
}

test('consolidation retains credentials/history IDs, grants canonical authority and revokes both identities',async()=>{
  const f=fixture();let backups=0
  const result=await createAccountConsolidationService(f.pool).merge(input,async(_q,accounts,users)=>{assert.deepEqual(accounts,[5,47]);assert.deepEqual(users,[5,35]);assert.equal(f.writes.length,0);backups++})
  assert.equal(result.changed,true);assert.equal(backups,1)
  assert.equal(f.read().accounts[0].role,'Librarian');assert.equal(f.read().users[0].role_id,2)
  assert.equal(f.read().accounts[1].account_status,'Archived');assert.equal(f.read().users[1].account_status,'Archived')
  assert.deepEqual(f.read().accounts.map(a=>a.password_hash),['original-admin-hash','original-library-hash'])
  assert.deepEqual(f.read().accounts.map(a=>a.auth_version),[2,2]);assert.deepEqual(f.read().users.map(u=>u.auth_version),[2,2]);assert.equal(f.read().recoveryValid,false)
  assert.equal(f.read().processedBy,35);assert.equal(f.read().events.length,2);assert.deepEqual(f.counters(),{commits:1,rollbacks:0,released:1})
  assert.ok(f.writes.every(sql=>!sql.includes('password_hash')&&!sql.startsWith('DELETE')))
})
test('retry is a verified no-op instead of changing versions, snapshots or history again',async()=>{
  const f=fixture(),service=createAccountConsolidationService(f.pool);let backups=0
  await service.merge(input,async()=>{backups++});const previous=structuredClone(f.read())
  assert.equal((await service.merge(input,async()=>{backups++})).changed,false)
  assert.equal(backups,1);assert.deepEqual(f.read(),previous)
})
test('outstanding activity blocks retirement without any mutation or backup',async()=>{
  const f=fixture(1),previous=structuredClone(f.read())
  await assert.rejects(createAccountConsolidationService(f.pool).merge(input,async()=>{throw new Error('Should not back up')}),/open activity/)
  assert.deepEqual(f.read(),previous);assert.equal(f.writes.length,0);assert.equal(f.counters().rollbacks,1)
})
test('backup failure leaves both accounts and their credentials untouched',async()=>{
  const f=fixture(),previous=structuredClone(f.read())
  await assert.rejects(createAccountConsolidationService(f.pool).merge(input,async()=>{throw new Error('Snapshot unavailable')}),/Snapshot unavailable/)
  assert.deepEqual(f.read(),previous);assert.equal(f.writes.length,0);assert.deepEqual(f.counters(),{commits:0,rollbacks:1,released:1})
})
test('mismatched linked identity, self-merge and unrelated user roles are rejected',async()=>{
  for(const change of [(s:ReturnType<ReturnType<typeof fixture>['read']>)=>{s.users[1].school_id='someone-else'},(s:ReturnType<ReturnType<typeof fixture>['read']>)=>{s.accounts[1].role='Student'},(s:ReturnType<ReturnType<typeof fixture>['read']>)=>{s.accounts[1].user_id=5}]){
    const f=fixture();f.replace(change);await assert.rejects(createAccountConsolidationService(f.pool).merge(input,async()=>{}));assert.equal(f.writes.length,0)
  }
  await assert.rejects(createAccountConsolidationService(fixture().pool).merge({...input,retiredSchoolId:input.survivorSchoolId},async()=>{}))
})

test('repair restores only an already consolidated login, preserves credentials/history and is retry safe',async()=>{
  const f=fixture()
  await createAccountConsolidationService(f.pool).merge(input,async()=>{})
  f.replace(s=>{s.accounts[0].role='Admin'})
  const retired=structuredClone(f.read().accounts[1]),retiredProfile=structuredClone(f.read().users[1])
  const originalPassword=f.read().accounts[0].password_hash
  let snapshots=0
  const service=createConsolidatedRoleRepairService(f.pool)
  assert.equal((await service.repair(input,async(_q,accounts,users)=>{assert.deepEqual(accounts,[5,47]);assert.deepEqual(users,[5,35]);snapshots++})).changed,true)
  assert.equal(f.read().accounts[0].role,'Librarian');assert.equal(f.read().accounts[0].password_hash,originalPassword)
  assert.equal(f.read().users[0].user_role,'Librarian');assert.equal(f.read().users[0].role_id,2)
  assert.equal(f.read().accounts[0].auth_version,3);assert.equal(f.read().users[0].auth_version,3)
  assert.deepEqual(f.read().accounts[1],retired);assert.deepEqual(f.read().users[1],retiredProfile)
  assert.equal(f.read().events.length,3);assert.equal(f.read().processedBy,35)
  const after=structuredClone(f.read())
  assert.equal((await service.repair(input,async()=>{snapshots++})).changed,false)
  assert.equal(snapshots,1);assert.deepEqual(f.read(),after)
})

test('repair fails safely for missing history, unexpected profile state or unavailable snapshot',async()=>{
  for(const mode of ['history','profile','backup']) {
    const f=fixture();await createAccountConsolidationService(f.pool).merge(input,async()=>{})
    f.replace(s=>{s.accounts[0].role='Admin';if(mode==='history')s.events=[];if(mode==='profile')s.users[0].user_role='Student'})
    const before=structuredClone(f.read())
    await assert.rejects(createConsolidatedRoleRepairService(f.pool).repair(input,async()=>{throw new Error('Snapshot unavailable')}))
    assert.deepEqual(f.read(),before)
  }
})
