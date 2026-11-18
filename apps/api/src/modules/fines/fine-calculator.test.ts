import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateOperatingFine } from './fine-calculator.ts'

const policy={hourlyRate:2,dailyRate:10,maximumPenalty:30}
test('same-day overdue fines round up started hours',()=>{
  assert.deepEqual(calculateOperatingFine(new Date('2026-09-02T08:59:00+08:00'),new Date('2026-09-02T10:01:00+08:00'),policy),{amount:4,rawAmount:4,units:2,rate:2,basis:'Hourly',capApplied:false})
})
test('daily fines exclude closed dates and apply the configured cap',()=>{
  const result=calculateOperatingFine(new Date('2026-09-01T08:59:00+08:00'),new Date('2026-09-07T10:00:00+08:00'),policy,{openDays:new Set([1,2,3,4,5,6]),closedDates:new Set(['2026-09-03'])})
  assert.deepEqual(result,{amount:30,rawAmount:40,units:4,rate:10,basis:'Daily',capApplied:true})
})
