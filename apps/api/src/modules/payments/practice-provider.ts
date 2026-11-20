import { randomBytes, randomUUID } from 'node:crypto'
import type { Attempt } from './payments.preview.ts'
import { confirmed, type FundsLedger, type MoneyOut } from './money-out.rules.ts'
import type { FundsStore } from './money-out.store.ts'
import { confirmedBankAdditions } from './practice-funds.ts'
import { paymentError } from './payments.validation.ts'
import { paymentReference, XENDIT_HTTP_STATUS, type createXenditClient, type ProviderObject } from './xendit.client.ts'

export const DEFAULT_PRACTICE_BUSINESS_ID = 'practice-sti-ormoc-library'

type PracticeProviderDeps = {
  attempts: { load(): Promise<Attempt[]> }
  funds: Pick<FundsStore, 'load'>
}

type ProviderClient = ReturnType<typeof createXenditClient>

/**
 * Ledger-backed Xendit practice stand-in for local dev and hosted sandbox environments
 * where Xendit keys are omitted or lack Money-out / Balance / Sessions permissions.
 * Never makes outbound network calls and never touches live school accounting tables.
 */
export function createPracticeProvider(deps: PracticeProviderDeps): ProviderClient {
  const cancelledSessions = new Set<string>()

  async function resolveBusinessId() {
    const rows = await deps.attempts.load()
    const existing = rows.find(row => row.state === 'Succeeded' && row.businessId)?.businessId
    return existing || DEFAULT_PRACTICE_BUSINESS_ID
  }

  function refundObject(op: MoneyOut, original: Attempt | undefined, refundId: string): ProviderObject {
    return {
      refund_id: refundId,
      business_id: op.businessId,
      reference_id: 'sti-out-' + op.id,
      payment_id: op.providerPaymentId,
      currency: 'PHP',
      channel_code: original?.channelCode ?? 'GCASH',
      amount: Number((op.total / 100).toFixed(2)),
      status: op.providerState ?? 'SUCCEEDED',
      is_live: false,
      practice_provider: true,
    }
  }

  return {
    async createSession(body: ProviderObject) {
      return {
        ...body,
        payment_session_id: 'ps-' + randomBytes(12).toString('hex'),
        business_id: await resolveBusinessId(),
        status: 'ACTIVE',
        is_live: false,
        practice_checkout: true,
      }
    },

    async cancelSession(id: string) {
      if (cancelledSessions.size >= 1000) cancelledSessions.clear()
      cancelledSessions.add(id)
      return { payment_session_id: id, status: 'CANCELED' }
    },

    async getSession(id: string) {
      const rows = await deps.attempts.load()
      const row = rows.find(item => item.providerSessionId === id)
      if (!row) throw paymentError('Payment provider is temporarily unavailable.', 'PAYMENT_PROVIDER_UNAVAILABLE', 503)
      const status = cancelledSessions.has(id) || row.state === 'Cancelled'
        ? 'CANCELED'
        : row.state === 'Expired' || (row.state !== 'Succeeded' && Date.parse(row.expiresAt) <= Date.now())
          ? 'EXPIRED'
          : 'COMPLETED'
      return {
        payment_session_id: id,
        business_id: row.businessId ?? await resolveBusinessId(),
        reference_id: paymentReference(row.paymentId),
        currency: 'PHP',
        country: 'PH',
        session_type: 'PAY',
        mode: 'PAYMENT_LINK',
        capture_method: 'AUTOMATIC',
        amount: Number((row.totalCentavos / 100).toFixed(2)),
        allowed_payment_channels: [row.channelCode],
        metadata: { environment: 'test', library_payment_id: row.paymentId },
        is_live: false,
        status,
        ...(status === 'COMPLETED'
          ? {
              payment_id: row.providerPaymentId ?? ('py-practice-' + row.paymentId),
              payment_request_id: 'pr-practice-' + row.paymentId,
            }
          : {}),
      }
    },

    async getPayment(id: string) {
      const rows = await deps.attempts.load()
      const row = rows.find(item => item.providerPaymentId === id || ('py-practice-' + item.paymentId) === id)
      if (!row) throw paymentError('Payment provider is temporarily unavailable.', 'PAYMENT_PROVIDER_UNAVAILABLE', 503)
      const pesoAmount = Number((row.totalCentavos / 100).toFixed(2))
      return {
        payment_id: id,
        business_id: row.businessId ?? await resolveBusinessId(),
        payment_request_id: 'pr-practice-' + row.paymentId,
        type: 'PAY',
        country: 'PH',
        currency: 'PHP',
        status: 'SUCCEEDED',
        capture_method: 'AUTOMATIC',
        channel_code: row.channelCode,
        request_amount: pesoAmount,
        is_live: false,
        captures: [{ capture_id: 'cap-practice-' + row.paymentId, capture_amount: pesoAmount }],
      }
    },

    async getBalance() {
      const [rows, ledger] = await Promise.all([deps.attempts.load(), deps.funds.load()])
      const collected = rows.filter(row => row.state === 'Succeeded').reduce((sum, row) => sum + row.totalCentavos, 0)
      const additions = confirmedBankAdditions(ledger)
      const spent = ledger.operations.filter(confirmed).reduce((sum, row) => sum + row.total + (row.transferFee ?? 0), 0)
      const legacyWithdrawals = (ledger.practiceTransfers ?? [])
        .filter(row => row.state === 'Succeeded' && row.direction === 'Withdrawal')
        .reduce((sum, row) => sum + row.totalCentavos, 0)
      const availableCentavos = Math.max(0, collected + additions - spent - legacyWithdrawals)
      return { balance: Number((availableCentavos / 100).toFixed(2)), currency: 'PHP' }
    },

    async createPayout(body: ProviderObject, _key: string) {
      const ledger = await deps.funds.load()
      const op = ledger.operations.find(item => 'sti-out-' + item.id === body.reference_id)
      const businessId = op?.businessId ?? await resolveBusinessId()
      return {
        payout_id: 'po-' + randomUUID(),
        business_id: businessId,
        reference_id: body.reference_id,
        is_live: false,
        practice_provider: true,
        source_currency: 'PHP',
        destination_currency: 'PHP',
        source_amount: body.payout_details.source_amount,
        destination_amount: body.payout_details.source_amount,
        recipient: body.recipient,
        purpose_code: body.purpose_code,
        status: 'SUCCEEDED',
      }
    },

    async getPayout(id: string) {
      const ledger = await deps.funds.load()
      const op = ledger.operations.find(item => item.providerId === id)
      if (!op) throw paymentError('Payment provider is temporarily unavailable.', 'PAYMENT_PROVIDER_UNAVAILABLE', 503)
      return {
        payout_id: id,
        business_id: op.businessId,
        reference_id: 'sti-out-' + op.id,
        is_live: false,
        practice_provider: true,
        source_currency: 'PHP',
        destination_currency: 'PHP',
        source_amount: op.total,
        destination_amount: op.total,
        recipient: op.destination,
        purpose_code: op.type === 'Refund' ? 'REFUND' : 'SELF',
        status: op.providerState ?? 'SUCCEEDED',
      }
    },

    async createRefund(body: ProviderObject) {
      const [rows, ledger] = await Promise.all([deps.attempts.load(), deps.funds.load()])
      const op = ledger.operations.find(item => 'sti-out-' + item.id === body.reference_id)
      const original = op?.paymentId
        ? rows.find(item => item.paymentId === op.paymentId)
        : rows.find(item => item.providerPaymentId === body.payment_id)
      return {
        refund_id: 'rfd-' + randomUUID(),
        business_id: op?.businessId ?? original?.businessId ?? await resolveBusinessId(),
        reference_id: body.reference_id,
        payment_id: body.payment_id,
        currency: 'PHP',
        channel_code: original?.channelCode ?? 'GCASH',
        amount: body.amount,
        status: 'SUCCEEDED',
        is_live: false,
        practice_provider: true,
      }
    },

    async getRefund(id: string) {
      const [rows, ledger] = await Promise.all([deps.attempts.load(), deps.funds.load()])
      const op = ledger.operations.find(item => item.providerId === id)
      if (!op) throw paymentError('Payment provider is temporarily unavailable.', 'PAYMENT_PROVIDER_UNAVAILABLE', 503)
      const original = op.paymentId ? rows.find(item => item.paymentId === op.paymentId) : undefined
      return refundObject(op, original, id)
    },

    async listRefunds(providerPaymentId: string) {
      const [rows, ledger] = await Promise.all([deps.attempts.load(), deps.funds.load()])
      return ledger.operations
        .filter(op => op.type === 'Refund' && op.rail === 'Native' && op.providerPaymentId === providerPaymentId && op.providerId)
        .map(op => {
          const original = op.paymentId ? rows.find(item => item.paymentId === op.paymentId) : undefined
          return refundObject(op, original, op.providerId!)
        })
    },
  }
}

