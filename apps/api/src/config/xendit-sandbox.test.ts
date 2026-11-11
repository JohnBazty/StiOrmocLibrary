import assert from 'node:assert/strict'
import test from 'node:test'
import { readXenditSandboxConfig } from './xendit-sandbox.ts'

const databaseUrl = 'postgresql://sandbox_app:fixture-password@127.0.0.1:55438/sti_xendit_sandbox'
const settings = () => ({
  XENDIT_ENABLED: 'true',
  XENDIT_MODE: 'test',
  XENDIT_SECRET_KEY: 'xnd_development_fixture_key_only_for_tests',
  XENDIT_WEBHOOK_TOKEN: 'fixture_webhook_token_only_for_tests',
  DATABASE_URL: databaseUrl,
  XENDIT_SANDBOX_DATABASE_URL: databaseUrl,
})

test('disabled payments need no keys or database configuration', () => {
  assert.deepEqual(readXenditSandboxConfig({}), { enabled: false })
})

test('sandbox configuration derives URLs from one approved test origin', () => {
  const config = readXenditSandboxConfig({
    ...settings(), XENDIT_SANDBOX_PUBLIC_ORIGIN: 'https://library-sandbox.example',
  })
  assert.equal(config.enabled, true)
  if (!config.enabled) return
  assert.equal(config.apiOrigin, 'https://api.xendit.co')
  assert.equal(config.webhookUrl, 'https://library-sandbox.example/api/payments/xendit/webhook')
  assert.equal(config.returnUrl, 'https://library-sandbox.example/payments/result')
  assert.equal(config.databaseUrl, databaseUrl)
})

test('public callbacks can stay pending during local preparation', () => {
  const config = readXenditSandboxConfig(settings())
  assert.equal(config.enabled, true)
  if (config.enabled) assert.equal(config.webhookUrl, null)
})

test('invalid flags, live keys and incomplete credentials fail without leaking values', () => {
  for (const invalid of [
    { XENDIT_ENABLED: 'yes' },
    { XENDIT_MODE: 'live' },
    { XENDIT_SECRET_KEY: 'xnd_production_do_not_log_this_key' },
    { XENDIT_WEBHOOK_TOKEN: '' },
    { XENDIT_API_BASE_URL: 'https://untrusted.example' },
  ]) {
    assert.throws(() => readXenditSandboxConfig({ ...settings(), ...invalid }), error => {
      assert.ok(error instanceof Error)
      assert.doesNotMatch(error.message, /do_not_log_this_key|fixture_key|fixture-password/)
      return true
    })
  }
})

test('sandbox settings reject remote, wrong and mismatched application databases', () => {
  for (const url of [
    'postgresql://sandbox_app:fixture-password@db.example/sti_xendit_sandbox',
    'postgresql://sandbox_app:fixture-password@127.0.0.1:55438/postgres',
    databaseUrl + '?host=remote.example',
    databaseUrl.replace('postgresql:', 'https:'),
  ]) assert.throws(() => readXenditSandboxConfig({
    ...settings(), DATABASE_URL: url, XENDIT_SANDBOX_DATABASE_URL: url,
  }))
  assert.throws(() => readXenditSandboxConfig({
    ...settings(), DATABASE_URL: 'postgresql://production.example/postgres',
  }))
})

test('callback origins reject production, insecure URLs, credentials and URL suffixes', () => {
  for (const origin of [
    'http://library-sandbox.example', 'https://sti-ormoc-smart-library.vercel.app',
    'https://user:password@library-sandbox.example', 'https://library-sandbox.example/path',
    'https://library-sandbox.example?token=secret', 'https://library-sandbox.example/#fragment',
  ]) assert.throws(() => readXenditSandboxConfig({
    ...settings(), XENDIT_SANDBOX_PUBLIC_ORIGIN: origin,
  }))
})
