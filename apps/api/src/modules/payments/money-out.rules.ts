import { centavos, paymentError, paymentId } from './payments.validation.ts'
import type { PracticeTransfer } from './practice-funds.ts'

export type MoneyOutState = 'Draft' | 'Processing' | 'Succeeded' | 'Failed' | 'Review' | 'Cancelled' | 'Reversed'
export type ChargeDecision = 'Restore' | 'Cancel'
export type MoneyOut = {
  id: string; type: 'Refund' | 'Withdrawal'; state: MoneyOutState; actorId: number; requestKey: string
  paymentId?: string; accountId?: number; userId?: number; kind?: 'Fine' | 'Printing' | 'LostBook'; targetId?: number
  principal: number; fee: number; total: number; appliedPrincipal: number; decision?: ChargeDecision
  rail: 'Native' | 'Transfer'; beneficiaryId?: string; destination?: Record<string, any>
  reason: string; createdAt: string; expiresAt: string; providerId?: string; businessId: string; transferFee?: number
  providerPaymentId?: string; providerState?: string; payload?: Record<string, any>; submittedAt?: string; checkedAt?: string
  events: Array<{ at: string; state: MoneyOutState; actorId: number; code: string }>
}
export type Beneficiary = {
  id: string; type: 'SchoolBank' | 'StudentRefund'; accountId?: number; label: string
  recipient: Record<string, any>; verifiedBy: number; verifiedAt: string; evidence: string; active: boolean
  isSample?: boolean
}
export type VoidAdjustment = { id: string; paymentId?: string; accountId: number; userId: number; kind: 'Fine'; targetId: number; amount: number; actorId: number; reason: string; createdAt: string }
export type FundsLedger = { version: 1; operations: MoneyOut[]; beneficiaries: Beneficiary[]; voids: VoidAdjustment[];
  practiceTransfers?: PracticeTransfer[];
  transferFee?: { centavos:number; reference:string; actorId:number; confirmedAt:string; isSample?:boolean };
  feeHistory?: Array<{centavos:number;reference:string;actorId:number;confirmedAt:string;isSample?:boolean}> }
export const emptyFunds = (): FundsLedger => ({ version: 1, operations: [], beneficiaries: [], voids: [] })
export const reserves = (row: MoneyOut) => ['Draft', 'Processing', 'Review', 'Succeeded'].includes(row.state)
export const confirmed = (row: MoneyOut) => row.state === 'Succeeded'

export function inputObject(value: unknown, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw paymentError('Review the details and try again.')
  return value as Record<string, unknown>
}
export function text(value: unknown, label: string, min = 2, max = 200) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max || /[\x00-\x1f]/.test(value)) throw paymentError(`Enter ${label}.`)
  return value.trim()
}
export function requestKey(value: unknown) { return paymentId(value) }
export function amount(value: unknown) { return Number(centavos(value)) }

/** Cumulative rounding prevents repeated partial refunds from losing or inventing centavos. */
export function refundAmounts(principal: number, fee: number, applied: number, previous: MoneyOut[], requested: number) {
  const held = previous.filter(reserves), returned = held.reduce((sum, row) => sum + row.principal, 0)
  if (!Number.isSafeInteger(requested) || requested <= 0 || requested > principal - returned) throw paymentError('Choose an amount within the remaining refundable payment.')
  const priorFee = held.reduce((sum, row) => sum + row.fee, 0)
  const cumulativeFee = Number((BigInt(returned + requested) * BigInt(fee) + BigInt(principal) / 2n) / BigInt(principal))
  const refundFee = cumulativeFee - priorFee
  const unappliedLeft = Math.max(0, principal - applied - held.reduce((sum, row) => sum + row.principal - row.appliedPrincipal, 0))
  return { principal: requested, fee: refundFee, total: requested + refundFee, appliedPrincipal: Math.max(0, requested - unappliedLeft) }
}

export function moneyOutPublic(row: MoneyOut) {
  return { id: row.id, type: row.type, state: row.state, paymentId: row.paymentId, principalCentavos: row.principal,
    feeCentavos: row.fee, totalCentavos: row.total, appliedPrincipalCentavos: row.appliedPrincipal, decision: row.decision,
    rail: row.rail, reason: row.reason, createdAt: row.createdAt, expiresAt: row.expiresAt,
    providerState: row.providerState, providerReference: row.providerId, checkedAt: row.checkedAt,
    destination: row.destination ? maskedDestination(row.destination) : null,
    reference: (row.type === 'Refund' ? 'REF-' : 'WDR-') + row.id.slice(0, 8).toUpperCase(), events: row.events.map(({at,state,code})=>({at,state,code})) }
}
export function maskedDestination(recipient: Record<string, any>) {
  const details = recipient.account_details
  return { name: details.account_holder_name, account: '•••• ' + details.account_number.slice(-4), bank: details.routing_value_1 }
}
