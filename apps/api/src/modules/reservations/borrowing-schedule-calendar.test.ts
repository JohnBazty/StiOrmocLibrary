import assert from 'node:assert/strict'
import test from 'node:test'
import { pickupWindow, scheduleDates, requireScheduledPickup } from './borrowing-schedule-calendar.ts'
import type { PoolConnection } from '../../config/db.js'

const week = [1,2,3,4,5,6].map(day_of_week => ({day_of_week,is_open:true,opens_at:'07:00:00',closes_at:'17:00:00'}))
test('open dates from Manila tomorrow through the last day of the current semester', () => {
  assert.deepEqual(scheduleDates(new Date('2026-11-18T16:30:00Z'),week,new Set(['2026-11-23']),'2026-11-26'), ['2026-11-20','2026-11-21','2026-11-24','2026-11-25','2026-11-26'])
  const long=scheduleDates(new Date('2026-11-18T16:30:00Z'),week,new Set(),'2026-12-31')
  assert.equal(long.at(-1),'2026-12-31')
  assert.ok(long.length>7)
  assert.ok(long.every(date=>new Date(`${date}T00:00:00Z`).getUTCDay()!==0))
})
test('no current semester means no schedule dates, and a past semester end gives none', () => {
  assert.deepEqual(scheduleDates(new Date('2026-11-18T16:30:00Z'),week,new Set(),null),[])
  assert.deepEqual(scheduleDates(new Date('2026-11-18T16:30:00Z'),week,new Set(),'2026-11-19'),[])
})
test('preparation skips Sunday and holidays; collection lasts through pickup closing', () => {
  const window=pickupWindow('2026-11-24',week,new Set(['2026-11-23']))!
  assert.equal(window.prepareAt.toISOString(),'2026-11-20T23:00:00.000Z')
  assert.equal(window.closeAt.toISOString(),'2026-11-24T09:00:00.000Z')
})
test('closed dates and unconfigured calendars never invent a window', () => {
  assert.equal(pickupWindow('2026-11-22',week,new Set()),null)
  assert.equal(pickupWindow('2026-11-24',[],new Set()),null)
  assert.equal(pickupWindow('2026-02-30',week,new Set()),null)
})
test('handover rechecks scheduled closures and closing when the runner is delayed',async()=>{
 const q={execute:async(sql:string)=>[sql.includes('library_operating_schedule')?week:[]]} as unknown as PoolConnection
 assert.equal(await requireScheduledPickup(q,{},new Date()),null)
 const r={scheduled_pickup_date:'2026-11-24'}
 assert.equal((await requireScheduledPickup(q,r,new Date('2026-11-23T02:00:00Z')))?.toISOString(),'2026-11-24T09:00:00.000Z')
 await assert.rejects(requireScheduledPickup(q,r,new Date('2026-11-24T09:00:00Z')),{code:'SCHEDULE_PICKUP_CLOSED'})
 const closed={execute:async(sql:string)=>[sql.includes('library_operating_schedule')?week:[{closed_date:'2026-11-24'}]]} as unknown as PoolConnection
 await assert.rejects(requireScheduledPickup(closed,r,new Date('2026-11-23T02:00:00Z')),{code:'SCHEDULE_PICKUP_CLOSED'})
})
