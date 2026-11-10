import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
import { generateNotifications } from './notification.worker.ts'

function capturingPool() {
  const statements: string[] = []
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async execute(sql: string) {
      statements.push(sql)
      return sql.trim().startsWith('SELECT') ? [[]] : [{ affectedRows: 0 }]
    },
  }
  const database = {
    getConnection: async () => connection,
    execute: connection.execute.bind(connection),
  } as unknown as Pool
  return { statements, database }
}

test('loan reminder keys keep the pre-renewal format until a loan is renewed', async () => {
  // Loans already notified under loan:<id>:due-12h must not get a second notice after deploy.
  const { statements, database } = capturingPool()
  await generateNotifications(database, new Date('2026-11-10T08:00:00+08:00'))
  for (const suffix of ['due-12h', 'due-1h', 'overdue']) {
    const sql = statements.find((statement) => statement.includes(`':${suffix}'`))
    assert.ok(sql, `${suffix} reminder query runs`)
    assert.match(
      sql,
      new RegExp(`WHEN COALESCE\\(bt\\.renewal_count,0\\)=0 THEN CONCAT\\('loan:',bt\\.transaction_id,':${suffix}'\\)`),
    )
    assert.match(sql, new RegExp(`CONCAT\\('loan:',bt\\.transaction_id,':renewal:',bt\\.renewal_count,':${suffix}'\\)`))
  }
})
