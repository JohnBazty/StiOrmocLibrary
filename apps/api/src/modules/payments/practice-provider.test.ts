import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { createLocalPaymentPreview, type Attempt } from './payments.preview.ts'
import { emptyFunds, type FundsLedger } from './money-out.rules.ts'
import type { XenditSandboxConfig } from '../../config/xendit-sandbox.ts'
import { XENDIT_HTTP_STATUS } from './xendit.client.ts'
import { paymentError } from './payments.validation.ts'
import { createHybridPracticeProvider, createPracticeProvider, DEFAULT_PRACTICE_BUSINESS_ID } from './practice-provider.ts'

const student = { accountId: 7, role: 'Student' }
const admin = { accountId: 1, role: 'Librarian' }
const wallet = { number: '09174826315', pin: '4826' }

function previewFixture(
  initialAttempts: Attempt[] = [],
  initialFunds: FundsLedger = emptyFunds(),
  cashCentavos = 2500,
  webhookToken = 'practice_test_webhook_token_1234',
) {
  let attempts = structuredClone(initialAttempts)
  let funds = structuredClone(initialFunds)
  let queue = Promise.resolve<unknown>(undefined)
  const attemptsStore = {
    load: async () => structuredClone(attempts),
    save: async (rows: Attempt[]) => { attempts = structuredClone(rows) },
  }
  const fundsStore = {
    load: async () => structuredClone(funds),
    save: async (value: FundsLedger) => { funds = structuredClone(value) },
  }
  const connection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release() {},
    async execute(sql: string, values: unknown[] = []) {
      if (sql.includes('SELECT a.user_id,a.role')) {
        return [values[0] === 7 ? [{ user_id: 4, role: 'Student' }] : []]
      }
      if (sql.includes('confirmed_counter_cash')) {
        return [[{ cash_centavos: String(cashCentavos) }]]
      }
      if (sql.includes('a.account_status,u.account_status') || sql.includes('FROM accounts')) {
        return [[{ role: 'Librarian', account_status: 'Active', user_status: 'Active' }]]
      }
      if (sql.includes('print_status_history')) return [[]]
      if (sql.includes('FROM users WHERE user_id=ANY')) {
        return [[{ user_id: 4, full_name: 'Student Tester', school_id: '2026-0007' }]]
      }
      return [[{ assessed: '100', paid: '0', adjusted: '0', status: 'Unpaid', accruing: false, job_status: 'Pending' }]]
    },
  }
  const database = { getConnection: async () => connection } as never
  const practice = createPracticeProvider({ attempts: attemptsStore, funds: fundsStore })
  const config: XenditSandboxConfig = {
    enabled: true,
    mode: 'test',
    apiOrigin: 'https://api.xendit.co',
    secretKey: 'xnd_development_practice_test_key',
    webhookToken,
    databaseUrl: 'postgresql://test:test@127.0.0.1:5432/test',
    webhookUrl: null,
    returnUrl: null,
  }
  const preview = createLocalPaymentPreview(config, database, attemptsStore, practice, {
    funds: fundsStore,
    refundsEnabled: true,
    payoutsEnabled: true,
    payoutFeeCentavos: 500,
    defaultBusinessId: DEFAULT_PRACTICE_BUSINESS_ID,
    lock: async <T>(run: () => Promise<T>) => {
      const next = queue.then(run)
      queue = next.catch(() => undefined)
      return next
    },
  })
  return { preview, attemptsStore, fundsStore, practice, attempts: () => attempts, funds: () => funds }
}

