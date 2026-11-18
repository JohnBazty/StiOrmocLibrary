import assert from 'node:assert/strict'
import test from 'node:test'
import { connectDatabaseAtStartup, databaseStartupErrorMessage, isTransientDatabaseConnectionError } from './database-startup.ts'

const failure = (code: string) => Object.assign(new Error('Connection check failed'), { code })

test('startup recovers after temporary DNS failures with bounded backoff', async () => {
  let calls = 0
  const waits: number[] = [], retries: number[] = []
  await connectDatabaseAtStartup(async () => { if (++calls < 3) throw failure('ENOTFOUND') }, {
    wait: async milliseconds => { waits.push(milliseconds) },
    onRetry: ({ nextAttempt, totalAttempts }) => { assert.equal(totalAttempts, 5); retries.push(nextAttempt) },
  })
  assert.equal(calls, 3)
  assert.deepEqual(waits, [1000, 2000])
  assert.deepEqual(retries, [2, 3])
})

test('persistent DNS failure exits after five probes and preserves the original error', async () => {
  const error = failure('ENOTFOUND'), waits: number[] = []
  let calls = 0
  await assert.rejects(connectDatabaseAtStartup(async () => { calls++; throw error }, {
    wait: async milliseconds => { waits.push(milliseconds) },
  }), thrown => thrown === error)
  assert.equal(calls, 5)
  assert.deepEqual(waits, [1000, 2000, 4000, 8000])
})

test('wrong credentials and missing schema fail immediately without retrying', async () => {
  for (const code of ['28P01', 'ER_ACCESS_DENIED_ERROR', '42P01', '3D000']) {
    let calls = 0
    const waits: number[] = []
    await assert.rejects(connectDatabaseAtStartup(async () => { calls++; throw failure(code) }, {
      wait: async milliseconds => { waits.push(milliseconds) },
    }))
    assert.equal(calls, 1)
    assert.deepEqual(waits, [])
  }
})

test('recognizes nested connection errors and does not retry arbitrary SQL failures', () => {
  assert.equal(isTransientDatabaseConnectionError(new AggregateError([failure('ECONNREFUSED'), failure('ETIMEDOUT')])), true)
  assert.equal(isTransientDatabaseConnectionError(new Error('Wrapped', { cause: failure('EAI_AGAIN') })), true)
  assert.equal(isTransientDatabaseConnectionError(new Error('Connection terminated due to connection timeout')), true)
  assert.equal(isTransientDatabaseConnectionError(failure('57P03')), true)
  assert.equal(isTransientDatabaseConnectionError(failure('23505')), false)
})

test('a successful first probe has no wait and no retry notification', async () => {
  let calls = 0
  await connectDatabaseAtStartup(async () => { calls++ }, {
    wait: async () => { assert.fail('Unexpected wait') },
    onRetry: () => { assert.fail('Unexpected retry') },
  })
  assert.equal(calls, 1)
})

test('startup messages identify DNS and credentials without leaking error contents', () => {
  const error = Object.assign(new Error('postgresql://private-user:private-password@private-host/db'), { code: 'ENOTFOUND' })
  const message = databaseStartupErrorMessage(error)
  assert.match(message, /DNS/)
  assert.doesNotMatch(message, /private-user|private-password|private-host/)
  assert.match(databaseStartupErrorMessage(failure('28P01')), /rejected its login details/)
  assert.match(databaseStartupErrorMessage(failure('ETIMEDOUT')), /unreachable after connection retries/)
  assert.match(databaseStartupErrorMessage(failure('42P01')), /required migrations/)
})
