import assert from 'node:assert/strict'
import test from 'node:test'
import request from 'supertest'
import { createApp } from '../../app.js'

test('through the real app, the job route answers before any body parsing and refuses a missing secret', async () => {
  // A body the JSON parser would reject with 400; the job route must not parse it at all.
  const response = await request(createApp()).post('/api/internal/jobs/notifications').set('Content-Type', 'application/json').send('{not json')
  assert.equal(response.status, 401)
  assert.equal(response.body.code, 'JOB_RUNNER_UNAUTHORIZED')
})

test('through the real app, the Admin job status needs a signed-in user', async () => {
  const response = await request(createApp()).get('/api/v1/admin/jobs')
  assert.equal(response.status, 401)
})
