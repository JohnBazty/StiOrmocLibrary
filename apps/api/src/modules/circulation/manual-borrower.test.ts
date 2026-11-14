import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveManualBorrower } from './manual-borrower.ts'
import { createDeskCirculationService, deskRequestDigest } from './desk-circulation.service.ts'
import { borrowerEligibilityRows } from '../attendance/attendance-test-fixtures.ts'

test('manual borrower lookup uses an exact parameterized School ID and active linked accounts',async()=>{
  const statements:string[]=[]
  const q={async execute(sql:string,args:unknown[]){statements.push(sql);assert.deepEqual(args,['STI-71']);return [[{user_id:71}]]}} as never
  assert.equal((await resolveManualBorrower(q,' STI-71 ')).userId,71)
  assert.match(statements[0],/LOWER\(u.school_id\)=LOWER\(\?\)/)
  assert.match(statements[0],/a.account_status='Active'/)
  assert.match(statements[0],/u.account_status='Active'/)
  await assert.rejects(resolveManualBorrower(q,'bad\nvalue'))
  await assert.rejects(resolveManualBorrower({execute:async()=>[[]]} as never,'UNKNOWN'))
  await assert.rejects(resolveManualBorrower({execute:async()=>[[{user_id:1},{user_id:2}]]} as never,'DUPLICATE'))
})
test('manual confirmation keys are bound to School ID and retain the existing QR digest',()=>{
  const input={requestId:'request-0000000001',barcode:'COPY-1',schoolId:'STI-71'}
  assert.notEqual(deskRequestDigest('TakeHome',input),deskRequestDigest('TakeHome',{...input,schoolId:'STI-72'}))
  assert.equal(deskRequestDigest('TakeHome',input),deskRequestDigest('TakeHome',{...input,schoolId:' STI-71 '}))
})
test('borrower roles cannot use manual identity lookup or check-in',async()=>{
  const service=createDeskCirculationService({getConnection:async()=>{throw new Error('Must not open a connection')}} as never)
  await assert.rejects(service.borrower({accountId:4,role:'Student'},{schoolId:'STI-71',mode:'TakeHome'}),{status:403})
  await assert.rejects(service.manualCheckIn({accountId:4,role:'Student'},{schoolId:'STI-71',mode:'TakeHome',requestId:'request-0000000001'}),{status:403})
})

function entryFixture(closed=false,full=false){
  const entries=new Map<string,{user_id:number;checked_in_by_user_id:number}>()
  const statements:string[]=[]
  const q={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},async execute(sql:string,args:unknown[]=[]){
    statements.push(sql)
    if(sql.includes('SELECT account_id FROM accounts'))return [[{account_id:args[0]}]]
    if(sql.includes('SELECT DISTINCT u.user_id'))return [[{user_id:Number(String(args[0]).split('-')[1])}]]
    if(sql.includes('SELECT user_id FROM accounts'))return [[{user_id:Number(args[0])+100}]]
    if(sql.includes('WHERE entry_request_id='))return [entries.has(String(args[0]))?[entries.get(String(args[0]))]:[]]
    if(sql.startsWith('INSERT INTO attendance_logs')){entries.set(String(args[5]),{user_id:Number(args[0]),checked_in_by_user_id:Number(args[4])});return [{insertId:12}]}
    if(sql.includes('SELECT log_id FROM attendance_logs'))return [[]]
    if(sql.includes('FROM library_operating_schedule'))return [[{day_of_week:1,is_open:!closed,opens_at:'00:00:00',closes_at:'23:59:59'}]]
    if(sql.includes('AS seats'))return [[{seats:full?80:0,services:0}]]
    if(sql.includes('FROM borrowing_policy_versions'))return [[{student_max_active_books:2}]]
    if(sql.includes('FROM profile_avatar_submissions')||sql.includes('FROM reservations r JOIN titles'))return [[]]
    const rows=borrowerEligibilityRows(sql,'Student',3)
    if(rows!==undefined)return [rows]
    throw new Error('Unexpected SQL: '+sql)
  }}
  return {entries,statements,service:createDeskCirculationService({getConnection:async()=>q} as never,()=>new Date('2026-11-16T01:00:00Z'))}
}
test('manual entry records staff provenance once, binds retries to visitor/staff and never creates a loan',async()=>{
  const f=entryFixture(),actor={accountId:1,role:'Librarian'},input={schoolId:'STI-3',mode:'TakeHome',requestId:'manual-entry-00000001'}
  assert.equal((await f.service.manualCheckIn(actor,input)).hasAttendance,true)
  await f.service.manualCheckIn(actor,input)
  assert.equal(f.entries.size,1)
  assert.equal(f.statements.filter(sql=>sql.startsWith('INSERT INTO attendance_logs')).length,1)
  assert.ok(f.statements.some(sql=>sql.includes("'Manual'")))
  assert.ok(f.statements.every(sql=>!sql.includes('INSERT INTO borrow_transactions')))
  await assert.rejects(f.service.manualCheckIn(actor,{...input,schoolId:'STI-4'}),{status:409})
  await assert.rejects(f.service.manualCheckIn({...actor,accountId:2},input),{status:409})
})
test('manual entry honors closed hours and capacity without inserting attendance',async()=>{
  for(const f of [entryFixture(true),entryFixture(false,true)]){
    await assert.rejects(f.service.manualCheckIn({accountId:1,role:'Staff'},{schoolId:'STI-3',mode:'TakeHome',requestId:'manual-entry-00000001'}))
    assert.equal(f.entries.size,0)
  }
})
