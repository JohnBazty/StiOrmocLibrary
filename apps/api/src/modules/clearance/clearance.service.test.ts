import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
import { createClearanceService } from './clearance.service.ts'

test('owner clearance polling computes live standing without writing the cache', async () => {
  const queries: string[]=[]
  const database={execute:async(sql:string)=>{
    queries.push(sql)
    if(sql.includes('SELECT user_id FROM accounts'))return [[{user_id:77}]]
    if(sql.includes('FROM users')&&sql.includes('WHERE u.user_id'))return [[{user_id:77,full_name:'QA borrower',school_id:'QA-77'}]]
    return [[]]
  }} as unknown as Pool
  await createClearanceService(database).mine({accountId:77,role:'Student'})
  assert.equal(queries.some(sql=>/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)),false)
})

test('admin clearance list exposes pending lost-book reports for review', async () => {
  const database = {
    async execute(sql: string) {
      if (sql.includes("WHERE l.report_status='Pending'")) return [[{
        lost_book_report_id: 12, user_id: 7, school_id: '02000871654',
        full_name: 'Test Borrower', user_role: 'Student', title: 'Emma',
        reported_at: '2026-09-26T01:00:00.000Z',
      }]]
      return [[]]
    },
  } as unknown as Pool

  const result = await createClearanceService(database).list({ role: 'Admin' }, {})
  assert.deepEqual(result.pendingLostReports, [{
    lostBookReportId: 12, userId: 7, schoolId: '02000871654',
    borrowerName: 'Test Borrower', role: 'Student', title: 'Emma',
    reportedAt: '2026-09-26T01:00:00.000Z',
  }])
})

function clearanceListPool(seen: string[]) {
  return {
    async execute(sql: string, values: unknown[] = []) {
      if (sql.includes('FROM users u') && sql.includes('active_loans')) {
        seen.push(sql)
        return [[
          { user_id: 1, school_id: 'S-1', full_name: 'A Student', user_role: 'Student', account_status: 'Active', active_loans: 0, unpaid_fines: 0, unpaid_replacement: 0 },
          { user_id: 2, school_id: 'F-1', full_name: 'B Faculty', user_role: 'Faculty', account_status: 'Active', active_loans: 1, unpaid_fines: 0, unpaid_replacement: 0 },
        ].filter((row) => (values[0] as string[]).includes(row.user_role))]
      }
      return [[]]
    },
  } as unknown as Pool
}

test('the clearance list includes faculty, and a faculty member with an unreturned book is not cleared', async () => {
  const seen: string[] = []
  const result = await createClearanceService(clearanceListPool(seen)).list({ role: 'Librarian' }, {})
  const faculty = result.items.find((item) => item.student.schoolId === 'F-1')
  assert.ok(faculty, 'faculty are listed')
  assert.equal(faculty.status, 'Not Cleared')
  assert.equal(faculty.student.role, 'Faculty')
  assert.equal(result.items.find((item) => item.student.schoolId === 'S-1')?.student.role, 'Student')
})

test('the student clearance summary still counts students only', async () => {
  const summary = await createClearanceService(clearanceListPool([])).activeStudentSummary()
  assert.deepEqual(summary, { cleared: 1, notCleared: 0, unknown: 0 })
})