test('full practice circulation works end-to-end: pay, add funds, sample bank, withdraw, and refund', async () => {
  const f = previewFixture()

  // 1. Student quotes and completes practice GCash wallet checkout without an external URL.
  const quote = await f.preview.quote(student, { kind: 'Fine', targetId: 1, channelCode: 'GCASH' })
  const active = await f.preview.demoCheckout(student, { quoteId: quote.paymentId, requestKey: randomUUID(), ...wallet })
  assert.equal(active.state, 'Active')
  assert.equal(active.practiceCheckout, true)
  assert.equal(active.checkoutUrl, null)

  const paid = await f.preview.check(student, active.paymentId)
  assert.equal(paid.state, 'Succeeded')
  assert.equal((await f.preview.options(student, { kind: 'Fine', targetId: 1 })).balanceCentavos, 0)

  // 2. Librarian opens Library funds, enables the sample school bank (auto-default), and adds funds.
  const beforeOverview = await f.preview.moneyOut.overview(admin)
  assert.equal(beforeOverview.collections.cashCollectedCentavos, 2500)
  assert.equal(beforeOverview.collections.onlineCollectionsCentavos, 10200)
  assert.equal(beforeOverview.balance?.availableCentavos, 10200)

  const sampleBank = await f.preview.moneyOut.setupSampleBank(admin, { confirmed: true })
  assert.equal(sampleBank.isDefault, true)

  const topUp = await f.preview.moneyOut.practice.draft(admin, {
    direction: 'TopUp',
    amount: '50',
    reason: 'School library operating buffer',
    requestKey: randomUUID(),
    beneficiaryId: sampleBank.id,
    transferReference: 'BDO-REF-10001',
    transferredAt: new Date().toISOString(),
  })
  await f.preview.moneyOut.practice.confirm(admin, topUp.id, {
    confirmed: true,
    verificationNote: 'Verified bank transfer slip',
  })

  const afterTopUp = await f.preview.moneyOut.overview(admin)
  assert.equal(afterTopUp.collections.onlineCollectionsCentavos, 10200)
  assert.equal(afterTopUp.collections.topUpsCentavos, 5000)
  assert.equal(afterTopUp.balance?.availableCentavos, 15200)

  // 3. Librarian withdraws PHP 100.00 (+ PHP 5.00 fee = PHP 105.00 deducted) and recovery reconciles cleanly.
  const withdrawal = await f.preview.moneyOut.draftWithdrawal(admin, {
    amount: '100',
    beneficiaryId: sampleBank.id,
    reason: 'Transfer collections to school bank',
    requestKey: randomUUID(),
  })
  const submittedWithdrawal = await f.preview.moneyOut.submit(admin, withdrawal.id, { confirmed: true })
  assert.equal(submittedWithdrawal.state, 'Succeeded')
  await f.preview.moneyOut.recover()

  const afterWithdrawal = await f.preview.moneyOut.overview(admin)
  assert.equal(afterWithdrawal.balance?.availableCentavos, 4700)
  assert.equal(afterWithdrawal.collections.providerWithdrawalsCentavos, 10500)

  // 4. Student requests a partial refund of PHP 40.00; Librarian approves and confirms.
  const refundOptions = await f.preview.moneyOut.ownerRequestOptions(student, active.paymentId, '40')
  const refundReq = await f.preview.moneyOut.requestRefund(student, active.paymentId, {
    amount: '40',
    reasonCode: 'REQUESTED_BY_CUSTOMER',
    reason: 'Student overpaid and wants partial refund',
    requestKey: randomUUID(),
    expectedTotalCentavos: refundOptions.quote.totalCentavos,
  })
  const refundDraft = await f.preview.moneyOut.draftRefund(admin, active.paymentId, {
    amount: '40',
    decision: 'Restore',
    reasonCode: 'REQUESTED_BY_CUSTOMER',
    reason: 'Student overpaid and wants partial refund',
    requestKey: randomUUID(),
    requestId: refundReq.id,
    requestVersion: refundReq.version,
    verified: true,
    verificationNote: 'Checked payment and fine balance',
  })
  const refunded = await f.preview.moneyOut.submit(admin, refundDraft.id, { confirmed: true })
  assert.equal(refunded.state, 'Succeeded')
  assert.equal((await f.preview.options(student, { kind: 'Fine', targetId: 1 })).balanceCentavos, 4000)
})

test('practice session cancellation transitions Active checkout to Cancelled without paying', async () => {
  const f = previewFixture()
  const quote = await f.preview.quote(student, { kind: 'Fine', targetId: 1, channelCode: 'GCASH' })
  await f.preview.demoCheckout(student, { quoteId: quote.paymentId, requestKey: randomUUID(), ...wallet })
  const cancelled = await f.preview.check(student, quote.paymentId, true)
  assert.equal(cancelled.state, 'Cancelled')
  assert.equal((await f.preview.options(student, { kind: 'Fine', targetId: 1 })).balanceCentavos, 10000)
})

test('practice provider reuses historical businessId and allows TopUp withdrawal before online payments', async () => {
  const historical: Attempt = {
    paymentId: randomUUID(),
    accountId: 9,
    userId: 9,
    kind: 'Printing',
    targetId: 99,
    principalCentavos: 1000,
    feeCentavos: 110,
    totalCentavos: 1110,
    balanceCentavos: 1000,
    channelCode: 'GCASH',
    state: 'Succeeded',
    createdAt: '2026-11-18T00:00:00Z',
    expiresAt: '2026-11-18T00:30:00Z',
    businessId: '6af40b84590478b860f756aa',
    providerSessionId: 'ps-' + 'b'.repeat(24),
  }
  const fWithHistory = previewFixture([historical])
  const quote = await fWithHistory.preview.quote(student, { kind: 'Fine', targetId: 1, channelCode: 'GCASH' })
  await fWithHistory.preview.demoCheckout(student, { quoteId: quote.paymentId, requestKey: randomUUID(), ...wallet })
  assert.equal(fWithHistory.attempts()[1].businessId, '6af40b84590478b860f756aa')

  // Zero online payments yet: TopUp still allows withdrawal using defaultBusinessId
  const fEmpty = previewFixture([])
  const bank = await fEmpty.preview.moneyOut.setupSampleBank(admin, { confirmed: true })
  const topUp = await fEmpty.preview.moneyOut.practice.draft(admin, {
    direction: 'TopUp',
    amount: '100',
    reason: 'Initial library bank funding',
    requestKey: randomUUID(),
    beneficiaryId: bank.id,
    transferReference: 'BDO-INIT-01',
    transferredAt: new Date().toISOString(),
  })
  await fEmpty.preview.moneyOut.practice.confirm(admin, topUp.id, {
    confirmed: true,
    verificationNote: 'Verified deposit record',
  })
  const withdrawal = await fEmpty.preview.moneyOut.draftWithdrawal(admin, {
    amount: '50',
    beneficiaryId: bank.id,
    reason: 'Withdraw from initial bank funding',
    requestKey: randomUUID(),
  })
  const submitted = await fEmpty.preview.moneyOut.submit(admin, withdrawal.id, { confirmed: true })
  assert.equal(submitted.state, 'Succeeded')
})

