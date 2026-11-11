import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { parseReportFilters, filterReportRows, exportLiveReport } from './live-reports.service.ts'
import { createLiveReportsRouter, createWorkspaceTasksRouter } from './live-reports.routes.ts'
import { verifyIntegrityProtectedCsv } from './csv-integrity.ts'

test('report periods reject invalid dates, reversed ranges, prototype keys and missing semesters',()=>{
  for(const q of [{kind:'toString'},{period:'custom',from:'2026-02-30',to:'2026-03-01'},{period:'custom',from:'2026-10-12',to:'2026-10-01'},{period:'semester'},{page:0}])assert.throws(()=>parseReportFilters(q))
  assert.equal(parseReportFilters({period:'custom',from:'2024-02-29',to:'2024-03-01'}).from,'2024-02-29')
})
test('report search and status filter the same source rows used for exports',()=>{
  const rows=[{name:'John',school_id:'02001',status:'Borrowed'},{name:'Jane',school_id:'02002',status:'Returned'}]
  assert.deepEqual(filterReportRows(rows,{q:'0200',status:'Returned'}),[rows[1]])
  assert.equal(filterReportRows(rows,{q:'%',status:''}).length,0)
})
test('new reporting routes deny unauthorized roles before reading source data',async()=>{
  let reads=0
  const service={read:async()=>{reads++;throw new Error('Should not read')}}
  for(const role of ['Staff','Student','Faculty','Admin']){
    const app=express();app.use((_r,s,n)=>{s.locals.authenticatedUser={role,accountId:1};n()});app.use(createLiveReportsRouter(service))
    for(const path of ['/','/export?format=csv'])assert.equal((await request(app).get(path)).status,403)
  }
  assert.equal(reads,0)
})
test('workspace task router permits only Librarian and Staff',async()=>{
  const service={read:async()=>({role:'Staff',cards:[],pickups:[],generatedAt:'now',operations:{state:'Open',capacity:80,serviceVisits:0,allowBorrowing:true,allowPrinting:true,events:[]},enrollment:'Pending'})}
  for(const role of ['Librarian','Staff','Student','Faculty','Admin']){
    const app=express();app.use((_r,s,n)=>{s.locals.authenticatedUser={role,accountId:1};n()});app.use(createWorkspaceTasksRouter(service))
    assert.equal((await request(app).get('/')).status,['Librarian','Staff'].includes(role)?200:403)
  }
})
test('report CSV neutralizes formulas, seals content and PDF supports Unicode',async()=>{
  const data={generatedAt:'2026-10-12',title:'Take-home borrowing' as const,kind:'circulation' as const,label:'All dates',timezone:'Asia/Manila',filters:parseReportFilters({}),columns:['name','status'],rows:[{name:'  =HYPERLINK("bad")',status:'Толстой'}],total:1,metrics:{},terms:[],note:''}
  const bytes=async(stream:AsyncIterable<unknown>)=>{const list:Buffer[]=[];for await(const c of stream)list.push(Buffer.from(c as Buffer));return Buffer.concat(list)}
  const csv=await bytes(exportLiveReport(data,'csv'));assert.equal(verifyIntegrityProtectedCsv(csv).valid,true);assert.match(csv.toString(),/'  =HYPERLINK/)
  const pdf=await bytes(exportLiveReport(data,'pdf'));assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.throws(()=>exportLiveReport(data,'html'))
})
