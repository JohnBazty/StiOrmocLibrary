import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
import { createJobHandlers, isJobName, JOB_NAMES } from './job-runner.jobs.ts'

test('payment recovery is a bounded job in the chosen runner and failures contain no provider data', async () => {
  const database = {} as Pool
  const handlers = createJobHandlers(database, () => new Date(), async () => ({ processed: 2, pending: 1 }))
  assert.equal(JOB_NAMES.filter(name => name === 'payment-recovery').length, 1)
  assert.deepEqual(await handlers['payment-recovery']({ cursor: null }), { result: { processed: 2, pending: 1 } })
  const failing = createJobHandlers(database, () => new Date(), async () => { throw new Error('Private provider response') })
  await assert.rejects(failing['payment-recovery']({ cursor: null }), error => {
    assert.equal((error as Error & { code: string }).code, 'PAYMENT_RECOVERY_FAILED')
    assert.doesNotMatch((error as Error).message, /Private provider/)
    return true
  })
})

test('only allowlisted job names are accepted', () => {
  assert.equal(isJobName('circulation-overdue'), true)
  for (const name of ['all', 'constructor', '__proto__', 'CIRCULATION-OVERDUE', '']) assert.equal(isJobName(name), false, name)
})

test('every job name has a handler that calls its service on the given database', async () => {
  const marker = new Error('reached the database')
  const database = { execute: async () => { throw marker }, getConnection: async () => { throw marker } } as unknown as Pool
  const handlers = createJobHandlers(database, () => new Date('2026-11-11T02:00:00Z'))
  assert.deepEqual(Object.keys(handlers).sort(), [...JOB_NAMES].sort())
  for (const name of JOB_NAMES) {
    const outcome = await handlers[name]({ cursor: null }).then((value) => value, (error: unknown) => error)
    if (outcome === marker) continue
    // Enrollment and online payments are switched off in tests.
    assert.ok(['enrollment-close', 'payment-recovery'].includes(name), `${name} did not use the database`)
    assert.deepEqual(outcome, name === 'enrollment-close' ? { result: { closed: false } } : { result: { skipped: true } })
  }
})


test('an unreadable overdue cursor restarts the pass and is reported', async () => {
  const warnings: string[] = []
  const original = console.warn
  console.warn = (line: string) => { warnings.push(line) }
  try {
    const marker = new Error('reached the database')
    const database = { execute: async () => { throw marker }, getConnection: async () => { throw marker } } as unknown as Pool
    await createJobHandlers(database)['circulation-overdue']({ cursor: '{"dueAt":"2026-11-10 08:59:00+00","transactionId":1}' }).catch(() => {})
    await createJobHandlers(database)['circulation-overdue']({ cursor: null }).catch(() => {})
  } finally { console.warn = original }
  assert.deepEqual(warnings, ['[Job runner] circulation-overdue cursor could not be read; the scan restarts from the oldest loan.'])
})
