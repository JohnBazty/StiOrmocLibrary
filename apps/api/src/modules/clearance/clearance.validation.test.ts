import test from 'node:test'
import assert from 'node:assert/strict'
import { validateLostDecision, validateOverride, validateRevocation } from './clearance.validation.ts'

test('clearance override requires a documented reason', () => {
  assert.throws(() => validateOverride({ status: 'Cleared', reason: 'short' }), /correct the override fields/i)
  const result = validateOverride({ status: 'Cleared', reason: 'Approved after documented manual review.' })
  assert.equal(result.status, 'Cleared')
})

test('revocation keeps a meaningful audit reason', () => {
  assert.throws(() => validateRevocation({ reason: 'no' }), /at least 10/i)
  assert.equal(validateRevocation({ reason: 'The exception period has ended.' }).reason, 'The exception period has ended.')
})

test('confirmed legacy loss accepts a positive replacement charge', () => {
  assert.throws(() => validateLostDecision({ status: 'Confirmed', replacement_charge: 0 }), /positive amount/i)
  assert.equal(validateLostDecision({ status: 'Confirmed', replacement_charge: '650.00' }).replacementCharge, 650)
})
