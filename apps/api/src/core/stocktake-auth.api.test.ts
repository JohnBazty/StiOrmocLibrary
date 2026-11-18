import assert from 'node:assert/strict'
import test from 'node:test'
import request from 'supertest'
import { createApp } from '../app.js'

test('through the real app, unauthenticated stocktake requests get 401', async () => {
  const response = await request(createApp()).get('/api/inventory/stocktakes')
  assert.equal(response.status, 401)
})
