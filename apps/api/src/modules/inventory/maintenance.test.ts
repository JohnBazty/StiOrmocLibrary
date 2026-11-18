import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import { historicalInput,itemInput,localTime,number } from './maintenance-validation.ts'
import { parseSupplyDetails } from '../printing/supply-details.service.ts'
import { createMaintenanceRouter } from './maintenance.routes.ts'

const sample={servedAt:'2026-01-01T09:30',customerName:'Past reader',description:'Old handout',billed:50,paymentState:'Unpaid'}
test('historical printing keeps unknown counts blank and uses actual Philippine times',()=>{
 const input=historicalInput(sample)
 assert.equal(input.servedAt,'2026-01-01T01:30:00.000Z');assert.equal(input.pages,null);assert.equal(input.copies,null)
 assert.equal(input.amountPaid,0);assert.equal(input.receivedAt,null)
 assert.throws(()=>localTime('2026-02-30T01:00','Date'))
 assert.throws(()=>localTime('2099-01-01T01:00','Date'))
})
test('confirmed historical revenue requires a date, amount and supporting record',()=>{
 for(const extra of [{receivedAt:''},{amountPaid:0},{paymentEvidence:''},{paymentMethod:''},{amountPaid:100}])assert.throws(()=>historicalInput({...sample,paymentState:'Confirmed',amountPaid:25,receivedAt:'2026-02-01T10:00',paymentMethod:'Cash',paymentEvidence:'Ledger 1',...extra}))
 const unverified=historicalInput({...sample,paymentState:'Unverified',amountPaid:25})
 assert.equal(unverified.paymentState,'Unverified');assert.equal(unverified.receivedAt,null)
})
test('stock units and money are validated without silent rounding or conversions',()=>{
 assert.equal(itemInput({name:'Paper clips',categoryId:1,unit:'pieces',price:'1.25',threshold:2}).unit,'pieces')
 assert.throws(()=>itemInput({name:'Clips',categoryId:1,unit:'pieces',threshold:1.5}))
 assert.equal(itemInput({name:'Film',categoryId:1,unit:'metres',threshold:1.125}).threshold,1.125)
 for(const value of [-1,Infinity,{},'abc',1.123])assert.throws(()=>number(value,'price'))
})
test('paper details require both positive dimensions and keep ink units separate',()=>{
 assert.equal(parseSupplyDetails({width:'210',height:'297',dimensionUnit:'mm',threshold:2},'paper').width,210)
 for(const values of [{width:1},{width:0,height:2,dimensionUnit:'mm'},{width:2,height:2,dimensionUnit:'yards'}])assert.throws(()=>parseSupplyDetails({...values,threshold:2},'paper'))
 assert.throws(()=>parseSupplyDetails({width:2,height:2,dimensionUnit:'mm',threshold:2},'ink'))
})
test('all remaining-phase management routes reject unauthorized roles before service work',async()=>{
 let called=0;const service=new Proxy({},{get:()=>async()=>{called++;return []}})
 for(const role of ['Student','Faculty','Staff','Admin']){
  const app=express();app.use(express.json());app.use((_r,s,n)=>{s.locals.authenticatedUser={role,accountId:1};n()})
  app.use(createMaintenanceRouter(service as never,service as never,service as never))
  for(const path of ['/printing/history','/printing/supply-details','/stock/merchandise','/stock/printing/report.csv'])assert.equal((await request(app).get(path)).status,403)
  for(const path of ['/printing/history','/stock/merchandise/items','/stock/printing/items/1/movements'])assert.equal((await request(app).post(path).send({})).status,403)
 }
 assert.equal(called,0)
})
