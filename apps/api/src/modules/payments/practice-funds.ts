import { randomUUID } from 'node:crypto'
import type { PaymentActor } from './payments.service.ts'
import type { FundsStore } from './money-out.store.ts'
import { amount, inputObject, requestKey, text, type FundsLedger } from './money-out.rules.ts'
import { paymentError, paymentId } from './payments.validation.ts'
import type { Pool } from '../../config/db.js'

const REVIEW_MS = 15 * 60_000
const PRACTICE_WITHDRAWAL_FEE = 500
export type PracticeTransfer = {
  id: string; requestKey: string; actorId: number; direction: 'Withdrawal' | 'TopUp'
  amountCentavos: number; feeCentavos: number; totalCentavos: number; reason: string
  balanceAfterCentavos?: number
  state: 'Draft' | 'Succeeded' | 'Cancelled'; createdAt: string; expiresAt: string
  events: Array<{ at: string; state: PracticeTransfer['state']; actorId: number }>
}
type Attempt = { state: string; totalCentavos: number }
type Dependencies = {
  funds: FundsStore; attempts: { load(): Promise<Attempt[]> }
  admin(actor: PaymentActor): Promise<number>; locked<T>(run: () => Promise<T>): Promise<T>; now?: () => number
  allowWithdrawals?: boolean
}
export async function readCashCollections(database: Pool) {
  const connection = await database.getConnection()
  try {
    const [rows] = await connection.execute<Array<{ cash_centavos: string }>>(`SELECT COALESCE(sum(amount_centavos),0)::text AS cash_centavos FROM (
      SELECT round(amount_received*100)::bigint AS amount_centavos FROM fine_payment_receipts
        WHERE receipt_status='Issued' AND payment_method='Cash' AND COALESCE(to_jsonb(fine_payment_receipts)->>'confirmation_source','Legacy')<>'Xendit'
      UNION ALL
      SELECT round(amount_received*100)::bigint FROM print_payment_receipts
        WHERE receipt_status='Issued' AND payment_method='Cash' AND COALESCE(to_jsonb(print_payment_receipts)->>'confirmation_source','Legacy')<>'Xendit'
    ) confirmed_counter_cash`)
    const value = Number(rows[0]?.cash_centavos)
    sum([value]); return value
  } finally { connection.release() }
}
function sum(values: number[]) {
  const total = values.reduce((result, value) => result + value, 0)
  if (values.some(value => !Number.isSafeInteger(value) || value < 0) || !Number.isSafeInteger(total)) {
    throw paymentError('Library funds need review before another transfer.', 'FUNDS_TOTAL_INVALID', 409)
  }
  return total
}
export function confirmedBankAdditions(ledger: FundsLedger) {
  return sum((ledger.practiceTransfers ?? []).filter(row => row.state === 'Succeeded' && row.direction === 'TopUp').map(row => row.amountCentavos))
}

/** Counter cash and bank additions never become student online collections. */
export function fundsAccounting(attempts: Attempt[], ledger: FundsLedger, cashCentavos: number, exclude?: string, now = Date.now()) {
  const transfers = ledger.practiceTransfers ?? []
  const online = sum(attempts.filter(row => row.state === 'Succeeded').map(row => row.totalCentavos))
  const refunds = sum(ledger.operations.filter(row => row.type === 'Refund' && row.state === 'Succeeded').map(row => row.total))
  const providerWithdrawals = sum(ledger.operations.filter(row => row.type === 'Withdrawal' && row.state === 'Succeeded').map(row => row.total + (row.transferFee ?? 0)))
  const topUps = confirmedBankAdditions(ledger)
  const withdrawals = sum(transfers.filter(row => row.state === 'Succeeded' && row.direction === 'Withdrawal').map(row => row.totalCentavos))
  const reserved = sum([
    ...transfers.filter(row => row.id !== exclude && row.direction === 'Withdrawal' && row.state === 'Draft' && Date.parse(row.expiresAt) > now).map(row => row.totalCentavos),
    ...ledger.operations.filter(row => ['Draft', 'Processing', 'Review'].includes(row.state) && (row.state !== 'Draft' || Date.parse(row.expiresAt) > now)).map(row => row.total + (row.transferFee ?? 0)),
  ])
  const onlineNet = Math.max(0, online - refunds)
  sum([cashCentavos])
  return {
    totalCollectionsCentavos: sum([onlineNet, cashCentavos]), onlineCollectionsCentavos: onlineNet,
    cashCollectedCentavos: cashCentavos, refundedCentavos: refunds, topUpsCentavos: topUps,
    withdrawalsCentavos: sum([providerWithdrawals, withdrawals]), reservedCentavos: reserved,
    providerWithdrawalsCentavos: providerWithdrawals,
    availableCentavos: Math.max(0, sum([online, topUps]) - refunds - providerWithdrawals - withdrawals - reserved),
    withdrawalFeeCentavos: PRACTICE_WITHDRAWAL_FEE,
  }
}

export function publicPracticeTransfer(row: PracticeTransfer, now = Date.now()) {
  const { requestKey: _key, ...visible } = row
  const expired = row.state === 'Draft' && Date.parse(row.expiresAt) <= now
  return { ...visible, state: expired ? 'Cancelled' as const : row.state,
    events: expired ? [...row.events, { at: row.expiresAt, state: 'Cancelled' as const, actorId: 0 }] : row.events,
    reference: (row.direction === 'TopUp' ? 'ADD-' : 'WDR-') + row.id.slice(0, 8).toUpperCase(),
    destination: 'School bank · Practice', practice: true as const }
}

