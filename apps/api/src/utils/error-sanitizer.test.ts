import assert from 'node:assert/strict'
import test from 'node:test'
import { sanitizeStackTrace } from './error-sanitizer.ts'

test('keeps frame file names and line numbers but drops full paths', () => {
  const error = new Error('boom')
  error.stack = 'Error: boom\n    at handler (file:///C:/Users/x/app/src/modules/a.ts:12:3)\n    at /srv/app/b.js:4:1'
  const out = sanitizeStackTrace(error)
  assert.match(out, /^Error SERVICE_ERROR: boom/)
  assert.match(out, /at handler \(a\.ts:12:3\)/)
  assert.match(out, /at b\.js:4:1/)
  assert.doesNotMatch(out, /Users|srv/)
})

test('redacts connection strings, secrets, emails and quoted values from the message', () => {
  const error = Object.assign(new Error('connect postgres://u:p@h/db failed token=abc for a@b.co: invalid input "John Doe"'), { code: '22P02' })
  const out = sanitizeStackTrace(error)
  assert.match(out, /^Error 22P02:/)
  assert.doesNotMatch(out, /u:p@h|abc|a@b\.co|John Doe/)
})

test('a message line mentioning api_key is still logged, redacted', () => {
  const error = new Error('missing api_key=XYZ')
  error.stack = 'Error: missing api_key=XYZ\n    at x (/a/b.ts:1:1)'
  assert.match(sanitizeStackTrace(error), /missing api_key=\[redacted\]/)
})

test('non-errors are not logged verbatim', () => {
  assert.equal(sanitizeStackTrace({ password: 'x' }), '[Non-Error object]')
})
