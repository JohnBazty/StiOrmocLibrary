import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
import { expireReadyReservations } from './reservation-expiration.service.ts'

test('expiration transaction marks ready reservation expired and releases its accession', async () => {
  const state = { committed: 0, rolledBack: 0, released: 0, statements: [] as string[] }
  const connection = {
    async beginTransaction() {}, async commit() { state.committed += 1 }, async rollback() { state.rolledBack += 1 }, release() { state.released += 1 },
    async execute(sql: string) {
      state.statements.push(sql)
      if (sql.includes('SELECT r.* FROM reservations r')) return [[{ reservation_id: 91, user_id: 8, accession_id: 42, assigned_physical_copy_id: 50, book_title_id: 10, reservation_status: 'ready_for_pickup', request_kind: 'Reservation', title: 'Emma' }]]
      if (sql.startsWith('SELECT')) return [[]]
      return [{ affectedRows: 1 }]
    },
  }
  const result = await expireReadyReservations({ getConnection: async () => connection } as unknown as Pool, new Date('2026-08-16T12:00:00+08:00'))
  assert.deepEqual(result, { expiredCount: 1, releasedAccessions: [42] })
  assert.equal(state.committed, 1)
  assert.equal(state.rolledBack, 0)
  assert.equal(state.released, 1)
  assert.ok(state.statements.some((sql) => sql.includes("SET reservation_status=?")))
  assert.ok(state.statements.some((sql) => sql.includes("UPDATE materials m SET availability_status=pc.availability_status")))
  assert.ok(state.statements.some((sql) => sql.includes("UPDATE physical_copies SET availability_status=CASE")))
})