test('hybrid provider falls back on 401/403/404 and never falls back on 5xx or network timeout', async () => {
  const attempts: Attempt[] = []
  let funds = emptyFunds()
  const attemptsStore = { load: async () => attempts }
  const fundsStore = { load: async () => funds, save: async (next: FundsLedger) => { funds = next } }
  const practice = createPracticeProvider({ attempts: attemptsStore, funds: fundsStore })

  const rejectWithStatus = (status: number) => {
    const err = paymentError('Payment provider is temporarily unavailable.', 'PAYMENT_PROVIDER_UNAVAILABLE', 503) as Error & { [XENDIT_HTTP_STATUS]?: number }
    err[XENDIT_HTTP_STATUS] = status
    return err
  }

  let statusToThrow: number | null = 403
  const xenditStub = {
    createSession: async () => { throw rejectWithStatus(statusToThrow ?? 500) },
    getSession: async () => { throw rejectWithStatus(statusToThrow ?? 500) },
    cancelSession: async () => { throw rejectWithStatus(statusToThrow ?? 500) },
    getPayment: async () => { throw rejectWithStatus(statusToThrow ?? 500) },
    getBalance: async () => { throw rejectWithStatus(statusToThrow ?? 500) },
    createPayout: async () => { throw rejectWithStatus(statusToThrow ?? 500) },
    getPayout: async () => { throw rejectWithStatus(statusToThrow ?? 500) },
    createRefund: async () => { throw rejectWithStatus(statusToThrow ?? 500) },
    getRefund: async () => { throw rejectWithStatus(statusToThrow ?? 500) },
    listRefunds: async () => { throw rejectWithStatus(statusToThrow ?? 500) },
  }

  const hybrid = createHybridPracticeProvider(xenditStub as never, practice, attemptsStore, fundsStore)

  for (const status of [401, 403, 404]) {
    statusToThrow = status
    const session = await hybrid.createSession({ reference_id: 'sti-pay-' + randomUUID() })
    assert.equal(session.practice_checkout, true)
    const balance = await hybrid.getBalance()
    assert.equal(balance.currency, 'PHP')
  }

  for (const status of [500, 502, 429]) {
    statusToThrow = status
    await assert.rejects(hybrid.createSession({ reference_id: 'sti-pay-' + randomUUID() }), { code: 'PAYMENT_PROVIDER_UNAVAILABLE' })
    await assert.rejects(hybrid.getBalance(), { code: 'PAYMENT_PROVIDER_UNAVAILABLE' })
  }

  // Timeout / network error without XENDIT_HTTP_STATUS must never fall back
  xenditStub.getBalance = async () => { throw paymentError('Payment provider is temporarily unavailable.', 'PAYMENT_PROVIDER_UNAVAILABLE', 503) }
  await assert.rejects(hybrid.getBalance(), { code: 'PAYMENT_PROVIDER_UNAVAILABLE' })
})

test('ledger-only practice mode rejects forged webhook tokens while keeping demoCheckout working', async () => {
  const f = previewFixture([], emptyFunds(), 0, '')
  await assert.rejects(
    f.preview.moneyOut.receiveRefund('practice_mode_webhook_token_000000', { event: 'refund.succeeded' }),
    { code: 'PAYMENT_CALLBACK_UNAUTHORIZED', status: 401 },
  )
  await assert.rejects(
    f.preview.moneyOut.receiveRefund('', { event: 'refund.succeeded' }),
    { code: 'PAYMENT_CALLBACK_UNAUTHORIZED', status: 401 },
  )
  const quote = await f.preview.quote(student, { kind: 'Fine', targetId: 1, channelCode: 'GCASH' })
  const active = await f.preview.demoCheckout(student, { quoteId: quote.paymentId, requestKey: randomUUID(), ...wallet })
  assert.equal(active.state, 'Active')
  assert.equal(active.practiceCheckout, true)
})
