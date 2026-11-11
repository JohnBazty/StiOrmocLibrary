import assert from 'node:assert/strict'
import test from 'node:test'
import { startLocalJobTimer } from './index.ts'
import type { JobRunner } from './job-runner.service.ts'

test('A2: the local job timer stays off unless enabled', () => {
  let calls = 0
  const runner = { runAll: async () => { calls += 1; return [] } } as unknown as JobRunner
  assert.equal(startLocalJobTimer(false, runner), null)
  assert.equal(calls, 0)
})

test('the enabled local timer runs all jobs through the runner and never overlaps itself', async () => {
  let calls = 0
  let release: () => void = () => {}
  const runner = { runAll: () => { calls += 1; return new Promise<[]>((resolve) => { release = () => resolve([]) }) } } as unknown as JobRunner
  const timer = startLocalJobTimer(true, runner, 60_000)
  assert.ok(timer)
  await timer.tick()
  assert.equal(calls, 1, 'a tick while a run is in progress does nothing')
  release()
  await new Promise((resolve) => setImmediate(resolve))
  const next = timer.tick()
  release()
  await next
  assert.equal(calls, 2)
  timer.stop()
})
