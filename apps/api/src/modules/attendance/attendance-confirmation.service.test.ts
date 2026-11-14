import assert from 'node:assert/strict'
import test from 'node:test'
import { confirmationFixture } from './attendance-confirmation.test-db.ts'

test('admin scan sends an owner-only request; user chooses purpose and confirms entry/exit exactly once',async()=>{
  const f=await confirmationFixture()
  try{
    const scan=await f.service.create(1,{qr_payload:f.payload,request_id:'scan-request-00000001'})
    assert.equal(scan.action,'Entry');assert.equal(scan.state,'Pending')
    assert.equal((await f.pg.query('SELECT * FROM attendance_logs')).rows.length,0)
    assert.equal((await f.service.pending(3)).request,null)
    await assert.rejects(f.service.confirm(3,scan.confirmationId,{purpose:'Study'}),{status:404})
    await assert.rejects(f.service.read(2,scan.confirmationId),{status:403})
    await assert.rejects(f.service.confirm(2,scan.confirmationId,{}),{code:'ATTENDANCE_PURPOSE_REQUIRED'})
    const duplicate=await f.service.create(1,{qr_payload:f.payload,request_id:'scan-request-00000002'})
    assert.equal(duplicate.confirmationId,scan.confirmationId)
    const entered=await f.service.confirm(2,scan.confirmationId,{purpose:'Research'})
    assert.equal(entered.state,'Confirmed');assert.equal(entered.result.attendance.purpose,'Research')
    await f.service.confirm(2,scan.confirmationId,{purpose:'Printing'})
    const delayedRetry=await f.service.create(1,{qr_payload:f.payload,request_id:'scan-request-00000002'})
    assert.equal(delayedRetry.confirmationId,scan.confirmationId)
    assert.equal(delayedRetry.state,'Confirmed')
    assert.equal((await f.pg.query('SELECT * FROM attendance_logs')).rows.length,1)
    assert.equal((await f.service.pending(2)).request,null)
    assert.equal((await f.service.read(1,scan.confirmationId)).state,'Confirmed')
    f.advance(31_000)
    const next=await f.service.create(1,{qr_payload:f.payload,request_id:'scan-request-00000003'})
    assert.equal(next.action,'Exit')
    await f.service.confirm(2,next.confirmationId,{})
    await f.service.confirm(2,next.confirmationId,{})
    const visits=(await f.pg.query('SELECT * FROM attendance_logs')).rows
    assert.equal(visits.length,1);assert.ok((visits[0] as {checked_out_at:unknown}).checked_out_at)
    assert.equal((await f.pg.query('SELECT * FROM attendance_scan_receipts')).rows.length,2)
    const saved=(await f.pg.query('SELECT * FROM attendance_confirmation_requests')).rows
    assert.ok(saved.every(row=>!JSON.stringify(row).includes(f.payload)))
  }finally{await f.close()}
})
test('expired/cancelled requests cannot record attendance; ownership and input are enforced',async()=>{
  const f=await confirmationFixture()
  try{
    await assert.rejects(f.service.create(2,{qr_payload:f.payload,request_id:'scan-request-00000001'}),{status:403})
    const scan=await f.service.create(1,{qr_payload:f.payload,request_id:'scan-request-00000001'})
    await assert.rejects(f.service.confirm(2,scan.confirmationId,{purpose:'Study',userId:3}),{status:422})
    await assert.rejects(f.service.cancel(3,scan.confirmationId),{status:404})
    await f.service.cancel(2,scan.confirmationId)
    await assert.rejects(f.service.confirm(2,scan.confirmationId,{purpose:'Study'}),{code:'ATTENDANCE_REQUEST_CLOSED'})
    const another=await f.service.create(1,{qr_payload:f.payload,request_id:'scan-request-00000002'})
    f.advance(121_000)
    assert.equal((await f.service.pending(2)).request,null)
    assert.equal((await f.service.read(1,another.confirmationId)).state,'Expired')
    await assert.rejects(f.service.confirm(2,another.confirmationId,{purpose:'Study'}))
    assert.equal((await f.pg.query('SELECT * FROM attendance_logs')).rows.length,0)
  }finally{await f.close()}
})
test('confirmation rechecks hours, capacity, credential revocation and scanner authority',async()=>{
  const f=await confirmationFixture()
  try{
    const scan=await f.service.create(1,{qr_payload:f.payload,request_id:'scan-request-00000001'})
    await f.pg.exec('UPDATE library_operating_schedule SET is_open=false')
    await assert.rejects(f.service.confirm(2,scan.confirmationId,{purpose:'Study'}),{code:'ATTENDANCE_ENTRY_CLOSED'})
    await f.pg.exec('UPDATE library_operating_schedule SET is_open=true; UPDATE library_profile_settings SET seat_capacity=0')
    await assert.rejects(f.service.confirm(2,scan.confirmationId,{purpose:'Study'}),{code:'LIBRARY_AT_CAPACITY'})
    await f.pg.exec("UPDATE library_profile_settings SET seat_capacity=80; UPDATE attendance_qr_credentials SET credential_status='Revoked'")
    await assert.rejects(f.service.confirm(2,scan.confirmationId,{purpose:'Study'}),{code:'ATTENDANCE_QR_REVOKED'})
    await f.pg.exec("UPDATE attendance_qr_credentials SET credential_status='Active'; UPDATE accounts SET account_status='Deactivated' WHERE account_id=1")
    await assert.rejects(f.service.confirm(2,scan.confirmationId,{purpose:'Study'}),{status:403})
    assert.equal((await f.pg.query('SELECT * FROM attendance_logs')).rows.length,0)
  }finally{await f.close()}
})
test('an exit request cannot close a different visit opened after its scan',async()=>{
  const f=await confirmationFixture()
  try{
    await f.pg.exec("INSERT INTO attendance_logs(user_id,attendance_date,time_in,checked_in_at,reason_for_visit,seat_visit) VALUES(2,'2026-11-16','08:00','2026-11-16 08:00','Study',true)")
    const scan=await f.service.create(1,{qr_payload:f.payload,request_id:'scan-request-00000001'})
    await f.pg.exec("UPDATE attendance_logs SET time_out='08:30',checked_out_at='2026-11-16 08:30'; INSERT INTO attendance_logs(user_id,attendance_date,time_in,checked_in_at,reason_for_visit,seat_visit) VALUES(2,'2026-11-16','09:00','2026-11-16 09:00','Study',true)")
    await assert.rejects(f.service.confirm(2,scan.confirmationId,{}),{code:'ATTENDANCE_SCAN_CHANGED'})
    assert.equal((await f.pg.query('SELECT * FROM attendance_logs WHERE time_out IS NULL')).rows.length,1)
  }finally{await f.close()}
})