export function createPracticeFunds(deps: Dependencies) {
  const now = deps.now ?? Date.now
  const timestamp = () => new Date(now()).toISOString()
  function change(row: PracticeTransfer, state: PracticeTransfer['state'], actorId: number) {
    row.state = state; row.events.push({ at: timestamp(), state, actorId })
  }
  function expire(ledger: FundsLedger) {
    for (const row of ledger.practiceTransfers ?? []) {
      if (row.state === 'Draft' && Date.parse(row.expiresAt) <= now()) change(row, 'Cancelled', 0)
    }
  }
  return {
    draft(actor: PaymentActor, value: unknown) { return deps.locked(async () => {
      const actorId = await deps.admin(actor), input = inputObject(value, ['direction', 'amount', 'reason', 'requestKey'])
      if (!['Withdrawal', 'TopUp'].includes(String(input.direction))) throw paymentError('Choose Withdraw funds or Add funds.')
      const direction = input.direction as PracticeTransfer['direction'], principal = amount(input.amount)
      if (direction === 'Withdrawal' && !deps.allowWithdrawals) throw paymentError('Withdrawals now use Xendit. Use Withdraw funds instead.', 'USE_XENDIT_WITHDRAWAL', 409)
      const reason = text(input.reason, 'a purpose with at least 10 characters', 10, 500), key = requestKey(input.requestKey)
      const ledger = await deps.funds.load(); expire(ledger)
      ledger.practiceTransfers ??= []
      const previous = ledger.practiceTransfers.find(row => row.requestKey === key)
      if (previous) {
        if (previous.actorId !== actorId || previous.direction !== direction || previous.amountCentavos !== principal || previous.reason !== reason) {
          throw paymentError('This request was already used. Review the saved transfer.', 'FUNDS_RETRY_CONFLICT', 409)
        }
        await deps.funds.save(ledger); return publicPracticeTransfer(previous, now())
      }
      const fee = direction === 'Withdrawal' ? PRACTICE_WITHDRAWAL_FEE : 0
      const attempts = await deps.attempts.load()
      if (direction === 'Withdrawal' && principal + fee > fundsAccounting(attempts, ledger, 0, undefined, now()).availableCentavos) {
        throw paymentError('This amount and fee exceed the available online balance.', 'FUNDS_INSUFFICIENT', 409)
      }
      const row: PracticeTransfer = { id: randomUUID(), requestKey: key, actorId, direction, amountCentavos: principal,
        feeCentavos: fee, totalCentavos: principal + fee, reason, state: 'Draft', createdAt: timestamp(),
        expiresAt: new Date(now() + REVIEW_MS).toISOString(), events: [] }
      row.balanceAfterCentavos = fundsAccounting(attempts, { ...ledger, practiceTransfers: [...ledger.practiceTransfers, { ...row, state: 'Succeeded' }] }, 0, undefined, now()).availableCentavos
      change(row, 'Draft', actorId); ledger.practiceTransfers.push(row); await deps.funds.save(ledger)
      return publicPracticeTransfer(row, now())
    }) },
    confirm(actor: PaymentActor, id: unknown) { return deps.locked(async () => {
      const actorId = await deps.admin(actor), ledger = await deps.funds.load(); expire(ledger)
      const row = ledger.practiceTransfers?.find(row => row.id === paymentId(id))
      if (!row) throw paymentError('This transfer is unavailable.', 'FUNDS_NOT_FOUND', 404)
      if (row.actorId !== actorId) throw paymentError('Only the administrator who reviewed this transfer can confirm it.', 'FUNDS_FORBIDDEN', 403)
      if (row.state === 'Draft') {
        if (row.direction === 'Withdrawal' && !deps.allowWithdrawals) throw paymentError('Cancel this old local review and start a Xendit withdrawal.', 'USE_XENDIT_WITHDRAWAL', 409)
        const attempts = await deps.attempts.load()
        if (row.direction === 'Withdrawal' && row.totalCentavos > fundsAccounting(attempts, ledger, 0, row.id, now()).availableCentavos) {
          throw paymentError('The online balance changed. Cancel this review and choose a lower amount.', 'FUNDS_INSUFFICIENT', 409)
        }
        change(row, 'Succeeded', actorId)
        row.balanceAfterCentavos = fundsAccounting(attempts, ledger, 0, undefined, now()).availableCentavos
      }
      await deps.funds.save(ledger); return publicPracticeTransfer(row, now())
    }) },
    cancel(actor: PaymentActor, id: unknown) { return deps.locked(async () => {
      const actorId = await deps.admin(actor), ledger = await deps.funds.load(); expire(ledger)
      const row = ledger.practiceTransfers?.find(row => row.id === paymentId(id))
      if (!row) throw paymentError('This transfer is unavailable.', 'FUNDS_NOT_FOUND', 404)
      if (row.actorId !== actorId) throw paymentError('Only the administrator who reviewed this transfer can cancel it.', 'FUNDS_FORBIDDEN', 403)
      if (row.state === 'Succeeded') throw paymentError('A completed transfer cannot be cancelled.', 'FUNDS_ALREADY_COMPLETED', 409)
      if (row.state === 'Draft') change(row, 'Cancelled', actorId)
      await deps.funds.save(ledger); return publicPracticeTransfer(row, now())
    }) },
  }
}
