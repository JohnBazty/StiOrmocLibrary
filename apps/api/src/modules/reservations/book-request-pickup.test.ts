import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
import { createBookRequestService } from './book-request.service.ts'
import { requestInstructions } from './book-request-events.ts'
import { borrowerEligibilityRows } from '../attendance/attendance-test-fixtures.ts'

function fixture(closedDates:string[]=[],openDays=[1,2,3,4,5,6],scheduledDate:string|null=null) {
 const state={deadline:null as Date|null,commits:0,rollbacks:0}
 const row={reservation_id:9,user_id:7,book_title_id:2,request_kind:'Reservation',reservation_status:'approved',assigned_physical_copy_id:30,accession_id:3,title:'QA Pickup',scheduled_pickup_date:scheduledDate}
 const q={async beginTransaction(){},async commit(){state.commits++},async rollback(){state.rollbacks++},release(){},async execute(sql:string,values:any[]=[]):Promise<any>{
  if(sql.includes('SELECT day_of_week,is_open'))return [openDays.map(day_of_week=>({day_of_week,is_open:true,opens_at:'08:00',closes_at:'17:00'}))]
  if(sql.includes('FROM library_closed_days'))return [closedDates.map(closed_date=>({closed_date}))]
  if(sql.includes('SELECT user_id,role,account_status FROM accounts'))return [[{user_id:1,role:'Librarian',account_status:'Active'}]]
  if(sql.includes('SELECT r.*,t.title'))return [[{...row,deadline:state.deadline}]]
  if(sql.includes('SELECT pc.*,t.title'))return [[]]
  if(sql.includes('SELECT pc.* FROM physical_copies'))return [[{physical_copy_id:30}]]
  if(sql.includes('FROM borrowing_policy_versions'))return [[{borrowing_policy_version_id:1,student_max_active_books:2,borrowing_days:1}]]
  if(sql.includes('FROM borrowing_policy_material_rules'))return [[{is_borrowable:true}]]
  if(sql.includes('COUNT(*) AS total FROM ('))return [[{total:1}]]
  if(sql.includes("UPDATE reservations SET reservation_status='ready_for_pickup'")){state.deadline=values[1];row.reservation_status='ready_for_pickup';return [{affectedRows:1}]}
  const eligible=borrowerEligibilityRows(sql,'Student',7)
  return [eligible??[]]
 }}
 return {state,pool:{getConnection:async()=>q} as unknown as Pool}
}
for(const [label,closures,expected] of [
 ['Sunday',[],'2026-11-16T09:00:00.000Z'],
 ['Sunday and Monday holiday',['2026-11-16'],'2026-11-17T09:00:00.000Z'],
] as const)test('pickup skips '+label+' to the next open closing time',async()=>{
 const {state,pool}=fixture([...closures])
 await createBookRequestService(pool,()=>new Date('2026-11-14T07:17:45.123Z')).adjustStatus(1,9,{status:'ready_for_pickup'})
 assert.equal(state.deadline?.toISOString(),expected);assert.equal(state.commits,1)
})
test('missing operating days rolls back instead of inventing a deadline',async()=>{
 const {state,pool}=fixture([],[])
 await assert.rejects(()=>createBookRequestService(pool,()=>new Date('2026-11-14T07:17:00Z')).adjustStatus(1,9,{status:'ready_for_pickup'}),{code:'LIBRARY_CLOSED_NO_SCHEDULE'})
 assert.equal(state.deadline,null);assert.equal(state.rollbacks,1)
})
test('pickup instructions describe the saved window and shown deadline',()=>{
 const text=requestInstructions('ready_for_pickup',new Date('2026-11-16T07:17:00Z'),{pickupWindowDays:3})
 assert.match(text,/within 3 days/i);assert.match(text,/Pick up by/)
})
test('Mark ready keeps scheduled pickup closing rather than starting the ordinary timer',async()=>{
 const {state,pool}=fixture([],[1,2,3,4,5,6],'2026-11-24')
 await createBookRequestService(pool,()=>new Date('2026-11-23T02:00:00Z')).adjustStatus(1,9,{status:'ready_for_pickup'})
 assert.equal(state.deadline?.toISOString(),'2026-11-24T09:00:00.000Z')
 assert.doesNotMatch(requestInstructions('ready_for_pickup',state.deadline,{},'2026-11-24'),/one open library day/)
})
test('Mark ready refuses a newly closed scheduled date even before the job runs',async()=>{
 const {state,pool}=fixture(['2026-11-24'],[1,2,3,4,5,6],'2026-11-24')
 await assert.rejects(createBookRequestService(pool,()=>new Date('2026-11-23T02:00:00Z')).adjustStatus(1,9,{status:'ready_for_pickup'}),{code:'SCHEDULE_PICKUP_CLOSED'})
 assert.equal(state.commits,0)
})
