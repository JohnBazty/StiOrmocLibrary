import assert from 'node:assert/strict'
import test from 'node:test'
import { secretsMatch } from './job-runner.auth.ts'
import { deriveJobHealth } from './job-runner.service.ts'
import { sanitizeErrorMessage } from './job-runner.repository.ts'
import { STALE_AFTER_MS } from './job-runner.types.ts'

test('job runner secrets compare in constant time and reject length mismatches', () => {
  assert.equal(secretsMatch('abc', 'abc'), true)
  assert.equal(secretsMatch('abc', 'abd'), false)
  assert.equal(secretsMatch('ab', 'abc'), false)
  assert.equal(secretsMatch('', 'abc'), false)
})

test('sanitizeErrorMessage truncates and strips secrets-looking whitespace noise', () => {
  const long = 'x'.repeat(600)
  assert.equal(sanitizeErrorMessage(long).length, 500)
  assert.equal(sanitizeErrorMessage('  boom\n\nline  '), 'boom line')
})

test('deriveJobHealth marks failed, stale, and healthy states', () => {
  const now = new Date('2026-10-10T12:00:00.000Z')
  assert.equal(deriveJobHealth({ lastSuccessAt: now, lastOutcome: 'failed', now }), 'failed')
  assert.equal(deriveJobHealth({ lastSuccessAt: null, lastOutcome: 'succeeded', now }), 'stale')
  assert.equal(
    deriveJobHealth({
      lastSuccessAt: new Date(now.getTime() - STALE_AFTER_MS - 1),
      lastOutcome: 'succeeded',
      now,
    }),
    'stale',
  )
  assert.equal(
    deriveJobHealth({
      lastSuccessAt: new Date(now.getTime() - 30_000),
      lastOutcome: 'succeeded',
      now,
    }),
    'healthy',
  )
})
