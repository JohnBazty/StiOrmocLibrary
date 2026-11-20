import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notifyLibrarians } from './library-alerts.ts'

test('library alerts are stamped in campus time like every other notification', async () => {
  const sql: string[] = []
  await notifyLibrarians({ execute: async (text: string) => { sql.push(text); return [[], []] } } as never,
    { key: 'k', title: 'T', body: 'B', sourceId: 1, path: '/librarian/x', personUserId: 2, type: 'Printing Update' })
  assert.equal(sql.length, 1)
  assert.ok(!sql[0].includes("AT TIME ZONE 'UTC'"), 'UTC clock time is read back as Manila time and shows 8 hours early')
  assert.match(sql[0], /NOW\(\)/)
})
