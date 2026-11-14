import assert from 'node:assert/strict'
import test from 'node:test'
import express from 'express'
import request from 'supertest'
import { normalizeVercelRequest } from './vercel-request.js'
import { parseTarget } from '../modules/payments/payments.validation.ts'

function app(lazy = false) {
  const api = express()
  api.get('/api/v1/user/payments/options', (req, res) => {
    try { res.json(parseTarget(req.query)) }
    catch (error) { res.status(error.status ?? 500).json({ code: error.code }) }
  })
  return (req, res) => {
    // Vercel supplies its own pre-parsed query object before Express runs.
    const values = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams)
    const parsed = () => ({ ...values, __api_route: 'v1/user/payments/options' })
    Object.defineProperty(req, 'query', lazy ? { configurable: true, get: parsed } : { configurable: true, writable: true, value: parsed() })
    normalizeVercelRequest(req)
    api(req, res)
  }
}

test('payment options accept genuine fields after Vercel adds routing metadata', async () => {
  for (const path of ['/api/index?__api_route=v1%2Fuser%2Fpayments%2Foptions&kind=Fine&targetId=12',
    '/api/v1/user/payments/options?kind=Printing&targetId=8']) {
    const response = await request(app()).get(path)
    assert.equal(response.status, 200)
    assert.ok(['Fine', 'Printing'].includes(response.body.kind))
  }
})

test('normalization preserves strict payment validation for actual unexpected fields', async () => {
  const response = await request(app()).get('/api/index?__api_route=v1%2Fuser%2Fpayments%2Foptions&kind=Fine&targetId=12&userId=99')
  assert.equal(response.status, 422)
})

test('normalization preserves ordinary query strings and works without Vercel helpers', () => {
  const req = { url: '/api/index?__api_route=public%2Fcatalog%2Ftitles&q=A%26B&page=2' }
  normalizeVercelRequest(req)
  assert.equal(req.url, '/api/public/catalog/titles?q=A%26B&page=2')
  const direct = { url: '/api/health' }
  normalizeVercelRequest(direct)
  assert.equal(direct.url, '/api/health')
})

test('payment options also work when the hosting query helper returns a fresh object', async () => {
  const response = await request(app(true)).get('/api/index?__api_route=v1%2Fuser%2Fpayments%2Foptions&kind=Fine&targetId=12')
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, {kind: 'Fine', targetId: 12})
})
