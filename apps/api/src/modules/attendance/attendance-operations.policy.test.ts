import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateLibraryState, parseAttendancePolicy, parseOperationalEvent } from './attendance-operations.policy.ts'
const policy={servicePurposes:['Printing'],preclosingMinutes:5,configured:true,version:1}
const schedule={is_open:1,opens_at:'07:00:00',closes_at:'19:00:00'}
test('operating hours and pre-closing boundary restrict entry',()=>{
 assert.equal(evaluateLibraryState(new Date('2026-10-11T06:59:59+08:00'),policy,schedule,false,80,[]).state,'Closed')
 assert.equal(evaluateLibraryState(new Date('2026-10-11T18:54:59+08:00'),policy,schedule,false,80,[]).entryOpen,true)
 assert.equal(evaluateLibraryState(new Date('2026-10-11T18:55:00+08:00'),policy,schedule,false,80,[]).state,'Closing')
 assert.equal(evaluateLibraryState(new Date('2026-10-11T12:00:00+08:00'),policy,schedule,true,80,[]).entryOpen,false)
 assert.equal(evaluateLibraryState(new Date('2026-10-11T12:00:00+08:00'),{...policy,configured:false},schedule,false,80,[]).state,'Needs configuration')
})
test('overlapping events use the most restrictive remaining capacity and explicit service permissions',()=>{
 const event={event_id:1,title:'Class',event_kind:'Class',space_name:'Reading area',starts_at:'',ends_at:'',seat_capacity:20,allow_walk_ins:false,allow_borrowing:true,allow_printing:true,row_version:1}
 const state=evaluateLibraryState(new Date('2026-10-11T12:00:00+08:00'),policy,schedule,false,80,[event,{...event,event_id:2,seat_capacity:10,allow_printing:false}])
 assert.equal(state.capacity,10);assert.equal(state.allowWalkIns,false);assert.equal(state.allowBorrowing,true);assert.equal(state.allowPrinting,false)
})
test('policy and event inputs reject unapproved purposes, invalid ranges and missing service decisions',()=>{
 assert.throws(()=>parseAttendancePolicy({servicePurposes:['Study'],preclosingMinutes:0}))
 assert.throws(()=>parseOperationalEvent({title:'Class',kind:'Class',spaceName:'A',capacity:20,startsAt:'2026-10-11T12:00:00+08:00',endsAt:'2026-10-11T11:00:00+08:00'}))
 assert.throws(()=>parseOperationalEvent({title:'Class',kind:'Class',spaceName:'A',capacity:20,startsAt:'2026-10-11T12:00:00+08:00',endsAt:'2026-10-11T13:00:00+08:00'}))
})
