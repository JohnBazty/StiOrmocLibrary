import assert from 'node:assert/strict'
import test from 'node:test'
import type { Pool } from '../../config/db.js'
import { createJobHandlers, isJobName, JOB_NAMES } from './job-runner.jobs.ts'

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
    // Enrollment is switched off in tests, so it answers without the database.
    assert.equal(name, 'enrollment-close', `${name} did not use the database`)
    assert.deepEqual(outcome, { result: { closed: false } })
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
