import assert from 'node:assert/strict'
import test from 'node:test'
import paymentReturn from './api/return.js'

const id = '00000000-0000-4000-8000-000000000001'
function call(url, method = 'GET') {
  const headers = {}, response = { setHeader(key, value) { headers[key] = value }, end(body) { this.body = body } }
  paymentReturn({ url, method }, response)
  return { ...response, headers }
}
test('HTTPS entry returns only to the fixed local confirmation page without claiming success', () => {
  const result = call('/payments/result?payment=' + id)
  assert.equal(result.statusCode, 303)
  assert.equal(result.headers.Location, 'http://localhost:5173/payments/result?payment=' + id)
  assert.equal(result.headers['Cache-Control'], 'no-store')
  assert.equal(result.headers['Referrer-Policy'], 'no-referrer')
  assert.ok(!result.headers.Location.includes('status=paid'))
})
test('rejects open redirects, duplicate IDs, claimed status, malformed IDs and writes', () => {
  for (const query of ['payment=bad', 'payment=' + id + '&returnTo=https://evil.example', 'payment=' + id + '&payment=' + id, 'payment=' + id + '&status=paid', '']) {
    assert.equal(call('/payments/result?' + query).statusCode, 400)
  }
  assert.equal(call('/payments/result?payment=' + id, 'POST').statusCode, 405)
  assert.equal(call('/payments/result?payment=' + id, 'HEAD').statusCode, 303)
})
