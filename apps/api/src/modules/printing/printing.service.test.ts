import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { PDFDocument } from 'pdf-lib'
import { PrintingRepository } from './printing.repository.ts'
import { createPrintingService } from './printing.service.ts'

function serviceFixture(selectedRow:Record<string,unknown>){
  const calls:Array<{sql:string;values:unknown[]}>=[]
  const connection={
    beginTransaction:async()=>undefined,commit:async()=>undefined,rollback:async()=>undefined,release:()=>undefined,
    execute:async(sql:string,values:unknown[]=[] )=>{assert.equal((sql.match(/\?/g)??[]).length,values.length,`Prepared value count mismatch in ${sql}`);calls.push({sql,values});if(sql.startsWith('SELECT'))return[[selectedRow],[]];if(sql.includes('INSERT INTO ink_repository'))return[{insertId:9},[]];if(sql.includes('INSERT INTO print_cash_payments'))return[{insertId:21},[]];if(sql.includes('INSERT INTO print_payment_receipts'))return[{insertId:31},[]];return[{},[]]},
  }
  const pool={getConnection:async()=>connection} as unknown as Pool
  const repository={userBySchoolId:async()=>({user_id:5,account_status:'Active'}),serviceStatus:async()=>({accepting_requests:1}),pricing:async()=>[{print_type:'Monochrome',paper_size:'A4',price_per_page:3}]} as unknown as PrintingRepository
  return{service:createPrintingService(pool,repository),calls}
}

test('new ink stores required unit cost and calculated expense with matching prepared values',async()=>{
  const{service,calls}=serviceFixture({})
  const result=await service.createInkStock({schoolId:'ADMIN-PORTAL-001'},{cartridge_type:'Dye ink',color_variation:'Black',available_bottles:2,cost_per_bottle:150})
  assert.equal(result.total_expense,300)
  assert.ok(calls.some(call=>call.sql.includes('unit_cost_per_bottle')&&call.values.includes(150)&&call.values.includes(300)))
})

test('paper restock adds whole unopened reams and records server-calculated expense',async()=>{
  const{service,calls}=serviceFixture({unopened_reams:4,average_expense_cost:'100.00'})
  const result=await service.restockPaper({schoolId:'ADMIN-PORTAL-001'},1,{quantity:3,unit_cost:120})
  assert.equal(result.remaining_reams,7)
  assert.equal(result.total_expense,360)
  assert.ok(calls.some(call=>call.sql.includes('paper_stock_movements')&&call.values.includes(120)&&call.values.includes(360)))
})

test('ink restock adds whole bottles and records server-calculated expense',async()=>{
  const{service,calls}=serviceFixture({available_bottles:2})
  const result=await service.restockInk({schoolId:'ADMIN-PORTAL-001'},1,{quantity:4,unit_cost:80})
  assert.equal(result.available_bottles,6)
  assert.equal(result.total_expense,320)
  assert.ok(calls.some(call=>call.sql.includes('ink_stock_movements')&&call.values.includes(80)&&call.values.includes(320)))
})

test('using ink deducts exactly one bottle and stores balance snapshots',async()=>{
  const{service,calls}=serviceFixture({available_bottles:2})
  const result=await service.useInkBottle({schoolId:'ADMIN-PORTAL-001'},1)
  assert.equal(result.available_bottles,1)
  assert.ok(calls.some(call=>call.sql.includes("'LoadedIntoPrinter'")&&call.values.includes(2)&&call.values.includes(1)))
})

test('opening paper deducts exactly one unopened ream',async()=>{
  const{service,calls}=serviceFixture({unopened_reams:3})
  const result=await service.openPaperReam({schoolId:'ADMIN-PORTAL-001'},1)
  assert.equal(result.unopened_reams,2)
  assert.ok(calls.some(call=>call.sql.includes("'OpenedReam'")&&call.values.includes(3)&&call.values.includes(2)))
})

test('starting a paid print job notifies its owner once in the status transaction without deducting paper',async()=>{
  const{service,calls}=serviceFixture({request_id:4,user_id:12,file_name:'thesis.pdf',job_status:'Pending',payment_status:'Paid'})
  await service.updateStatus({schoolId:'ADMIN-PORTAL-001'},4,{status:'Printing'})
  assert.equal(calls.some(call=>call.sql.includes('bond_paper_stocks')),false)
  assert.equal(calls.some(call=>call.sql.includes('paper_stock_movements')),false)
  const notification=calls.find(call=>call.sql.includes('INSERT IGNORE INTO notifications')&&call.values.includes('print:4:printing'))
  assert.ok(notification)
  assert.equal(notification.values[0],12)
  assert.match(String(notification.values[1]),/thesis.pdf is now printing/)
})

test('a blocked print start sends no notification',async()=>{
  const{service,calls}=serviceFixture({request_id:4,user_id:12,file_name:'thesis.pdf',job_status:'Pending',payment_status:'Unpaid'})
  await assert.rejects(service.updateStatus({schoolId:'ADMIN-PORTAL-001'},4,{status:'Printing'}),{code:'PRINT_PAYMENT_REQUIRED'})
  assert.equal(calls.some(call=>call.sql.includes('INTO notifications')),false)
})

test('recording a printing payment creates a separate digital printing receipt',async()=>{
  const{service,calls}=serviceFixture({request_id:4,user_id:7,calculated_cost:'36.00',payment_status:'Unpaid',job_status:'Pending',file_name:'capstone.pdf',page_count:6,number_of_copies:2,total_sheets:12,print_type:'Monochrome',paper_size:'A4',student_name:'Student User',school_id:'0200000001',user_role:'Student'})
  const result=await service.recordCash({schoolId:'ADMIN-PORTAL-001'},4,{amount_paid:36})
  assert.equal(result.receipt.receipt_number.startsWith('PR-'),true)
  assert.equal(result.receipt.amount_received,36)
  assert.ok(calls.some(call=>call.sql.includes('INSERT INTO print_payment_receipts')))
  assert.equal(calls.some(call=>call.sql.includes('fine_payment_receipts')),false)
})

test('quote reads uploaded PDF page count and calculates price on the server',async()=>{
  const document=await PDFDocument.create()
  document.addPage();document.addPage()
  const bytes=Buffer.from(await document.save())
  const file={buffer:bytes,originalname:'course.pdf',mimetype:'application/pdf',size:bytes.length} as Express.Multer.File
  const{service}=serviceFixture({})
  const quote=await service.quote({schoolId:'STUDENT-001'},{number_of_copies:'3',print_type:'Monochrome',paper_size:'A4'},file)
  assert.equal(quote.page_count,2)
  assert.equal(quote.total_sheets,6)
  assert.equal(quote.calculated_cost,18)
  await assert.rejects(service.submit({schoolId:'STUDENT-001'},{number_of_copies:'3',page_count:'1',print_type:'Monochrome',paper_size:'A4'},file),{code:'PRINT_PAGE_COUNT_CHANGED'})
})
