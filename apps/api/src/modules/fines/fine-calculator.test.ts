import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateOperatingFine, selectFinePolicy } from './fine-calculator.ts'

const policy={hourlyRate:2,dailyRate:10,maximumPenalty:30}
test('same-day overdue fines round up started hours',()=>{
  assert.deepEqual(calculateOperatingFine(new Date('2026-09-02T08:59:00+08:00'),new Date('2026-09-02T10:01:00+08:00'),policy),{amount:4,rawAmount:4,units:2,rate:2,basis:'Hourly',capApplied:false})
})
test('daily fines exclude closed dates and apply the configured cap',()=>{
  const result=calculateOperatingFine(new Date('2026-09-01T08:59:00+08:00'),new Date('2026-09-07T10:00:00+08:00'),policy,{openDays:new Set([1,2,3,4,5,6]),closedDates:new Set(['2026-09-03'])})
  assert.deepEqual(result,{amount:30,rawAmount:40,units:4,rate:10,basis:'Daily',capApplied:true})
})

test('a fine uses the rule in force on the loan due date',()=>{
  const versions=[
    {effectiveFrom:new Date('2026-12-01T00:00:00+08:00'),policy:{hourlyRate:5,dailyRate:20,maximumPenalty:500}},
    {effectiveFrom:new Date('2026-01-01T00:00:00+08:00'),policy:{hourlyRate:2,dailyRate:10,maximumPenalty:500}},
  ]
  assert.equal(selectFinePolicy(versions,new Date('2026-11-30T08:59:00+08:00')).dailyRate,10)
  assert.equal(selectFinePolicy(versions,new Date('2026-12-01T08:59:00+08:00')).dailyRate,20)
  assert.equal(selectFinePolicy(versions,new Date('2025-06-01T08:59:00+08:00')).dailyRate,10,'loans older than every rule use the oldest rule')
  assert.deepEqual(selectFinePolicy([],new Date()),{hourlyRate:2,dailyRate:10,maximumPenalty:500})
})

// Fair fine rates (docs/fair-fine-rates.md). Default rates, due 8:59 AM, standing 17:00 closing.
const fair={hourlyRate:2,dailyRate:10,maximumPenalty:500}
const week={openDays:new Set([1,2,3,4,5,6]),closedDates:new Set<string>()}
const fine=(due:string,at:string,calendar:Parameters<typeof calculateOperatingFine>[3]=week,rule=fair)=>calculateOperatingFine(new Date(due),new Date(at),rule,calendar).amount
test('due-date hours stop at closing and cost at most one day',()=>{
  assert.equal(fine('2026-09-02T08:59:00+08:00','2026-09-02T10:01:00+08:00'),4)
  assert.equal(fine('2026-09-02T08:59:00+08:00','2026-09-02T17:00:00+08:00'),10,'return exactly at closing')
  assert.equal(fine('2026-09-02T08:59:00+08:00','2026-09-02T23:59:00+08:00'),10,'the evening balance stops climbing')
})
test('a closed day after the due date keeps the due-date amount',()=>{
  assert.equal(fine('2026-09-05T08:59:00+08:00','2026-09-06T12:00:00+08:00'),10,'due Saturday, shown Sunday')
  assert.equal(fine('2026-09-05T08:59:00+08:00','2026-09-07T09:00:00+08:00'),10,'due Saturday, returned Monday')
})
test('later library days still charge the daily rate',()=>{
  assert.equal(fine('2026-09-02T08:59:00+08:00','2026-09-04T09:00:00+08:00'),20)
})
test('the fine never drops at midnight',()=>{
  const result=calculateOperatingFine(new Date('2026-09-02T08:59:00+08:00'),new Date('2026-09-03T00:01:00+08:00'),fair,week)
  assert.deepEqual(result,{amount:10,rawAmount:10,units:1,rate:10,basis:'Daily',capApplied:false})
})
test('a custom closing time limits the due-date hours',()=>{
  const calendar={...week,closesAt:new Map([[3,'10:00:00']])}
  assert.equal(fine('2026-09-02T08:59:00+08:00','2026-09-02T16:00:00+08:00',calendar),4,'Wednesday closes at 10:00')
  assert.equal(fine('2026-09-02T10:30:00+08:00','2026-09-02T16:00:00+08:00',calendar),0,'due after closing costs nothing that day')
})
test('a day without a closing time falls back to 17:00',()=>{
  const calendar={...week,closesAt:new Map([[4,'12:00:00']])}
  assert.equal(fine('2026-09-02T16:00:00+08:00','2026-09-02T20:00:00+08:00',calendar),2,'Wednesday has no closes_at')
})
test('the cap still applies last',()=>{
  assert.equal(fine('2026-09-02T08:59:00+08:00','2026-09-02T17:00:00+08:00',week,{hourlyRate:2,dailyRate:10,maximumPenalty:6}),6)
})
test('a due date that reaches the daily rate is reported as one day',()=>{
  const result=calculateOperatingFine(new Date('2026-09-05T08:59:00+08:00'),new Date('2026-09-06T12:00:00+08:00'),fair,week)
  assert.deepEqual(result,{amount:10,rawAmount:10,units:1,rate:10,basis:'Daily',capApplied:false})
  assert.equal(result.units*result.rate,result.amount)
})
test('due after closing costs nothing that day, then the daily rate',()=>{
  assert.equal(fine('2026-09-02T17:30:00+08:00','2026-09-03T09:00:00+08:00'),10)
})
test('a malformed closing time falls back to 17:00',()=>{
  assert.equal(fine('2026-09-02T08:59:00+08:00','2026-09-02T20:00:00+08:00',{...week,closesAt:new Map([[3,'25:99']])}),10)
})
