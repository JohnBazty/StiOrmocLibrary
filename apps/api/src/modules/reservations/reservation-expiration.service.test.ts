import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { expireReadyReservations } from './reservation-expiration.service.ts'

test('expiration transaction marks ready reservation expired and releases its accession', async () => {
  const state = { committed: 0, rolledBack: 0, released: 0, statements: [] as string[] }
  const connection = {
    async beginTransaction() {}, async commit() { state.committed += 1 }, async rollback() { state.rolledBack += 1 }, release() { state.released += 1 },
    async execute(sql: string) {
      state.statements.push(sql)
      if (sql.includes('SELECT reservation_id')) return [[{ reservation_id: 91, accession_id: 42 }]]
      return [{ affectedRows: 1 }]
    },
  }
  const result = await expireReadyReservations({ getConnection: async () => connection } as unknown as Pool, new Date('2026-08-16T12:00:00+08:00'))
  assert.deepEqual(result, { expiredCount: 1, releasedAccessions: [42] })
  assert.equal(state.committed, 1)
  assert.equal(state.rolledBack, 0)
  assert.equal(state.released, 1)
  assert.ok(state.statements.some((sql) => sql.includes("reservation_status = 'expired'")))
  assert.ok(state.statements.some((sql) => sql.includes("UPDATE materials SET availability_status = 'Available'")))
  assert.ok(state.statements.some((sql) => sql.includes("UPDATE physical_copies SET availability_status = 'Available'")))
})

