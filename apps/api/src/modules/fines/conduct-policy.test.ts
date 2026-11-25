import assert from 'node:assert/strict'
import test from 'node:test'
import { conductAction, normalizeStudentLevel, resolveWarningsBeforeFine } from './conduct-policy.ts'

test('with two warnings before the fine, the third offense is a fine', () => {
  assert.equal(conductAction(0, 2), 'First warning')
  assert.equal(conductAction(1, 2), 'Second warning')
  assert.equal(conductAction(2, 2), 'Fine')
  assert.equal(conductAction(12, 2), 'Fine')
})

test('the threshold decides how many warnings come first, including values above 3', () => {
  assert.equal(conductAction(0, 0), 'Fine')
  assert.equal(conductAction(0, 1), 'First warning')
  assert.equal(conductAction(1, 1), 'Fine')
  assert.equal(conductAction(1, 3), 'Second warning')
  assert.equal(conductAction(2, 3), 'Final warning')
  assert.equal(conductAction(3, 3), 'Fine')
  assert.equal(conductAction(2, 5), 'Warning 3')
  assert.equal(conductAction(3, 5), 'Warning 4')
  assert.equal(conductAction(4, 5), 'Final warning')
  assert.equal(conductAction(5, 5), 'Fine')
})

test('old Final warning holders become fine-eligible on their next offense', () => {
  // Three warnings used under the old rule is more than the two now required.
  assert.equal(conductAction(3, 2), 'Fine')
})

test('invalid history counts or thresholds cannot skip or repeat warning stages', () => {
  for (const count of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => conductAction(count, 2), RangeError)
  }
  for (const threshold of [-1, 100, 1.5, NaN]) {
    assert.throws(() => conductAction(0, threshold), RangeError)
  }
})

test('student year and grade levels normalize cleanly and resolve per-level warning overrides', () => {
  assert.equal(normalizeStudentLevel('1st Year'), '1st Year')
  assert.equal(normalizeStudentLevel('1Y1'), '1st Year')
  assert.equal(normalizeStudentLevel('2nd Year'), '2nd Year')
  assert.equal(normalizeStudentLevel('3rd'), '3rd Year')
  assert.equal(normalizeStudentLevel('4'), '4th Year')
  assert.equal(normalizeStudentLevel('G11'), 'Grade 11')
  assert.equal(normalizeStudentLevel('Grade 12'), 'Grade 12')
  assert.equal(normalizeStudentLevel(''), null)
  assert.equal(normalizeStudentLevel('College'), null)

  assert.equal(resolveWarningsBeforeFine(2, { '1st Year': 3, '4th Year': 0 }, '1st Year'), 3)
  assert.equal(resolveWarningsBeforeFine(2, { '1st Year': 3, '4th Year': 0 }, '4th Year'), 0)
  assert.equal(resolveWarningsBeforeFine(2, { '1st Year': 3 }, '2nd Year'), 2)
  assert.equal(resolveWarningsBeforeFine(2, { '1st Year': 3 }, null), 2)
})
