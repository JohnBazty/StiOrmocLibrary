import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { PrintingRepository } from './printing.repository.ts'
import { createPrintingService } from './printing.service.ts'

function serviceFixture(selectedRow:Record<string,unknown>){
  const calls:Array<{sql:string;values:unknown[]}>=[]
  const connection={
    beginTransaction:async()=>undefined,commit:async()=>undefined,rollback:async()=>undefined,release:()=>undefined,
    execute:async(sql:string,values:unknown[]=[] )=>{assert.equal((sql.match(/\?/g)??[]).length,values.length,`Prepared value count mismatch in ${sql}`);calls.push({sql,values});if(sql.startsWith('SELECT'))return[[selectedRow],[]];if(sql.includes('INSERT INTO ink_repository'))return[{insertId:9},[]];return[{},[]]},
  }
  const pool={getConnection:async()=>connection} as unknown as Pool
  const repository={userBySchoolId:async()=>({user_id:5,account_status:'Active'})} as unknown as PrintingRepository
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

test('starting a paid print job does not automatically deduct paper stock',async()=>{
  const{service,calls}=serviceFixture({request_id:4,job_status:'Pending',payment_status:'Paid'})
  await service.updateStatus({schoolId:'ADMIN-PORTAL-001'},4,{status:'Printing'})
  assert.equal(calls.some(call=>call.sql.includes('bond_paper_stocks')),false)
  assert.equal(calls.some(call=>call.sql.includes('paper_stock_movements')),false)
})
