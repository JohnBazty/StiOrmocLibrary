import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { HttpError } from '../../core/http-error.ts'
import { createReservationService } from './reservation.service.ts'

function reservationPool(role: 'Student' | 'Faculty', activeCount: number) {
  const state = { commits: 0, rollbacks: 0, releases: 0, inserted: false, activeCountQueried: false }
  const connection = {
    async beginTransaction() {}, async commit() { state.commits += 1 }, async rollback() { state.rollbacks += 1 }, release() { state.releases += 1 },
    async execute(sql: string) {
      if (sql.includes('FROM users u')) return [[{ user_id: 4, account_status: 'Active', role_name: role }]]
      if (sql.includes('SELECT material_id, title')) return [[{ material_id: 17, title: 'Clean Code', isbn: '9780132350884', material_type: 'Book' }]]
      if (sql.includes('SELECT material_id FROM materials')) return [[{ material_id: 17 }, { material_id: 18 }]]
      if (sql.includes('SELECT r.reservation_id')) return [[]]
      if (sql.includes('COUNT(DISTINCT active.material_id)')) { state.activeCountQueried = true; return [[{ active_count: activeCount }]] }
      if (sql.includes('MAX(r.queue_position)')) return [[{ next_position: 3 }]]
      if (sql.includes('INSERT INTO reservations')) { state.inserted = true; return [{ insertId: 501, affectedRows: 1 }] }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }
  return { state, database: { getConnection: async () => connection } as unknown as Pool }
}

test('Student with two active books receives 422 and no third reservation insert', async () => {
  const { state, database } = reservationPool('Student', 2)
  await assert.rejects(createReservationService(database).create(4, { materialId: 17 }), (error: unknown) => {
    assert.ok(error instanceof HttpError)
    assert.equal(error.status, 422)
    assert.equal(error.code, 'STUDENT_BORROW_LIMIT_REACHED')
    assert.equal(error.message, 'Transaction Blocked: Students cannot exceed 2 books')
    return true
  })
  assert.equal(state.inserted, false)
  assert.equal(state.commits, 0)
  assert.equal(state.rollbacks, 1)
})

test('Faculty with ten or more active books bypasses the cap and creates a reservation', async () => {
  const { state, database } = reservationPool('Faculty', 12)
  const result = await createReservationService(database).create(4, { materialId: 17 })
  assert.equal(result.reservationId, 501)
  assert.equal(result.status, 'pending')
  assert.equal(state.activeCountQueried, false)
  assert.equal(state.inserted, true)
  assert.equal(state.commits, 1)
  assert.equal(state.rollbacks, 0)
})

