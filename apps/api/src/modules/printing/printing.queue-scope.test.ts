import assert from 'node:assert/strict'
import test from 'node:test'
import { PrintingRepository } from './printing.repository.ts'
import { parseQueueFilters } from './printing.validation.ts'
import type { Pool } from '../../config/db.js'

test('active/history scope applies before counting, pagination and report iteration', async () => {
  for (const scope of ['active', 'history'] as const) {
    const calls: Array<{sql: string; values: unknown[]}> = []
    const pool = {execute: async (sql: string, values: unknown[]) => { calls.push({sql,values}); return [sql.includes('COUNT(*) total') ? [{total: 0}] : []] }} as unknown as Pool
    const repository = new PrintingRepository(pool)
    const filters = parseQueueFilters({scope, q: 'lesson', page: '2', limit: '10'})
    await repository.queue(filters)
    assert.equal(calls.length, 2)
    const condition = scope === 'active' ? "pr.job_status NOT IN ('Completed','Cancelled')" : "pr.job_status IN ('Completed','Cancelled')"
    for (const call of calls) {
      assert.ok(call.sql.includes(condition))
      assert.ok(call.values.includes('%lesson%'))
    }
    assert.ok(calls[1].sql.includes('LIMIT 10 OFFSET 10'))
    calls.length = 0
    for await (const _row of repository.printReportRows(filters)) { /* empty fixture */ }
    assert.ok(calls.every(call => call.sql.includes(condition)))
  }
})
