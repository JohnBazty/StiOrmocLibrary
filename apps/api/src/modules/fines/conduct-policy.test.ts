import assert from 'node:assert/strict'
import test from 'node:test'
import { conductAction } from './conduct-policy.ts'

test('three qualifying incidents produce warnings before fine review', () => {
  assert.equal(conductAction(0), 'First warning')
  assert.equal(conductAction(1), 'Second warning')
  assert.equal(conductAction(2), 'Final warning')
  assert.equal(conductAction(3), 'Eligible for fine review')
  assert.equal(conductAction(12), 'Eligible for fine review')
})

test('invalid history counts cannot skip or repeat warning stages', () => {
  for (const count of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => conductAction(count), RangeError)
  }
})
