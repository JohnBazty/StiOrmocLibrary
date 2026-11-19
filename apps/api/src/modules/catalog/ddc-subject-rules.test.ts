import assert from 'node:assert/strict'
import test from 'node:test'
import { classifySubject, subjectRules } from './ddc-subject-rules.ts'
import { isAutomaticDdcSection } from './ddc-sections.ts'

test('section rules recognize clear English, Tagalog and mixed-language subjects', () => {
  for (const [title, expected] of [
    ['Panimula sa Algebra', '512'], ['Basic arithmetic', '513'],
    ['Mga Batayan ng Aritmetika', '513'], ['Panimula sa Heometriya', '516'],
    ['Calculus for beginners', '515'], ['Computer networks', '004'],
    ['Mga Batayan ng Pagpoprograma', '005'], ['Pag-aaral ng Panitikan', '800'],
    ['Balarila ng Wikang Tagalog', '499'], ['Kasaysayan ng Pilipinas', '959'],
    ['Human anatomy', '611'], ['Anatomiya ng Tao', '611'],
    ['Panimula sa Agham Pampolitika', '320'], ['Panimula sa Lohika', '160'],
    ['Makabagong Agrikultura', '630'], ['Panimula sa Pisika', '530'],
  ]) {
    const result = classifySubject(title)
    assert.equal(result.code, expected, title)
    assert.equal(result.status, 'matched')
    assert.equal(result.referenceVersion.length > 0, true)
    assert.equal(isAutomaticDdcSection(result.code!), true)
  }
})

test('a narrower reviewed rule supersedes only its own broader rule', () => {
  assert.equal(classifySubject('Mathematics: Algebra').code, '512')
  assert.equal(classifySubject('Geometry and physics').status, 'needs_review')
  assert.equal(classifySubject('Physics and mathematics').status, 'needs_review')
  assert.equal(classifySubject('Mathematics education').status, 'needs_review')
  assert.equal(classifySubject('Algebra and geometry').status, 'needs_review')
})

test('vague titles and incidental subject words require review', () => {
  for (const title of ['Bagong book', 'Bagong Bukas', '', 'Biology in a novel', 'Nobela tungkol sa pisika', 'The outlaw', 'A story about chemistry']) {
    assert.equal(classifySubject(title).status, 'needs_review', title)
  }
  assert.equal(classifySubject('Bagong Bukas', 'An introductory textbook on algebra.').code, '512')
  assert.equal(classifySubject('PISIKA: mga batayan').code, '530')
  assert.equal(classifySubject('ａｌｇｅｂｒａ').code, '512')
  // Do not invent words by joining the end of a title with its description.
  assert.equal(classifySubject('Computer', 'networks').status, 'needs_review')
})

test('every installed matching rule targets an active section and uses normalized vocabulary', () => {
  assert.ok(subjectRules.length > 19)
  for (const rule of subjectRules) {
    assert.equal(isAutomaticDdcSection(rule.code), true, rule.code)
    assert.ok(rule.phrases.length)
  }
})
