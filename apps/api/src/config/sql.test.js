import { toPgPlaceholders, stripBackticks } from './sql.js'
import assert from 'node:assert/strict'
import { test } from 'node:test'

test('toPgPlaceholders converts positional markers', () => {
  assert.equal(toPgPlaceholders('SELECT * FROM t WHERE a = ? AND b = ?'), 'SELECT * FROM t WHERE a = $1 AND b = $2')
})

test('toPgPlaceholders ignores question marks inside strings', () => {
  assert.equal(toPgPlaceholders("SELECT '?' AS q, x = ?"), "SELECT '?' AS q, x = $1")
})

test('stripBackticks removes MySQL identifiers', () => {
  assert.equal(stripBackticks('SELECT `x` FROM `t`'), 'SELECT x FROM t')
})
