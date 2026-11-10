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

