import assert from 'node:assert/strict'
import test from 'node:test'
import { isDatabaseUnavailable } from './database-availability.ts'

test('recognizes connection, DNS, pool-limit, and aggregate timeout failures', () => {
  for (const error of [
    { code: 'ENOTFOUND' }, { code: 'ECONNRESET' }, { code: '53300' },
    { code: 'XX000', message: '(EMAXCONNSESSION) max clients reached in session mode' },
    new Error('Connection terminated unexpectedly'),
    new AggregateError([{ code: 'ETIMEDOUT' }]),
  ]) assert.equal(isDatabaseUnavailable(error), true)
})

test('does not mask schema, validation, or programming errors as an outage', () => {
  for (const error of [null, { code: '42P01' }, { code: '23505' }, new TypeError('Cannot read properties'), new Error('Unknown failure')]) {
    assert.equal(isDatabaseUnavailable(error), false)
  }
})
