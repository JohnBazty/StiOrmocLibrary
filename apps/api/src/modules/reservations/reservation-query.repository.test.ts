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

test('active queue includes waiting preparation and ready pickup and excludes completed history',()=>{
  const filters=parseQueueFilters({status:'active',page:1,limit:25})
  const query=buildReservationQueueQuery(filters)
  assert.match(query.dataSql,/r.reservation_status IN \('pending','approved','ready_for_pickup'\)/)
  assert.match(query.countSql,/r.reservation_status IN \('pending','approved','ready_for_pickup'\)/)
  assert.ok(!query.dataParameters.includes('active'))
})

test('queue kind filter defaults to Reservation, accepts CartHandover and rejects anything else', () => {
  const reservation = buildReservationQueueQuery(parseQueueFilters({ status: 'active' }))
  assert.match(reservation.dataSql, /r\.request_kind = \?/)
  assert.equal(reservation.dataParameters[0], 'Reservation')
  const cart = buildReservationQueueQuery(parseQueueFilters({ status: 'active', kind: 'CartHandover' }))
  assert.equal(cart.dataParameters[0], 'CartHandover')
  assert.equal(cart.countParameters[0], 'CartHandover')
  assert.throws(() => parseQueueFilters({ kind: "Reservation' OR 1=1" }), (e: any) => e.code === 'RESERVATION_FILTER_INVALID')
})

test('staff queue returns skip fields while the student listing never selects them', async () => {
  assert.match(buildReservationQueueQuery(parseQueueFilters({})).dataSql, /r\.last_skip_reason/)
  const { createReservationService } = await import('./reservation.service.ts')
  const database = { async execute(sql: string) {
    if (sql.includes('SELECT user_id FROM accounts')) return [[{ user_id: 4 }]]
    return [[{ reservation_id: 1, title: 'Clean Code', queue_position: 1, reservation_status: 'pending', last_skip_reason: 'Settle the outstanding library balance', last_skipped_at: new Date() }]]
  } }
  assert.doesNotMatch(JSON.stringify(await createReservationService(database as never).listForAccount(1)), /balance|skip/i)
})
