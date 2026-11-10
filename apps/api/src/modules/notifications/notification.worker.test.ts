import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
import { generateNotifications } from './notification.worker.ts'

test('D5: print notices only scan print requests changed in the last 24 hours', async () => {
  const statements: string[] = []
  const connection = { async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}, async execute() { return [[]] } }
  const database = {
    async execute(sql: string) { statements.push(sql); return [{ affectedRows: 0 }] },
    getConnection: async () => connection,
  } as unknown as Pool
  await generateNotifications(database, new Date('2026-11-11T02:00:00Z'))
  const print = statements.find((sql) => sql.includes('FROM print_requests pr'))
  assert.ok(print)
  assert.match(print, /WHERE pr\.updated_at >= \(NOW\(\) AT TIME ZONE 'UTC'\) - INTERVAL '24 hours'/)
  assert.equal(statements.some((sql) => sql.includes('FROM reservations r')), false, 'the historic reservation scan stays removed')
})
