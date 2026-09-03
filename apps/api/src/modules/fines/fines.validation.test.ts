import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../../core/http-error.ts'
import { parseFineFilters,validateAdjustment,validateCashPayment,validateInfraction } from './fines.validation.ts'

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

test('infractions and adjustments require audit-quality details',()=>{
  const incident=validateInfraction({schoolId:'02000000001',category:'Noise violation',amount:25,incidentAt:'2026-09-02T10:00:00+08:00',details:'Repeated loud conversation in the reading area.'})
  assert.equal(incident.schoolId,'02000000001');assert.equal(incident.amount,25)
  assert.throws(()=>validateAdjustment({type:'Waiver',reason:'short'}),HttpError)
})
