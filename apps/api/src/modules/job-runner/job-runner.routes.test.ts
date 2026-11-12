import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { requireLibraryPermission } from '../auth/jwt-auth.middleware.ts'
import { createAdminJobRouter, createInternalJobRouter } from './job-runner.routes.ts'
import type { JobRunner } from './job-runner.service.ts'

const secret = 'abcdefghijklmnopqrstuvwxyz012345'

function fakeRunner(calls: string[]) {
  return {
    run: async (job: string) => { calls.push(job); return { job, outcome: 'succeeded', result: { done: 1 } } },
    runAll: async () => { calls.push('all'); return [{ job: 'notifications', outcome: 'succeeded', result: {} }] },
    status: async () => ({ generatedAt: '2026-11-11T00:00:00.000Z', jobs: [] }),
  } as unknown as JobRunner
}

function internalApp(calls: string[], configured = secret, logs: string[] = []) {
  const app = express()
  app.use('/api/internal/jobs', createInternalJobRouter(fakeRunner(calls), () => configured, (line) => logs.push(line)))
  return app
}

test('internal job route refuses a missing, wrong or unconfigured secret without running anything', async () => {
  const calls: string[] = []
  const logs: string[] = []
  for (const header of [undefined, 'wrong', `${secret}x`, `Bearer ${secret}`]) {
    const call = request(internalApp(calls, secret, logs)).post('/api/internal/jobs/notifications')
    const response = await (header === undefined ? call : call.set('X-Job-Runner-Secret', header))
    assert.equal(response.status, 401, String(header))
    assert.equal(response.body.code, 'JOB_RUNNER_UNAUTHORIZED')
  }
  const unconfigured = await request(internalApp(calls, '')).post('/api/internal/jobs/notifications').set('X-Job-Runner-Secret', '')
  assert.equal(unconfigured.status, 401)
  const bearer = await request(internalApp(calls)).post('/api/internal/jobs/notifications').set('Authorization', `Bearer ${secret}`)
  assert.equal(bearer.status, 401, 'only X-Job-Runner-Secret is accepted')
  assert.deepEqual(calls, [])
  assert.equal(logs.some((line) => line.includes(secret)), false)
})

test('internal job route runs one allowlisted job, or all of them, with the right secret', async () => {
  const calls: string[] = []
  const one = await request(internalApp(calls)).post('/api/internal/jobs/notifications').set('X-Job-Runner-Secret', secret)
  assert.equal(one.status, 200)
  assert.deepEqual(one.body, { success: true, data: { job: 'notifications', outcome: 'succeeded', result: { done: 1 } } })
  const all = await request(internalApp(calls)).post('/api/internal/jobs/all').set('X-Job-Runner-Secret', secret)
  assert.equal(all.status, 200)
  assert.equal(all.body.data.length, 1)
  assert.deepEqual(calls, ['notifications', 'all'])
  assert.equal(JSON.stringify(all.body).includes(secret), false)
})

test('an unknown job name is 404 after the secret check, and never runs', async () => {
  const calls: string[] = []
  const unknown = await request(internalApp(calls)).post('/api/internal/jobs/drop-tables').set('X-Job-Runner-Secret', secret)
  assert.equal(unknown.status, 404)
  assert.equal(unknown.body.code, 'JOB_NOT_FOUND')
  const unknownNoSecret = await request(internalApp(calls)).post('/api/internal/jobs/drop-tables')
  assert.equal(unknownNoSecret.status, 401, 'job names are not revealed without the secret')
  const proto = await request(internalApp(calls)).post('/api/internal/jobs/constructor').set('X-Job-Runner-Secret', secret)
  assert.equal(proto.status, 404)
  assert.deepEqual(calls, [])
})

function adminApp(role?: string) {
  const app = express()
  app.use((_request, response, next) => { if (role) response.locals.authenticatedUser = { accountId: 1, role }; next() })
  app.use('/api/v1/admin/jobs', requireLibraryPermission('library.manage'), createAdminJobRouter(fakeRunner([])))
  return app
}

test('Admin job status needs the Admin (Librarian) role and is not cached', async () => {
  const admin = await request(adminApp('Librarian')).get('/api/v1/admin/jobs')
  assert.equal(admin.status, 200)
  assert.deepEqual(admin.body, { success: true, data: { generatedAt: '2026-11-11T00:00:00.000Z', jobs: [] } })
  assert.match(String(admin.headers['cache-control']), /no-store/)
  for (const role of ['Staff', 'Student', 'Faculty', undefined]) {
    const response = await request(adminApp(role)).get('/api/v1/admin/jobs')
    assert.equal(response.status, 403, String(role))
  }
})

test('a runner failure answers 500 with a generic message and logs only the job and error code', async () => {
  const logs: string[] = []
  const runner = { run: async () => { throw Object.assign(new Error(`postgresql://u:${secret}@h/db`), { code: 'ECONNREFUSED' }) } } as unknown as JobRunner
  const app = express()
  app.use('/api/internal/jobs', createInternalJobRouter(runner, () => secret, (line) => logs.push(line)))
  const response = await request(app).post('/api/internal/jobs/notifications').set('X-Job-Runner-Secret', secret)
  assert.equal(response.status, 500)
  assert.equal(response.body.code, 'JOB_RUNNER_FAILED')
  assert.deepEqual(logs, ['[Job runner] notifications could not run (ECONNREFUSED).'])
})

test('an Admin status failure goes to the error handler', async () => {
  const runner = { status: async () => { throw new Error('db down') } } as unknown as JobRunner
  const app = express()
  app.use('/api/v1/admin/jobs', createAdminJobRouter(runner))
  app.use((_error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => { response.status(503).json({ success: false }) })
  assert.equal((await request(app).get('/api/v1/admin/jobs')).status, 503)
})

test('the internal route is rate limited per caller', async () => {
  const app = internalApp([])
  let limited = 0
  for (let i = 0; i < 31; i += 1) if ((await request(app).post('/api/internal/jobs/notifications')).status === 429) limited += 1
  assert.equal(limited, 1)
})
