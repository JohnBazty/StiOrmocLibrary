import assert from 'node:assert/strict'
import test from 'node:test'
import { concurrentPeak, manilaDate, nextDate, localTimestamp } from './attendance-intervals.ts'

test('peak counts overlap, not arrivals, and excludes service visits', () => {
  const visits = [{start:0,end:10,purpose:'Study'},{start:1,end:2,purpose:'Study'},{start:2,end:3,purpose:'Study'},{start:1,end:10,purpose:'Printing'}]
  assert.equal(concurrentPeak(visits,0,20,20,['Printing']).peak,2)
})
test('report boundaries include carry-in visitors and clip open visits at now', () => {
  assert.deepEqual(concurrentPeak([{start:0,end:25,purpose:'Study'},{start:9,end:null,purpose:'Research'},{start:19,end:21,purpose:'Study'}],10,30,15,[]),{peak:2,peakAt:10})
  assert.equal(concurrentPeak([{start:0,end:10,purpose:'Study'}],10,30,30,[]).peak,0)
})
test('Manila day arithmetic does not shift report boundaries to the previous date', () => {
  assert.equal(nextDate('2026-10-11',6),'2026-10-17')
  assert.equal(nextDate('2026-11-01',-1),'2026-10-31')
  assert.equal(manilaDate(new Date('2026-10-10T18:00:00Z')),'2026-10-11')
  assert.equal(localTimestamp('2026-10-11 07:00:00'),new Date('2026-10-11T07:00:00+08:00').getTime())
})
