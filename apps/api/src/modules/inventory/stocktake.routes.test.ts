import {test} from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import {PDFDocument} from 'pdf-lib'
import {writeFile} from 'node:fs/promises'
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost/test'
const {requireLibraryPermission}=await import('../auth/jwt-auth.middleware.ts')
const {stocktakeRouter,stocktakeExportRows,createStocktakeRouter}=await import('./stocktake.routes.ts')
test('stocktake refuses Student, Faculty, Staff and anonymous access before data lookup',async()=>{
 for(const role of [null,'Student','Faculty','Staff']){const app=express();app.use((_req,res,next)=>{if(role)res.locals.authenticatedUser={role};next()});app.use('/stocktake',requireLibraryPermission('library.manage'),stocktakeRouter);for(const method of ['get','post'] as const){const response=await request(app)[method]('/stocktake');assert.equal(response.status,403)}}
})
test('export uses the same physical rows plus unrecognized scan findings',()=>{const report={rows:[],findings:[{expectedId:null,label:'Unrecognized code',evidence:{code:'00000',shelf:'A'}}]} as any;const rows=stocktakeExportRows(report);assert.equal(rows.length,1);assert.equal(rows[0].barcode,'00000')})
test('CSV/PDF contain all physical rows, safe text cells and consistent report criteria',async()=>{
 const rows=Array.from({length:80},(_,i)=>({expectedId:i+1,original:{kind:'book',accession:`A${i}`,barcode:`000${i}`,title:i===0?'=formula':'Synthetic physical book title '+i},item:{shelf:'Shelf A',condition:'Good'},outcome:'Found',scans:1}))
 const data={session:{session_name:'Synthetic count',asset_kind:'both',scope_label:'All locations',status:'reviewed'},report:{rows,findings:[],summary:{expected:80,found:80},generatedAt:'2026-11-18T00:00:00Z'}}
 const service={get:async()=>data} as unknown as Parameters<typeof createStocktakeRouter>[0]
 const app=express();app.use('/stocktake',createStocktakeRouter(service))
 const csv=await request(app).get('/stocktake/1/export.csv');assert.equal(csv.status,200);assert(csv.text.includes('expected: 80'));assert(csv.text.includes('00079'));assert(csv.text.includes("'=formula"))
 const pdf=await request(app).get('/stocktake/1/export.pdf').buffer(true).parse((res,done)=>{const buffers:Buffer[]=[];res.on('data',b=>buffers.push(b));res.on('end',()=>done(null,Buffer.concat(buffers)))})
 assert.equal(pdf.status,200);const document=await PDFDocument.load(pdf.body);assert(document.getPageCount()>1)
 if(process.env.STOCKTAKE_QA_PDF)await writeFile(process.env.STOCKTAKE_QA_PDF,pdf.body)
})

test('lookup route passes the scanned code and type to the service without saving',async()=>{
 const seen:unknown[]=[];const service={lookup:async(id:number,query:unknown)=>{seen.push([id,query]);return {found:false,code:'0001'}}} as unknown as Parameters<typeof createStocktakeRouter>[0]
 const app=express();app.use('/stocktake',createStocktakeRouter(service))
 const response=await request(app).get('/stocktake/7/lookup?code=0001&codeType=barcode');assert.equal(response.status,200);assert.deepEqual(response.body.data,{found:false,code:'0001'});assert.deepEqual(seen,[[7,{code:'0001',codeType:'barcode'}]])
})

