import assert from 'node:assert/strict'
import test from 'node:test'
import { conductAction } from './conduct-policy.ts'

test('with two warnings before the fine, the third offense is a fine', () => {
  assert.equal(conductAction(0, 2), 'First warning')
  assert.equal(conductAction(1, 2), 'Second warning')
  assert.equal(conductAction(2, 2), 'Fine')
  assert.equal(conductAction(12, 2), 'Fine')
})

test('the threshold decides how many warnings come first', () => {
  assert.equal(conductAction(0, 0), 'Fine')
  assert.equal(conductAction(0, 1), 'First warning')
  assert.equal(conductAction(1, 1), 'Fine')
  assert.equal(conductAction(1, 3), 'Second warning')
  assert.equal(conductAction(2, 3), 'Final warning')
  assert.equal(conductAction(3, 3), 'Fine')
})

test('old Final warning holders become fine-eligible on their next offense', () => {
  // Three warnings used under the old rule is more than the two now required.
  assert.equal(conductAction(3, 2), 'Fine')
})

test('invalid history counts or thresholds cannot skip or repeat warning stages', () => {
  for (const count of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => conductAction(count, 2), RangeError)
  }
  for (const threshold of [-1, 4, 1.5, NaN]) {
    assert.throws(() => conductAction(0, threshold), RangeError)
  }
})
