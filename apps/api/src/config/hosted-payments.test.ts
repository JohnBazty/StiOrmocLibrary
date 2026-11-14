import assert from 'node:assert/strict'
import test from 'node:test'
import { readHostedPaymentConfig } from './hosted-payments.ts'

const settings = { HOSTED_PAYMENT_PREVIEW: 'true', XENDIT_ENABLED: 'false', XENDIT_MODE: 'test',
  XENDIT_SECRET_KEY: 'xnd_development_' + 'a'.repeat(30), XENDIT_WEBHOOK_TOKEN: 'b'.repeat(32),
  DATABASE_URL: 'postgresql://fixture:fixture@database.invalid/library', WEB_ORIGIN: 'https://sti-ormoc-smart-library.vercel.app' }

test('hosted checkout requires explicit practice mode, approved origin and development keys', () => {
  assert.deepEqual(readHostedPaymentConfig({}), { enabled: false })
  const config = readHostedPaymentConfig(settings)
  assert.ok(config.enabled)
  assert.equal(config.mode, 'test')
  assert.equal(config.returnUrl, settings.WEB_ORIGIN + '/payments/result')
  for (const changes of [{ XENDIT_ENABLED: 'true' }, { XENDIT_MODE: 'live' }, { XENDIT_SECRET_KEY: 'xnd_production_' + 'a'.repeat(30) },
    { WEB_ORIGIN: 'https://unapproved.invalid' }, { DATABASE_URL: 'https://unapproved.invalid' }, { XENDIT_WEBHOOK_TOKEN: '' }]) {
    assert.throws(() => readHostedPaymentConfig({ ...settings, ...changes }))
  }
})
