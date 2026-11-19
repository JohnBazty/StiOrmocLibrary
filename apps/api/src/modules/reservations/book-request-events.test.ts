import assert from 'node:assert/strict'
import test from 'node:test'
import type { PoolConnection } from '../../config/db.js'
import { recordRequestEvent } from './book-request-events.ts'

function fakeConnection(copyId: number | null) {
  const calls: Array<{ sql: string; parameters: unknown[] }> = []
  const connection = {
    async execute(sql: string, parameters: unknown[] = []) {
      calls.push({ sql, parameters })
      if (sql.includes('FROM reservations r JOIN users')) {
        return [[{ user_id: 5, request_kind: 'Reservation', assigned_physical_copy_id: copyId, deadline: null, email: null, user_role: 'Student', title: 'Noli Me Tangere' }]]
      }
      if (sql.includes('INSERT INTO book_request_events')) return [{ affectedRows: 1, insertId: 1 }]
      return [{ affectedRows: 1 }]
    },
  }
  return { calls, connection: connection as unknown as PoolConnection }
}

const keysOf = (calls: Array<{ sql: string; parameters: unknown[] }>) =>
  calls.filter(({ sql }) => sql.includes('INSERT INTO') && sql.includes('notifications'))
    .flatMap(({ parameters }) => parameters.filter((value) => typeof value === 'string' && /^(book-request|library):/.test(value)))

test('request event insert names no conflict target so it works before and after migration 041', async () => {
  const { calls, connection } = fakeConnection(7)
  await recordRequestEvent(connection, 11, 'ready_for_pickup')
  const insert = calls.find(({ sql }) => sql.includes('INSERT INTO book_request_events'))
  assert.match(insert?.sql ?? '', /ON CONFLICT DO NOTHING/)
})

test('a hold set aside again on a new copy gets fresh ready notices', async () => {
  const first = fakeConnection(7), second = fakeConnection(8)
  await recordRequestEvent(first.connection, 11, 'ready_for_pickup')
  await recordRequestEvent(second.connection, 11, 'ready_for_pickup')
  assert.deepEqual(keysOf(first.calls), ['book-request:11:ready_for_pickup:copy:7'])
  assert.deepEqual(keysOf(second.calls), ['book-request:11:ready_for_pickup:copy:8'])
})

test('stages without a per-copy repeat keep their original notice keys', async () => {
  const { calls, connection } = fakeConnection(7)
  await recordRequestEvent(connection, 11, 'expired')
  assert.deepEqual(keysOf(calls), ['book-request:11:expired'])
})
