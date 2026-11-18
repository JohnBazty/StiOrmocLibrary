import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { createLibraryActivityService } from './library-activity.service.ts'
import { userNotificationsV1Router } from './notifications.routes.ts'
import { notifyLibrarians } from './library-alerts.ts'
import { generateLibrarianAlerts } from './library-alerts.worker.ts'

test('only Librarian can read all operational activity, before database access',async()=>{
  const service=createLibraryActivityService({execute:async()=>assert.fail('Forbidden database access')} as never)
  for(const role of [undefined,'Student','Faculty','Staff','Admin']) await assert.rejects(service.list(role),{status:403})
})

test('activity endpoint enforces the Librarian boundary independently of the screen',async()=>{
  for(const role of [undefined,'Student','Faculty','Staff']){
    const app=express()
    app.use((_req,res,next)=>{res.locals.authenticatedUser={role};next()})
    app.use('/notifications',userNotificationsV1Router)
    assert.equal((await request(app).get('/notifications/activity')).status,403)
  }
})

test('activity filters reject arrays, objects and SQL text without accessing the database',async()=>{
  const service=createLibraryActivityService({execute:async()=>assert.fail('Invalid query reached database')} as never)
  for(const value of [['attendance'],{},"attendance'; DROP TABLE users;--",'']) await assert.rejects(service.list('Librarian',value),{status:422})
})

test('activity is bounded, returns safe fields, and maps returned loans to historical reports',async()=>{
  let sql=''
  const service=createLibraryActivityService({execute:async(value:string)=>{
    sql=value
    return [Array.from({length:51},(_,index)=>({id:`desk:${index}`,category:'borrowing',title:'Return completed',body:'Book was returned.',person:'Test Reader',school_id:'000123',resource:'Test Book',reference:'Loan 4',occurred_at:new Date('2026-10-22T00:00:00Z'),destination:'reports:returns',password_hash:'not exposed'}))]
  }} as never,true)
  const result=await service.list('Librarian','borrowing')
  assert.equal(result.items.length,50)
  assert.equal(result.hasMore,true)
  assert.equal(result.items[0].actionPath,'/librarian/reports?q=000123&kind=returns&period=all')
  assert.equal(result.items[0].createdAt,'2026-10-22T00:00:00.000Z')
  assert.doesNotMatch(JSON.stringify(result),/password_hash|not exposed/)
  assert.match(sql,/checkout_confirmed/)
  assert.match(sql,/AT TIME ZONE 'UTC'/)
  assert.doesNotMatch(sql,/INSERT|UPDATE|DELETE|FROM reservations/)
})

test('attendance links keep the actual Philippine visit date and encoded user ID',async()=>{
  const service=createLibraryActivityService({execute:async()=>[[{id:'entry:4',category:'attendance',title:'Library entry',body:'Checked in.',person:'QA',school_id:'ID & 1',resource:'Study',reference:'Visit 4',occurred_at:new Date('2026-10-21T23:59:00Z'),destination:'attendance'}]]} as never,true)
  const item=(await service.list('Librarian','attendance')).items[0]
  assert.equal(item.actionPath,'/librarian/attendance?q=ID+%26+1&date=2026-10-22')
})

test('alert writes use the supplied transaction, active Librarian recipients and a stable unique key',async()=>{
  const calls:Array<{sql:string;values:unknown[]}>=[]
  await notifyLibrarians({execute:async(sql:string,values:unknown[])=>{calls.push({sql,values});return [{affectedRows:1}]}} as never,
    {key:'print:42:pending',title:'New print request',body:"A reader's file is waiting.",sourceId:42,personUserId:3,path:'/librarian/printing',type:'Printing Update'})
  assert.equal(calls.length,1)
  assert.match(calls[0].sql,/SELECT DISTINCT a.user_id/)
  assert.match(calls[0].sql,/a.role='Librarian'.*a.account_status='Active'.*u.account_status='Active'/s)
  assert.equal(calls[0].values.at(-2),'library:print:42:pending')
  assert.doesNotMatch(calls[0].sql,/reader's|UPDATE notifications|mail|smtp/)
})

test('alert recovery covers only actionable work and never resets recipient read/deleted state',async()=>{
  let sql='',values:unknown[]=[]
  const result=await generateLibrarianAlerts({execute:async(s:string,v:unknown[])=>{sql=s;values=v;return [{affectedRows:2}]}} as never,new Date('2026-10-22T00:00:00Z'))
  assert.equal(result.inserted,2)
  assert.match(sql,/b.returned_at IS NULL/)
  assert.match(sql,/b.lost_confirmed_at IS NULL/)
  assert.match(sql,/p.job_status='Pending'/)
  assert.doesNotMatch(sql,/UPDATE|is_read\s*=|deleted_at\s*=/)
  assert.equal(values.length,1)
})
