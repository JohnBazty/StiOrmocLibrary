import assert from 'node:assert/strict'
import test from 'node:test'
import { demoWalletAccounts, verifyDemoWallet, requireDemoWalletConfig } from './demo-wallet.ts'

test('ten unique Philippine-format fixtures accept only their matching fake PIN', () => {
  assert.equal(demoWalletAccounts.length, 10)
  assert.equal(new Set(demoWalletAccounts.map(row => row.number)).size, 10)
  for (const row of demoWalletAccounts) {
    assert.match(row.number, /^09\d{9}$/)
    assert.ok(!row.number.includes('000'))
    assert.doesNotThrow(() => verifyDemoWallet(row))
    assert.throws(() => verifyDemoWallet({ ...row, pin: '1111' }))
  }
  for (const value of [null, {}, { number: '09123456789', pin: '1234' }, { number: '09174826315', pin: 4826 }]) {
    assert.throws(() => verifyDemoWallet(value))
  }
})

test('demo entry fails closed outside development credentials', () => {
  assert.throws(() => requireDemoWalletConfig({ enabled: false }))
  assert.throws(() => requireDemoWalletConfig({ enabled: true, mode: 'test', secretKey: 'xnd_production_not_allowed' } as never))
  assert.doesNotThrow(() => requireDemoWalletConfig({ enabled: true, mode: 'test', secretKey: 'xnd_development_fixture' } as never))
})
