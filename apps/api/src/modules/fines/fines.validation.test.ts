import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../../core/http-error.ts'
import { EARLIER_VIOLATIONS,FINE_TYPES,parseFineFilters,validateAdjustment,validateCashPayment } from './fines.validation.ts'

test('fine filters support all records, daily, four selected weeks, monthly, semester, and custom periods',()=>{
  assert.equal(parseFineFilters({}).period,'all')
  assert.equal(parseFineFilters({period:'all'}).period,'all')
  assert.equal(parseFineFilters({period:'daily',date:'2026-09-02'}).period,'daily')
  assert.equal(parseFineFilters({period:'weekly',month:'2026-09',week:'4'}).week,4)
  assert.equal(parseFineFilters({period:'semester',termId:'2'}).termId,2)
  assert.equal(parseFineFilters({period:'custom',from:'2026-09-01',to:'2026-09-02'}).to,'2026-09-02')
  assert.throws(()=>parseFineFilters({period:'weekly',week:'5'}),(error:unknown)=>error instanceof HttpError&&error.code==='FINE_INVALID_WEEK')
})

test('cash payment requires one target per positive allocation and an idempotency key',()=>{
  const value=validateCashPayment({requestKey:'cash-test-001',allocations:[{fineId:3,amount:12.5}]})
  assert.deepEqual(value.allocations,[{fineId:3,lostBookReportId:null,amount:12.5}])
  assert.throws(()=>validateCashPayment({requestKey:'cash-test-002',allocations:[{fineId:3,lostBookReportId:4,amount:1}]}),HttpError)
})

test('adjustments require audit-quality details',()=>{
  assert.throws(()=>validateAdjustment({type:'Waiver',reason:'short'}),HttpError)
})

test('the fine type filter reads one shared list and accepts a violation category only with violations',()=>{
  for(const {value} of FINE_TYPES)assert.equal(parseFineFilters({type:value}).type,value)
  assert.ok(FINE_TYPES.some(t=>t.value==='Damage Replacement'))
  assert.equal(parseFineFilters({}).category,null)
  assert.equal(parseFineFilters({type:'Infraction',category:'Noise'}).category,'Noise')
  assert.equal(parseFineFilters({type:'Infraction',category:EARLIER_VIOLATIONS}).category,EARLIER_VIOLATIONS)
  assert.throws(()=>parseFineFilters({type:'Overdue',category:'Noise'}),(error:unknown)=>error instanceof HttpError&&error.code==='FINE_INVALID_CATEGORY')
  assert.throws(()=>parseFineFilters({type:'Infraction',category:'x'.repeat(81)}),HttpError)
  assert.throws(()=>parseFineFilters({type:'Made up'}),(error:unknown)=>error instanceof HttpError&&error.code==='FINE_INVALID_TYPE')
})
