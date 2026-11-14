import assert from 'node:assert/strict'
import test from 'node:test'
import { paymentReturnUrl } from './payment-return.ts'

const id = '00000000-0000-4000-8000-000000000001'
test('payment returns use a configured HTTPS page with only the owned payment reference', () => {
  assert.equal(paymentReturnUrl(null, id), null)
  assert.equal(paymentReturnUrl('https://return.example/payments/result', id), 'https://return.example/payments/result?payment=' + id)
  for (const base of ['http://localhost:5173/payments/result', 'https://localhost/payments/result',
    'https://return.example/other', 'https://return.example/payments/result?returnTo=elsewhere',
    'https://user:password@return.example/payments/result', 'https://return.example/payments/result#paid']) {
    assert.throws(() => paymentReturnUrl(base, id))
  }
  assert.throws(() => paymentReturnUrl('https://return.example/payments/result', 'bad-reference'))
})
