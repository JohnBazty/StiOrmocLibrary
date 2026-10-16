import assert from 'node:assert/strict'
import test from 'node:test'
import { loadDeskRequest } from './desk-request-context.ts'
import type { PoolConnection } from 'mysql2/promise'

const now = new Date('2026-10-16T02:00:00Z')
const ready = {user_id:7,reservation_id:9,reservation_status:'ready_for_pickup',pickup_deadline:'2026-10-17T10:00:00',copy_id:42,assigned_physical_copy_id:42,barcode:'COPY-42'}
function fixture(row:unknown = ready) {
  const writes:string[]=[]
  const q = {async execute(sql:string){if(!sql.startsWith('SELECT'))writes.push(sql);return [[row].filter(Boolean)]}} as unknown as PoolConnection
  return {q,writes}
}
test('pickup preview derives borrower and exact copy from the request without a QR or client user ID',async()=>{
  const {q,writes}=fixture()
  assert.deepEqual(await loadDeskRequest(q,{reservationId:9,userId:999},now),{userId:7,copyId:42,barcode:'COPY-42',reservationId:9})
  assert.deepEqual(writes,[])
})
test('pickup confirmation binds the displayed copy and barcode before handover',async()=>{
  const {q}=fixture()
  await assert.rejects(loadDeskRequest(q,{reservationId:9,expectedCopyId:43,barcode:'COPY-43'},now,true),{code:'DESK_REQUEST_COPY_MISMATCH'})
  await assert.rejects(loadDeskRequest(q,{reservationId:9,barcode:'COPY-42'},now,true),{code:'DESK_REQUEST_COPY_MISMATCH'})
  assert.equal((await loadDeskRequest(q,{reservationId:9,expectedCopyId:42,barcode:'copy-42'},now,true)).userId,7)
})
test('cancelled, preparing, expired and absent pickups cannot identify a checkout',async()=>{
  for(const status of ['pending','approved','cancelled','claimed']) {
    await assert.rejects(loadDeskRequest(fixture({...ready,reservation_status:status}).q,{reservationId:9},now),{code:'DESK_REQUEST_NOT_READY'})
  }
  await assert.rejects(loadDeskRequest(fixture({...ready,pickup_deadline:'2026-10-15T10:00:00'}).q,{reservationId:9},now),{code:'DESK_REQUEST_NOT_READY'})
  await assert.rejects(loadDeskRequest(fixture(null).q,{reservationId:9},now),{code:'DESK_REQUEST_STALE'})
})
test('legacy pending pickups remain usable but changed assignments and active loans are rejected',async()=>{
  const selection={transactionId:21}
  assert.equal((await loadDeskRequest(fixture({...ready,transaction_status:'Pending'}).q,selection,now)).copyId,42)
  await assert.rejects(loadDeskRequest(fixture({...ready,transaction_status:'Borrowed'}).q,selection,now),{code:'DESK_REQUEST_STALE'})
  await assert.rejects(loadDeskRequest(fixture({...ready,transaction_status:'Pending',assigned_physical_copy_id:43}).q,selection,now),{code:'DESK_REQUEST_COPY_MISMATCH'})
})
test('ambiguous and invalid pickup identifiers are rejected',async()=>{
  for(const input of [{},{reservationId:-1},{reservationId:'bad'},{reservationId:9,transactionId:21}]) {
    await assert.rejects(loadDeskRequest(fixture().q,input,now),{code:'DESK_REQUEST_INVALID'})
  }
})

test('available cart handovers identify the exact borrower and copy without a reservation timer',async()=>{
  const row={...ready,request_kind:'CartHandover',reservation_status:'approved',pickup_deadline:null}
  assert.equal((await loadDeskRequest(fixture(row).q,{reservationId:9},now)).copyId,42)
  await assert.rejects(loadDeskRequest(fixture({...row,reservation_status:'cancelled'}).q,{reservationId:9},now),{code:'DESK_REQUEST_NOT_READY'})
  await assert.rejects(loadDeskRequest(fixture({...row,copy_id:null}).q,{reservationId:9},now),{code:'DESK_REQUEST_COPY_MISMATCH'})
})
