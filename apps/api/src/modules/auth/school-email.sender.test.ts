import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpError } from '../../core/http-error.ts'
import { requireVerificationSender, sendSchoolVerificationCode } from './school-email.sender.ts'

const recipient = 'cantay.351061@ormoc.sti.edu.ph'

function withTestSender(run: () => Promise<void> | void) {
  const names = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'RESEND_TEST_RECIPIENT', 'GMAIL_SENDER_EMAIL', 'GMAIL_APP_PASSWORD', 'GMAIL_ALLOW_PRODUCTION', 'NODE_ENV'] as const
  const before = Object.fromEntries(names.map(name => [name, process.env[name]]))
  process.env.RESEND_API_KEY = 'test-key'
  process.env.RESEND_FROM_EMAIL = 'onboarding@resend.dev'
  process.env.RESEND_TEST_RECIPIENT = recipient
  delete process.env.GMAIL_SENDER_EMAIL
  delete process.env.GMAIL_APP_PASSWORD
  delete process.env.GMAIL_ALLOW_PRODUCTION
  delete process.env.NODE_ENV
  return Promise.resolve().then(run).finally(() => {
    for (const name of names) {
      if (before[name] === undefined) delete process.env[name]
      else process.env[name] = before[name]
    }
  })
}

test('Gmail sender can target each school Outlook address and requires production opt-in', () => withTestSender(() => {
  process.env.GMAIL_SENDER_EMAIL = 'library-demo@gmail.com'
  process.env.GMAIL_APP_PASSWORD = 'abcd efgh ijkl mnop'
  const first = requireVerificationSender(recipient)
  assert.equal(first.provider, 'gmail')
  if (first.provider === 'gmail') assert.equal(first.appPassword, 'abcdefghijklmnop')
  assert.equal(requireVerificationSender('another.student@ormoc.sti.edu.ph').provider, 'gmail')
  process.env.NODE_ENV = 'production'
  assert.throws(() => requireVerificationSender(recipient),
    (error: unknown) => error instanceof HttpError && error.code === 'EMAIL_SENDER_NOT_CONFIGURED')
  process.env.GMAIL_ALLOW_PRODUCTION = 'true'
  assert.equal(requireVerificationSender(recipient).provider, 'gmail')
}))

test('local test sender accepts only the configured Outlook address', () => withTestSender(() => {
  assert.equal(requireVerificationSender(recipient).provider, 'resend')
  assert.throws(() => requireVerificationSender('another.student@ormoc.sti.edu.ph'),
    (error: unknown) => error instanceof HttpError && error.code === 'EMAIL_TEST_RECIPIENT_ONLY')
  process.env.NODE_ENV = 'production'
  assert.throws(() => requireVerificationSender(recipient),
    (error: unknown) => error instanceof HttpError && error.code === 'EMAIL_SENDER_NOT_CONFIGURED')
}))

test('a verified-domain sender targets each school email entered at registration', () => withTestSender(() => {
  process.env.RESEND_FROM_EMAIL = 'no-reply@library-example.test'
  assert.equal(requireVerificationSender(recipient).provider, 'resend')
  assert.equal(requireVerificationSender('another.student@ormoc.sti.edu.ph').provider, 'resend')
}))

test('registration code is submitted to Resend for the configured Outlook address', () => withTestSender(async () => {
  const originalFetch = globalThis.fetch
  let sent: Record<string, unknown> | undefined
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails')
      sent = JSON.parse(String(options?.body)) as Record<string, unknown>
      return new Response(JSON.stringify({ id: 'test-message' }), { status: 200 })
    }
    await sendSchoolVerificationCode(recipient, '123456')
    assert.equal(sent?.from, 'onboarding@resend.dev')
    assert.deepEqual(sent?.to, [recipient])
    assert.match(String(sent?.text), /123456/)
  } finally { globalThis.fetch = originalFetch }
}))

test('failed email delivery is reported without returning the verification code', () => withTestSender(async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response('Rejected', { status: 403 })
    await assert.rejects(sendSchoolVerificationCode(recipient, '987654'),
      (error: unknown) => error instanceof HttpError && error.code === 'EMAIL_DELIVERY_UNAVAILABLE' && !error.message.includes('987654'))
  } finally { globalThis.fetch = originalFetch }
}))