export function isCapabilityRejection(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const status = (error as Record<symbol, unknown>)[XENDIT_HTTP_STATUS]
  return status === 401 || status === 403 || status === 404
}

/**
 * Tries real Xendit sandbox endpoints first; falls back to the ledger-backed practice
 * provider ONLY when Xendit returns an explicit 401/403/404 permission or endpoint rejection.
 * Never falls back on 5xx, rate-limits (429), or network timeouts.
 */
export function createHybridPracticeProvider(
  xendit: ProviderClient,
  practice: ProviderClient,
  attemptsStore: { load(): Promise<Attempt[]> },
  fundsStore?: Pick<FundsStore, 'load'>,
): ProviderClient {
  async function withFallback<T>(callXendit: () => Promise<T>, callPractice: () => Promise<T>): Promise<T> {
    try {
      return await callXendit()
    } catch (error) {
      if (isCapabilityRejection(error)) return callPractice()
      throw error
    }
  }

  return {
    createSession: body => withFallback(() => xendit.createSession(body), () => practice.createSession(body)),

    async getSession(id: string) {
      const row = (await attemptsStore.load()).find(item => item.providerSessionId === id)
      if (row?.practiceCheckout) return practice.getSession(id)
      return xendit.getSession(id)
    },

    async cancelSession(id: string) {
      const row = (await attemptsStore.load()).find(item => item.providerSessionId === id)
      if (row?.practiceCheckout) return practice.cancelSession(id)
      return xendit.cancelSession(id)
    },

    async getPayment(id: string) {
      if (id.startsWith('py-practice-')) return practice.getPayment(id)
      const row = (await attemptsStore.load()).find(item => item.providerPaymentId === id)
      if (row?.practiceCheckout) return practice.getPayment(id)
      return xendit.getPayment(id)
    },

    getBalance: () => withFallback(() => xendit.getBalance(), () => practice.getBalance()),

    createPayout: (body, key) => withFallback(() => xendit.createPayout(body, key), () => practice.createPayout(body, key)),

    async getPayout(id: string) {
      if (fundsStore) {
        const ledger = await fundsStore.load()
        const op = ledger.operations.find(item => item.providerId === id)
        if (op?.practiceProvider) return practice.getPayout(id)
      }
      return xendit.getPayout(id)
    },

    async createRefund(body: ProviderObject) {
      const paymentId = String(body.payment_id ?? '')
      if (paymentId.startsWith('py-practice-')) return practice.createRefund(body)
      const row = (await attemptsStore.load()).find(item => item.providerPaymentId === paymentId)
      if (row?.practiceCheckout) return practice.createRefund(body)
      return withFallback(() => xendit.createRefund(body), () => practice.createRefund(body))
    },

    async getRefund(id: string) {
      if (fundsStore) {
        const ledger = await fundsStore.load()
        const op = ledger.operations.find(item => item.providerId === id)
        if (op?.practiceProvider) return practice.getRefund(id)
      }
      return xendit.getRefund(id)
    },

    async listRefunds(paymentId: string) {
      if (paymentId.startsWith('py-practice-')) return practice.listRefunds(paymentId)
      const row = (await attemptsStore.load()).find(item => item.providerPaymentId === paymentId)
      if (row?.practiceCheckout) return practice.listRefunds(paymentId)
      return withFallback(() => xendit.listRefunds(paymentId), () => practice.listRefunds(paymentId))
    },
  }
}
