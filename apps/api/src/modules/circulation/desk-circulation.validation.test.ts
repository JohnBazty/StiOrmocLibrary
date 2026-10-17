import assert from 'node:assert/strict'
import test from 'node:test'
import {confirmationKey,scanBarcode,scanMode,conditionAssessment} from './desk-circulation.service.ts'
import {policyDueDate} from './desk-circulation.policy.ts'
import type {PoolConnection,RowDataPacket} from 'mysql2/promise'
test('desk scan validates intent, stable request key and condition incident notes',()=>{assert.equal(scanBarcode(' copy-7 '),'COPY-7');assert.throws(()=>scanBarcode('bad\ncode'));assert.throws(()=>scanMode('Borrowed'));assert.throws(()=>confirmationKey('short'));assert.throws(()=>conditionAssessment({condition:'Damaged'}));assert.deepEqual(conditionAssessment({condition:'Damaged',assessmentNote:'Cover torn'}),{condition:'Damaged',note:'Cover torn'})})
test('due policy uses Manila, configured operating days and closed dates',async()=>{const q={async execute(sql:string){return sql.includes('library_operating_schedule')?[[{day_of_week:1,is_open:true},{day_of_week:3,is_open:true}]]:[[{closed_date:'2026-10-14'}]]}} as unknown as PoolConnection;const due=await policyDueDate(q,new Date('2026-10-11T16:10:00Z'),{borrowing_days:1,due_time_cutoff:'09:30:00'} as RowDataPacket);assert.equal(due.toISOString(),'2026-10-18T16:10:00.000Z')})
