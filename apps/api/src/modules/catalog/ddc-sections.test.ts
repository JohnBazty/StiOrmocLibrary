import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { ddcSections, ddcReference, findDdcSection, isAutomaticDdcSection, isDdcWithin } from './ddc-sections.ts'

test('the installed reference preserves every selected position and its source', () => {
  const document = readFileSync(new URL('../../../../../docs/references/ddc-sections-000-999.md', import.meta.url), 'utf8')
  const selected = [...document.matchAll(/^\| (\d{3}) \| (.*?) \|$/gm)]
  assert.equal(selected.length, 1000)
  assert.deepEqual(ddcSections.map(entry => [entry.code, entry.label]), selected.map(match => [match[1], match[2]]))
  assert.deepEqual(ddcSections.map(entry => entry.code), Array.from({ length: 1000 }, (_, index) => String(index).padStart(3, '0')))
  assert.equal(ddcReference.license, 'CC-BY-SA-4.0')
  assert.match(ddcReference.source, /oldid=1380680828/)
  assert.ok(ddcSections.every(entry => entry.division === entry.code.slice(0, 2) + '0'))
})

test('section-level suggestions remain compatible with their broader shelf categories', () => {
  assert.equal(isDdcWithin('512', '510'), true)
  assert.equal(isDdcWithin('512', '500'), true)
  assert.equal(isDdcWithin('530', '530'), true)
  assert.equal(isDdcWithin('530', '510'), false)
  assert.equal(isDdcWithin('510', '512'), false)
  assert.equal(isDdcWithin('163', '160'), false)
})

test('inactive, moved and optional positions are not automatic classification targets', () => {
  for (const code of ['007', '040', '049', '163', '164', '517', '921', '928', '991', '992']) {
    assert.equal(isAutomaticDdcSection(code), false, code)
  }
  assert.equal(findDdcSection('018')?.status, 'moved')
  assert.equal(findDdcSection('018')?.replacement, '017')
  assert.equal(isAutomaticDdcSection('018'), false)
  assert.equal(isAutomaticDdcSection('005'), true)
  assert.equal(isAutomaticDdcSection('512'), true)
  for (const code of ['5', '005.1', '1000', ' 005', '-01', 'abc']) {
    assert.equal(findDdcSection(code), undefined)
    assert.equal(isAutomaticDdcSection(code), false)
  }
})
