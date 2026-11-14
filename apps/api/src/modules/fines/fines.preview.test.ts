import assert from 'node:assert/strict'
import test from 'node:test'
import { createFinesService } from './fines.service.ts'

test('borrower preview credits update summary and status filters before pagination; Admin reads stay original', async () => {
  const statements: string[] = []
  const database = { async execute(sql: string) {
    statements.push(sql)
    if (sql.includes('SELECT user_id FROM accounts')) return [[{ user_id: 7 }]]
    if (sql.includes('FROM fines f INNER JOIN users')) return [[
      { fine_id: 1, user_id: 7, fine_type: 'Infraction', fine_amount: 190, payment_status: 'Unpaid', paid_amount: 0, adjusted_amount: 0, applied_date: '2026-11-12', source_title: 'Fine one' },
      { fine_id: 2, user_id: 7, fine_type: 'Infraction', fine_amount: 100, payment_status: 'Unpaid', paid_amount: 0, adjusted_amount: 0, applied_date: '2026-11-12', source_title: 'Fine two' },
    ]]
    if (sql.includes('FROM lost_book_reports') || sql.includes('FROM fine_payment_allocations')) return [[]]
    throw new Error('Unexpected statement')
  } } as never
  const service = createFinesService(database, { previewCredits: async () => [
    { kind: 'Fine', targetId: 1, principalCentavos: 19000, paymentId: 'completed' },
    { kind: 'Fine', targetId: 2, principalCentavos: 4000, paymentId: 'partial' },
  ] })
  const result = await service.mine({ accountId: 3, role: 'Student' }, service.filters({ limit: 1 }))
  assert.equal(result.items.length, 1); assert.equal(result.pagination.total, 2)
  assert.equal(result.summary.outstanding, 60); assert.equal(result.summary.collected, 230)
  assert.equal(result.summary.assessed, 290)
  const paid = await service.mine({ accountId: 3, role: 'Student' }, service.filters({ status: 'Paid' }))
  assert.equal(paid.items[0].balance, 0); assert.equal(paid.items[0].paymentAllowed, false)
  const due = await service.mine({ accountId: 3, role: 'Student' }, service.filters({ status: 'outstanding' }))
  assert.equal(due.pagination.total, 1); assert.equal(due.items[0].status, 'Partially Paid')
  assert.equal((await service.list(service.filters({}))).summary.outstanding, 290)
  assert.ok(statements.every(sql => /^\s*SELECT/i.test(sql)))
})
