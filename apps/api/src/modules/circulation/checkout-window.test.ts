import assert from 'node:assert/strict'
import test from 'node:test'
import { checkoutWindowBlocker } from './desk-circulation.policy.ts'

const policy = { checkout_opens_at: '14:00:00' }
const at = (time: string) => new Date(`2026-11-23T${time}+08:00`)

test('checkout before the opening time is refused with the time in the message', () => {
  assert.equal(checkoutWindowBlocker(at('13:59:00'), policy, 'TakeHome'), 'Checkout opens at 2:00 PM. You can read this book inside the library now.')
})

test('checkout from the opening time is allowed', () => {
  assert.equal(checkoutWindowBlocker(at('14:00:00'), policy, 'TakeHome'), null)
  assert.equal(checkoutWindowBlocker(at('16:30:00'), policy, 'TakeHome'), null)
})

test('in-library reading and online requests are not limited by the checkout time', () => {
  assert.equal(checkoutWindowBlocker(at('10:00:00'), policy, 'InLibrary'), null)
  assert.equal(checkoutWindowBlocker(at('10:00:00'), policy, 'Online'), null)
})

test('a policy row without the column uses 14:00', () => {
  assert.notEqual(checkoutWindowBlocker(at('13:00:00'), {}, 'TakeHome'), null)
  assert.equal(checkoutWindowBlocker(at('14:00:00'), {}, 'TakeHome'), null)
})

test('the configured time is used', () => {
  assert.equal(checkoutWindowBlocker(at('09:30:00'), { checkout_opens_at: '09:00:00' }, 'TakeHome'), null)
  assert.match(String(checkoutWindowBlocker(at('08:30:00'), { checkout_opens_at: '09:00:00' }, 'TakeHome')), /9:00 AM/)
})
