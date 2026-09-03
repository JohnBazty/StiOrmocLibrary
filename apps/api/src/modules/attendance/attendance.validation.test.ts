import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../../core/http-error.ts'
import { parseAttendanceFilters } from './attendance.validation.ts'
test('attendance filters accept all report periods',()=>{assert.equal(parseAttendanceFilters({period:'daily',date:'2026-08-28'}).period,'daily');assert.equal(parseAttendanceFilters({period:'weekly',week_start:'2026-08-24'}).period,'weekly');assert.equal(parseAttendanceFilters({period:'monthly',year:'2026',month:'8'}).month,8);assert.equal(parseAttendanceFilters({period:'semester',academic_term_id:'2'}).academicTermId,2)})
test('semester reports require a configured term identifier',()=>{assert.throws(()=>parseAttendanceFilters({period:'semester'}),(error:unknown)=>error instanceof HttpError&&error.status===422&&error.code==='ACADEMIC_TERM_REQUIRED')})
test('pagination is bounded for concurrent dashboard readers',()=>{const filters=parseAttendanceFilters({limit:'500',page:'0'});assert.equal(filters.limit,100);assert.equal(filters.page,1)})
