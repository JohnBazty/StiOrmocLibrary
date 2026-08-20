import assert from 'node:assert/strict'
import test from 'node:test'
import { buildReservationQueueQuery } from './reservation-query.repository.ts'
import { parseQueueFilters } from './reservation.validation.ts'

test('queue query combines prepared status, dates, role, and user filters with contextual joins', () => {
  const filters = parseQueueFilters({ status: 'ready_for_pickup', dateFrom: '2026-08-01', dateTo: '2026-08-16', role: 'Student', user: 'John', page: '2', limit: '20' })
  const query = buildReservationQueueQuery(filters)
  assert.match(query.dataSql, /INNER JOIN users/)
  assert.match(query.dataSql, /INNER JOIN materials/)
  assert.match(query.dataSql, /LEFT JOIN categories/)
  assert.match(query.dataSql, /LEFT JOIN physical_copies/)
  assert.ok(!query.dataSql.includes('John'))
  assert.ok(query.dataParameters.includes('%John%'))
  assert.match(query.dataSql, /LIMIT 20 OFFSET 20/)
})
