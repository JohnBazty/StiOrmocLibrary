import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanJobError, jobHealth, parseOverdueCursor, validJobSecret } from './job-runner.rules.ts'

const secret = '0123456789abcdef0123456789abcdef'

test('job secret must be configured with 32+ characters and match exactly', () => {
  assert.equal(validJobSecret(secret, secret), true)
  assert.equal(validJobSecret(undefined, secret), false, 'missing header')
  assert.equal(validJobSecret('', secret), false, 'empty header')
  assert.equal(validJobSecret(`${secret}x`, secret), false, 'wrong length')
  assert.equal(validJobSecret(`${secret.slice(0, -1)}X`, secret), false, 'wrong value, same length')
  assert.equal(validJobSecret(secret, ''), false, 'not configured')
  assert.equal(validJobSecret('short', 'short'), false, 'configured secret too short')
  assert.equal(validJobSecret([secret, secret] as unknown as string, secret), false, 'repeated header')
})

test('health: failed until a later success, stale after 3 minutes, otherwise healthy', () => {
  const now = new Date('2026-11-11T02:00:00Z')
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000)
  assert.equal(jobHealth({ lastOutcome: null, lastSuccessAt: null, lastFailureAt: null }, now), 'stale')
  assert.equal(jobHealth({ lastOutcome: 'succeeded', lastSuccessAt: ago(30), lastFailureAt: null }, now), 'healthy')
  assert.equal(jobHealth({ lastOutcome: 'succeeded', lastSuccessAt: ago(180), lastFailureAt: null }, now), 'healthy')
  assert.equal(jobHealth({ lastOutcome: 'succeeded', lastSuccessAt: ago(181), lastFailureAt: null }, now), 'stale')
  assert.equal(jobHealth({ lastOutcome: 'failed', lastSuccessAt: ago(120), lastFailureAt: ago(10) }, now), 'failed')
  assert.equal(jobHealth({ lastOutcome: 'failed', lastSuccessAt: null, lastFailureAt: ago(10) }, now), 'failed')
  assert.equal(jobHealth({ lastOutcome: 'succeeded', lastSuccessAt: ago(10), lastFailureAt: ago(60) }, now), 'healthy')
})

test('job errors keep a safe code and a short first-line message without secrets', () => {
  const error = Object.assign(new Error('connect failed postgresql://app:hunter2@db.example.co:5432/postgres\n    at Pool.connect (pg.js:1:1)'), { code: 'ECONNREFUSED' })
  const cleaned = cleanJobError(error)
  assert.equal(cleaned.code, 'ECONNREFUSED')
  assert.equal(cleaned.message.includes('hunter2'), false)
  assert.equal(cleaned.message.includes('at Pool'), false)
  assert.match(cleaned.message, /connect failed \[redacted\]/)
  assert.equal(cleanJobError(new Error('x'.repeat(900))).message.length, 500)
  assert.deepEqual(cleanJobError('boom'), { code: 'SERVICE_ERROR', message: 'Scheduled job failed.' })
  assert.equal(cleanJobError(Object.assign(new Error('bad'), { code: 'lower case; DROP' })).code, 'SERVICE_ERROR')
  assert.equal(cleanJobError(new Error('password=abc123 token=xyz')).message, 'password=[redacted] token=[redacted]')
  assert.equal(cleanJobError(new Error('send to ana.cruz@ormoc.sti.edu.ph failed: Authorization Bearer abc.def')).message, 'send to [redacted] failed: Authorization Bearer [redacted]')
})

test('overdue cursor is parsed strictly and anything else restarts the pass', () => {
  assert.deepEqual(parseOverdueCursor('{"dueAt":"2026-11-10 08:59:00","transactionId":12}'), { dueAt: '2026-11-10 08:59:00', transactionId: 12 })
  assert.deepEqual(parseOverdueCursor('{"dueAt":"2026-11-10 08:59:00.25","transactionId":3}'), { dueAt: '2026-11-10 08:59:00.25', transactionId: 3 })
  for (const bad of [null, '', 'not json', '{"dueAt":"yesterday","transactionId":1}', '{"dueAt":"2026-11-10 08:59:00","transactionId":-1}', '{"dueAt":"2026-11-10 08:59:00","transactionId":"1"}', '[]']) {
    assert.equal(parseOverdueCursor(bad), null, String(bad))
  }
})
