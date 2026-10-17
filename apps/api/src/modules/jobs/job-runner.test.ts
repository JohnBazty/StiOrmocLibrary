import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from 'mysql2/promise'
import { authorizedJobToken, runOperationalJobs } from './job-runner.ts'

test('scheduled runner requires a configured 32-character bearer secret', () => {
  const secret = '0123456789abcdef0123456789abcdef'
  assert.equal(authorizedJobToken(`Bearer ${secret}`, secret), true)
  assert.equal(authorizedJobToken(`Bearer ${secret}x`, secret), false)
  assert.equal(authorizedJobToken(`Bearer ${secret}`, 'short'), false)
  assert.equal(authorizedJobToken(undefined, secret), false)
})

test('an already claimed minute skips all operational scans', async () => {
  const statements: string[] = []
  const database = { async execute(sql: string) { statements.push(sql); return [{ affectedRows: 0 }] } } as unknown as Pool
  const result = await runOperationalJobs(new Date('2026-09-27T10:00:00Z'), database)
  assert.equal(result.skipped, true)
  assert.equal(statements.length, 1)
  assert.match(statements[0], /last_success_at/)
})
