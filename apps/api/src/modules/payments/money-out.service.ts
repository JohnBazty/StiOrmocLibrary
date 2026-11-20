import { randomUUID } from 'node:crypto'
import type { Pool } from '../../config/db.js'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import type { PaymentActor } from './payments.service.ts'
import { createPaymentsRepository } from './payments.repository.ts'
import { paymentError, paymentId, positiveId, centavos } from './payments.validation.ts'
import { authenticateCallback, verifyCapturedPayment, verifySession, type createXenditClient } from './xendit.client.ts'
import { amount, confirmed, inputObject, maskedDestination, moneyOutPublic, refundAmounts, refundReasons, requestKey, reserves, text,
  type Beneficiary, type FundsLedger, type MoneyOut, type RefundReason } from './money-out.rules.ts'
import type { FundsStore } from './money-out.store.ts'
import type { PreviewCredit } from './preview-balances.ts'
import { confirmedBankAdditions, createPracticeFunds, fundsAccounting, publicPracticeTransfer, readCashCollections } from './practice-funds.ts'
import type { PrintingPaymentView } from '../printing/printing-payment-view.ts'
import { requestPublic, requestStatus, type RefundRequest } from './refund-request.rules.ts'
import { schoolBanks } from './school-banks.ts'

export type LocalAttempt = {
  paymentId: string; accountId: number; userId: number; kind: 'Fine' | 'Printing' | 'LostBook' | 'Other'; targetId: number
  principalCentavos: number; feeCentavos: number; totalCentavos: number; balanceCentavos: number; channelCode: string
  state: string; createdAt: string; providerSessionId?: string; businessId?: string; appliedPrincipalCentavos?: number
  capturedAt?: string
}
type Dependencies = {
  database: Pool; funds: FundsStore; attempts: { load(): Promise<LocalAttempt[]> }
  provider: ReturnType<typeof createXenditClient>; locked<T>(run: () => Promise<T>): Promise<T>
  refundsEnabled: boolean; payoutsEnabled: boolean; payoutFeeCentavos: number | null
  callbackToken?: string; defaultBusinessId?: string
}

/** Freeze legacy allocation order. Excess captures are refundable but never credited to a bill twice. */
export function appliedAmounts(rows: LocalAttempt[]) {
  const result = new Map<string, number>(), balances = new Map<string, number>()
  for (const row of rows.filter(row => row.state === 'Succeeded').sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.paymentId.localeCompare(b.paymentId))) {
    const key = `${row.accountId}:${row.userId}:${row.kind}:${row.targetId}`
    const remaining = Math.min(balances.get(key) ?? row.balanceCentavos, row.balanceCentavos)
    const applied = row.appliedPrincipalCentavos ?? Math.min(remaining, row.principalCentavos)
    result.set(row.paymentId, applied); balances.set(key, Math.max(0, remaining - applied))
  }
  return result
}
export function netCredits(rows: LocalAttempt[], ledger: FundsLedger, accountId: number, userId: number): PreviewCredit[] {
  const applied = appliedAmounts(rows)
  const credits: PreviewCredit[] = rows.filter(row => row.accountId === accountId && row.userId === userId && row.state === 'Succeeded').flatMap(row => {
    const refunds = ledger.operations.filter(operation => operation.paymentId === row.paymentId && confirmed(operation))
    const returned = refunds.reduce((sum, operation) => sum + operation.appliedPrincipal, 0)
    const cancelled = refunds.filter(operation => operation.decision === 'Cancel').reduce((sum, operation) => sum + operation.appliedPrincipal, 0)
    return [{ kind: row.kind, targetId: row.targetId, principalCentavos: Math.max(0, (applied.get(row.paymentId) ?? 0) - returned), paymentId: row.paymentId },
      ...(cancelled ? [{ kind: row.kind, targetId: row.targetId, principalCentavos: cancelled, paymentId: row.paymentId, voided: true }] : [])]
  })
  return [...credits, ...ledger.voids.filter(row => row.accountId === accountId && row.userId === userId).map(row => ({ kind: row.kind, targetId: row.targetId, principalCentavos: row.amount, paymentId: row.paymentId ?? row.id, voided: true }))]
}

export function createLocalMoneyOut(deps: Dependencies) {
  const { database, funds, provider, locked } = deps
  const transferFee = (ledger:FundsLedger) => ledger.transferFee?.centavos ?? deps.payoutFeeCentavos
  async function admin(actor: PaymentActor) {
    if (actor.role !== 'Librarian') throw paymentError('Only Librarian/Admin can manage refunds and library funds.', 'MONEY_OUT_FORBIDDEN', 403)
    const q = await database.getConnection()
    try { await requireLibraryActor(q, positiveId(actor.accountId), 'library.manage') } finally { q.release() }
    return positiveId(actor.accountId)
  }
  const practice = createPracticeFunds({ funds, attempts: deps.attempts, locked, admin })
  const event = (row: MoneyOut, state: MoneyOut['state'], code: string, actorId: number) => {
    row.state = state; row.events.push({ at: new Date().toISOString(), state, code, actorId })
  }
  async function payment(id: unknown) {
    const row = (await deps.attempts.load()).find(row => row.paymentId === paymentId(id))
    if (!row || row.state !== 'Succeeded' || !row.providerSessionId || !row.businessId) throw paymentError('Choose a confirmed online payment.', 'REFUND_PAYMENT_UNAVAILABLE', 409)
    return row
  }
  async function bill<T>(row: LocalAttempt, run: (charge: Record<string, any>) => Promise<T>, printing = false) {
    const q = await database.getConnection()
    try {
      await q.beginTransaction()
      const charge = await createPaymentsRepository(q).charge(row, row.userId)
      if (!charge) throw paymentError('The original bill is unavailable.', 'REFUND_BILL_UNAVAILABLE', 409)
      if (printing && row.kind === 'Printing') {
        const [history] = await q.execute<any[]>(`SELECT 1 FROM print_status_history WHERE request_id=? AND (from_status IN ('Printing','Ready for Pickup','Completed') OR to_status IN ('Printing','Ready for Pickup','Completed')) LIMIT 1`, [row.targetId])
        if (history.length || !['Pending', 'Cancelled'].includes(charge.job_status)) throw paymentError('This job has already started printing. It cannot be refunded.', 'PRINT_REFUND_BLOCKED', 409)
      }
      const result = await run(charge)
      await q.commit(); return result
    } catch (error) { await q.rollback(); throw error } finally { q.release() }
  }
  async function refundEligible(original:LocalAttempt){
    try{return await bill(original,async()=>true,true)}catch(error){
      if(['PRINT_REFUND_BLOCKED','REFUND_BILL_UNAVAILABLE'].includes(String((error as {code?:string}).code)))return false
      throw error
    }
  }
  function matches(row: MoneyOut, response: Record<string, any>, original?: LocalAttempt) {
    if (response.is_live === true || response.business_id !== row.businessId || response.reference_id !== 'sti-out-' + row.id) throw paymentError('Provider confirmation needs review.', 'MONEY_OUT_EVIDENCE_MISMATCH', 409)
    if (row.rail === 'Native') {
      if (!/^rfd-[a-f\d-]{36}$/i.test(response.refund_id) || (row.providerId && response.refund_id !== row.providerId)
        || response.payment_id !== row.providerPaymentId || response.currency !== 'PHP' || response.channel_code !== original?.channelCode
        || Number(centavos(response.amount)) !== row.total || !['PENDING','SUCCEEDED','FAILED'].includes(response.status)) throw paymentError('Refund confirmation needs review.', 'MONEY_OUT_EVIDENCE_MISMATCH', 409)
      row.providerId = response.refund_id
    } else {
      const expected = row.destination!.account_details, actual = response.recipient?.account_details
      if (!/^po-[a-f\d-]{36}$/i.test(response.payout_id) || (row.providerId && response.payout_id !== row.providerId)
        || response.source_currency !== 'PHP' || response.destination_currency !== 'PHP' || (response.source_amount !== undefined && response.source_amount !== row.total)
        || response.destination_amount !== row.total || !actual || ['currency','account_country','account_number','account_holder_name','routing_type_1','routing_value_1'].some(key => actual[key] !== expected[key])
        || response.purpose_code !== (row.type === 'Refund' ? 'REFUND' : 'SELF')
        || !['ACCEPTED','PENDING_COMPLIANCE_ASSESSMENT','REJECTED','ROUTING','REQUESTED','READY','LOCKED','EXPIRED','FAILED','SUCCEEDED','CANCELLED','REVERSED'].includes(response.status)) throw paymentError('Transfer confirmation needs review.', 'MONEY_OUT_EVIDENCE_MISMATCH', 409)
      row.providerId = response.payout_id
    }
    if (response.practice_provider === true) row.practiceProvider = true
    row.providerState = response.status; row.checkedAt = new Date().toISOString()
    const state = response.status === 'SUCCEEDED' ? 'Succeeded' : response.status === 'REVERSED' ? 'Reversed'
      : ['FAILED','REJECTED','EXPIRED','CANCELLED'].includes(response.status) ? 'Failed' : 'Processing'
    // A previously final success cannot disappear, except for an explicit payout reversal.
    if (row.state === 'Succeeded' && !['Succeeded','Reversed'].includes(state)) throw paymentError('Transfer history needs review.', 'MONEY_OUT_EVIDENCE_MISMATCH', 409)
    if (row.state === 'Reversed' && state !== 'Reversed') throw paymentError('Transfer history needs review.', 'MONEY_OUT_EVIDENCE_MISMATCH', 409)
    if (row.state !== state || row.events.at(-1)?.code !== response.status) event(row, state, response.status, 0)
  }
  async function verifiedCapture(original: LocalAttempt) {
    const session = await provider.getSession(original.providerSessionId!)
    const evidence = { payment_id: original.paymentId, total_centavos: original.totalCentavos, channel_code: original.channelCode, provider_session_id: original.providerSessionId, provider_business_id: original.businessId }
    verifySession(session, evidence)
    if (session.status !== 'COMPLETED' || !session.payment_id) throw paymentError('The original payment is not confirmed.')
    verifyCapturedPayment(await provider.getPayment(session.payment_id), session, evidence)
    return session.payment_id as string
  }
  async function providerBalance() {
    const value = await provider.getBalance()
    if (!Number.isFinite(value.balance) || value.balance < 0 || (value.currency && value.currency !== 'PHP')) throw paymentError('The provider balance needs review.')
    return value.balance === 0 ? 0 : Number(centavos(value.balance))
  }
  async function available(ledger: FundsLedger, exclude?: string, collectionCap = true) {
    const balance = await providerBalance()
    const reserved = ledger.operations.filter(row => row.id !== exclude && ['Draft','Processing','Review'].includes(row.state)
      && (row.state !== 'Draft' || Date.parse(row.expiresAt) > Date.now())).reduce((sum, row) => sum + row.total + (row.transferFee ?? 0), 0)
    const collected = (await deps.attempts.load()).filter(row => row.state === 'Succeeded').reduce((sum, row) => sum + row.totalCentavos, 0)
    const spent = ledger.operations.filter(confirmed).reduce((sum, row) => sum + row.total + (row.transferFee ?? 0), 0)
    const additions = confirmedBankAdditions(ledger)
    const eligible = Math.max(0, collected + additions - spent - reserved)
    return { providerBalanceCentavos: balance, reservedCentavos: reserved, eligibleFundsCentavos: eligible, bankAdditionsCentavos: additions,
      availableCentavos: collectionCap ? Math.min(eligible, Math.max(0, balance - reserved)) : Math.max(0, balance - reserved) }
  }
  async function recoverOne(row: MoneyOut, ledger: FundsLedger) {
    if (!row.submittedAt || ['Draft','Cancelled','Failed','Reversed'].includes(row.state)) return
    try {
      const original = row.paymentId ? await payment(row.paymentId) : undefined
      let response
      if (row.providerId) response = row.rail === 'Native' ? await provider.getRefund(row.providerId) : await provider.getPayout(row.providerId)
      else if (row.rail === 'Native') {
        const results = await provider.listRefunds(row.providerPaymentId!)
        const matching = (results as unknown as Record<string, any>[]).filter(item => item.reference_id === 'sti-out-' + row.id)
        if (matching.length !== 1) throw paymentError('Check the refund reference in Xendit before trying again.')
        response = matching[0]
      } else throw paymentError('Enter the Xendit transfer reference to check this request. Do not send another transfer.')
      matches(row, response, original)
    } catch {
      row.checkedAt = new Date().toISOString()
      if (!['Succeeded','Reversed'].includes(row.state) && (row.state !== 'Review' || row.events.at(-1)?.code !== 'CONFIRMATION_REQUIRED')) event(row, 'Review', 'CONFIRMATION_REQUIRED', 0)
    }
    await funds.save(ledger)
  }
  function expireDrafts(ledger: FundsLedger) {
    for (const row of ledger.operations) if (row.state === 'Draft' && Date.parse(row.expiresAt) <= Date.now()) event(row, 'Cancelled', 'REVIEW_EXPIRED', 0)
  }
  function stateFor(original: LocalAttempt, ledger: FundsLedger) {
    const related = ledger.operations.filter(row => row.paymentId === original.paymentId)
    const returned = related.filter(confirmed).reduce((sum, row) => sum + row.principal, 0)
    const held = related.filter(reserves).reduce((sum, row) => sum + row.principal, 0)
    const pending = related.filter(row => ['Draft','Processing','Review'].includes(row.state))
    return { refunds: related.map(moneyOutPublic), refundedCentavos: returned,
      refundReview: pending.length > 0,
      refundStatus: pending.some(row=>row.state==='Review')?'Refund needs review':pending.some(row=>row.state==='Processing')?'Refund processing':pending.length?'Refund review':returned === original.principalCentavos ? 'Refunded' : returned > 0 ? 'Partially refunded' : null,
      refundableCentavos: Math.max(0, original.principalCentavos - held) }
  }
  function requestRows(ledger: FundsLedger, original: LocalAttempt) {
    return (ledger.refundRequests ?? []).filter(row => row.paymentId === original.paymentId)
  }
  async function requestOptions(original: LocalAttempt, ledger: FundsLedger) {
    const state = stateFor(original, ledger)
    const requests = requestRows(ledger, original)
    const pending = requests.some(row => row.state === 'PendingReview' || row.state === 'Approved' && ledger.operations.some(op => op.id === row.operationId && ['Draft','Processing','Review'].includes(op.state)))
    const captured = Date.parse(original.capturedAt ?? original.createdAt)
    const reason = original.state !== 'Succeeded' ? 'Wait until this payment is confirmed before requesting a refund.'
      : original.channelCode !== 'GCASH' ? 'Refund requests are available for GCash payments only.'
      : !Number.isFinite(captured) || Date.now() - captured >= 180 * 86_400_000 ? 'The refund window has ended.'
      : pending || state.refundReview ? 'A refund request is already in progress.'
      : state.refundableCentavos <= 0 ? 'This payment has already been refunded.'
      : !await refundEligible(original) ? 'Printing has already started or the original bill is unavailable.' : null
    return { ...state, refundRequestAllowed: reason === null, refundRequestReason: reason,
      refundRequests: requests.map(row => requestPublic(row, ledger.operations.find(op => op.id === row.operationId))) }
  }
  async function ownedPayment(actor: PaymentActor, id: unknown, allowLibrary = false) {
    if (allowLibrary && actor.role === 'Librarian') { await admin(actor); return payment(id) }
    if (!['Student','Faculty'].includes(String(actor.role))) throw paymentError('Use your own borrower account.', 'REFUND_REQUEST_FORBIDDEN', 403)
    const accountId = positiveId(actor.accountId), q = await database.getConnection()
    let owner
    try { owner = await createPaymentsRepository(q).owner(accountId) } finally { q.release() }
    if (!owner || owner.role !== actor.role) throw paymentError('Sign in again.', 'REFUND_REQUEST_FORBIDDEN', 403)
    const original = (await deps.attempts.load()).find(row => row.paymentId === paymentId(id) && row.accountId === accountId && row.userId === Number(owner.user_id))
    if (!original) throw paymentError('This payment is unavailable.', 'PAYMENT_NOT_FOUND', 404)
    if (original.state !== 'Succeeded' || !original.providerSessionId || !original.businessId) throw paymentError('Choose a confirmed online payment.', 'REFUND_PAYMENT_UNAVAILABLE', 409)
    return original
  }
  function requestChange(row: RefundRequest, state: RefundRequest['state'], actorId: number, note?: string) {
    row.state = state; row.version++; row.updatedAt = new Date().toISOString()
    row.events.push({ at: row.updatedAt, state, actorId, ...(note ? { note } : {}) })
  }
  async function flushRequestNotices(ledger: FundsLedger) {
    for (const row of (ledger.refundRequests ?? []).filter(row => row.notified !== requestStatus(row, ledger.operations.find(op => op.id === row.operationId))).slice(0, 10)) {
      const status = requestStatus(row, ledger.operations.find(op => op.id === row.operationId))
      const q = await database.getConnection()
      try {
        await q.execute(`INSERT INTO notifications(user_id,message_title,message_body,trigger_type,action_path,priority,dedupe_key,scheduled_for,delivered_at)
          SELECT ?, 'Refund request update', ?, 'System', CASE WHEN role='Faculty' THEN '/faculty/transactions' ELSE '/student/transactions' END,
          'Normal', ?, NOW(), NOW() FROM accounts WHERE account_id=? AND user_id=?
          ON CONFLICT (user_id,dedupe_key) DO NOTHING`, [row.userId, `Your refund request ${'RR-' + row.id.slice(0,8).toUpperCase()}: ${status}. Open Transactions for details.`, `refund-request:${row.id}:${status}`, row.accountId, row.userId])
        row.notified = status; await funds.save(ledger)
      } catch { /* Saved request remains authoritative; the existing recovery job retries the notice. */ }
      finally { q.release() }
    }
  }
  function recover() { return locked(async () => {
    const ledger = await funds.load(); expireDrafts(ledger)
    const pending = ledger.operations.filter(row => ['Processing','Review'].includes(row.state) || row.state === 'Succeeded' && row.rail === 'Transfer').sort((a,b) => (a.checkedAt ?? a.createdAt).localeCompare(b.checkedAt ?? b.createdAt)).slice(0,5)
    for (const row of pending) await recoverOne(row, ledger)
    await flushRequestNotices(ledger)
    await funds.save(ledger); return { moneyOutChecked: pending.length, moneyOutReview: ledger.operations.filter(row => row.state === 'Review').length }
  }) }
  return {
    practice,
    withPrintingLock:locked,
    receiveRefund(token: string | undefined, value: unknown) { return locked(async () => {
      if (!authenticateCallback(token, deps.callbackToken ?? '')) throw paymentError('Callback could not be verified.', 'PAYMENT_CALLBACK_UNAUTHORIZED', 401)
      const body = value as Record<string, any>, data = body?.data
      if (!['refund.succeeded','refund.failed'].includes(body?.event) || body.api_version !== 'v3' || !data || body.is_live === true || data.is_live === true
        || !/^rfd-[a-f\d-]{36}$/i.test(data.refund_id) || data.status !== (body.event === 'refund.succeeded' ? 'SUCCEEDED' : 'FAILED')) throw paymentError('Refund confirmation is invalid.', 'REFUND_CALLBACK_INVALID', 400)
      const ledger = await funds.load(), row = ledger.operations.find(row => row.type === 'Refund' && row.rail === 'Native' && row.submittedAt && data.reference_id === 'sti-out-' + row.id)
      if (!row) return { received: true, matched: false }
      if (body.business_id !== row.businessId || data.business_id !== row.businessId || data.payment_id !== row.providerPaymentId || data.currency !== 'PHP'
        || data.channel_code !== 'GCASH' || amount(data.amount) !== row.total || row.providerId && row.providerId !== data.refund_id) throw paymentError('Refund confirmation needs review.', 'MONEY_OUT_EVIDENCE_MISMATCH', 409)
      ledger.refundCallbacks ??= []
      const key = data.refund_id + ':' + data.status
      const receipt = ledger.refundCallbacks.find(receipt => receipt.key === key)
      if (receipt?.verified) return { received: true, duplicate: true }
      const saved = receipt ?? { key, operationId: row.id, at: new Date().toISOString(), verified: false }
      if (!receipt) ledger.refundCallbacks.push(saved)
      await funds.save(ledger)
      await recoverOne(row, ledger)
      saved.verified = row.providerState === data.status
      await funds.save(ledger); await flushRequestNotices(ledger)
      return { received: true, verified: saved.verified }
    }) },
    async ownerRequestOptions(actor: PaymentActor, id: unknown, requested?: unknown) {
      const original = await ownedPayment(actor, id, true), ledger = await funds.load(), options = await requestOptions(original, ledger)
      const principal = requested === undefined ? options.refundableCentavos : amount(requested)
      const quote = principal > 0 ? refundAmounts(original.principalCentavos, original.feeCentavos, appliedAmounts(await deps.attempts.load()).get(original.paymentId) ?? 0,
        ledger.operations.filter(row => row.paymentId === original.paymentId), principal) : { principal: 0, fee: 0, total: 0 }
      return { ...options, principalCentavos: original.principalCentavos, feeCentavos: original.feeCentavos, kind: original.kind, quote: { principalCentavos: quote.principal, feeCentavos: quote.fee, totalCentavos: quote.total } }
    },
    requestRefund(actor: PaymentActor, id: unknown, value: unknown) { return locked(async () => {
      const original = await ownedPayment(actor, id, true), input = inputObject(value, ['amount','reason','reasonCode','requestKey','expectedTotalCentavos'])
      const principal = amount(input.amount), reason = text(input.reason, 'a refund explanation with at least 10 characters', 10, 500), key = requestKey(input.requestKey)
      if (!refundReasons.includes(input.reasonCode as RefundReason)) throw paymentError('Choose a refund reason.')
      const ledger = await funds.load(); ledger.refundRequests ??= []
      const previous = ledger.refundRequests.find(row => row.requestKey === key)
      if (previous) {
        if (previous.requestedBy !== positiveId(actor.accountId) || previous.paymentId !== original.paymentId || previous.principal !== principal || previous.reason !== reason || previous.reasonCode !== input.reasonCode) throw paymentError('This request was already used. Open the saved refund request.', 'REFUND_REQUEST_CONFLICT', 409)
        return requestPublic(previous, ledger.operations.find(op => op.id === previous.operationId))
      }
      const options = await requestOptions(original, ledger)
      if (!options.refundRequestAllowed) throw paymentError(options.refundRequestReason!, 'REFUND_REQUEST_UNAVAILABLE', 409)
      if (ledger.refundRequests.some(row => row.accountId === original.accountId && row.kind === original.kind && row.targetId === original.targetId && row.state === 'PendingReview')) throw paymentError('A refund request for this bill is already pending.', 'REFUND_REQUEST_PENDING', 409)
      if (actor.role !== 'Librarian' && requestRows(ledger, original).some(row => row.state === 'Rejected')) throw paymentError('Contact the librarian about the rejected request before submitting again.', 'REFUND_REQUEST_REJECTED', 409)
      if (ledger.refundRequests.filter(row => row.requestedBy === positiveId(actor.accountId) && Date.now()-Date.parse(row.createdAt)<86_400_000).length >= 10) throw paymentError('Contact the librarian before making more refund requests today.', 'REFUND_REQUEST_LIMIT', 429)
      const amounts = refundAmounts(original.principalCentavos, original.feeCentavos, appliedAmounts(await deps.attempts.load()).get(original.paymentId) ?? 0,
        ledger.operations.filter(row => row.paymentId === original.paymentId), principal)
      if (input.expectedTotalCentavos !== amounts.total) throw paymentError('The refundable amount changed. Review the updated total first.', 'REFUND_QUOTE_CHANGED', 409)
      const result = await bill(original, async charge => {
        if (charge.accruing) throw paymentError('Return the overdue book before requesting a refund for this fine.')
        const row: RefundRequest = { id: randomUUID(), requestKey: key, paymentId: original.paymentId, accountId: original.accountId, userId: original.userId,
          kind: original.kind, targetId: original.targetId, requestedBy: positiveId(actor.accountId), principal, fee: amounts.fee,
          reasonCode: String(input.reasonCode), reason, state: 'PendingReview', version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), events: [] }
        row.events.push({ at: row.createdAt, state: 'PendingReview', actorId: row.requestedBy })
        ledger.refundRequests!.push(row); await funds.save(ledger)
        return requestPublic(row)
      }, true)
      await flushRequestNotices(ledger); return result
    }) },
    withdrawRefundRequest(actor: PaymentActor, id: unknown, value: unknown) { return locked(async () => {
      const input = inputObject(value, ['version']), ledger = await funds.load(), row = ledger.refundRequests?.find(row => row.id === paymentId(id))
      if (!row) throw paymentError('This request is unavailable.', 'REFUND_REQUEST_NOT_FOUND', 404)
      await ownedPayment(actor, row.paymentId)
      if (row.state === 'Withdrawn') return requestPublic(row)
      if (row.state !== 'PendingReview' || input.version !== row.version) throw paymentError('This request changed. Refresh before continuing.', 'REFUND_REQUEST_CHANGED', 409)
      requestChange(row, 'Withdrawn', positiveId(actor.accountId)); await funds.save(ledger); await flushRequestNotices(ledger); return requestPublic(row)
    }) },
    async listRefundRequests(actor: PaymentActor, query: Record<string, unknown>) {
      await admin(actor)
      const ledger = await funds.load(), rows = [...(ledger.refundRequests ?? [])].reverse()
      const q = await database.getConnection()
      let owners: any[]
      try { [owners] = rows.length ? await q.execute<any[]>('SELECT user_id,full_name,school_id FROM users WHERE user_id=ANY(?::int[])', [[...new Set(rows.map(row => row.userId))]]) : [[]] } finally { q.release() }
      const search = String(query.search ?? '').slice(0,120).toLowerCase(), state = String(query.state ?? ''), kind = String(query.kind ?? '')
      const filtered = rows.map(row => ({ ...requestPublic(row, ledger.operations.find(op => op.id === row.operationId)), payerName: owners.find(owner => Number(owner.user_id) === row.userId)?.full_name ?? 'Library user', schoolId: owners.find(owner => Number(owner.user_id) === row.userId)?.school_id ?? '', operation: ledger.operations.find(op => op.id === row.operationId) ? moneyOutPublic(ledger.operations.find(op => op.id === row.operationId)!) : null }))
        .filter(row => (!state || row.state === state) && (!kind || row.kind === kind) && (!search || [row.payerName,row.schoolId,row.reference].some(value => value.toLowerCase().includes(search))))
      const page = positiveId(query.page ?? 1)
      return { items: filtered.slice((page-1)*25,page*25), pending: rows.filter(row => row.state === 'PendingReview').length, pagination: { total: filtered.length, page, limit: 25 } }
    },
    async refundRequestSummary(actor: PaymentActor) {
      await admin(actor)
      return { pending: ((await funds.load()).refundRequests ?? []).filter(row => row.state === 'PendingReview').length }
    },
    async refundRequestDetails(actor: PaymentActor, id: unknown) {
      await admin(actor)
      const ledger = await funds.load(), request = ledger.refundRequests?.find(row => row.id === paymentId(id))
      if (!request) throw paymentError('This request is unavailable.', 'REFUND_REQUEST_NOT_FOUND', 404)
      const original = await payment(request.paymentId), charge = await bill(original, async charge => charge)
      const paymentView = { paymentId: original.paymentId, kind: original.kind, principalCentavos: original.principalCentavos, feeCentavos: original.feeCentavos, totalCentavos: original.totalCentavos,
        state: original.state, channelCode: original.channelCode, createdAt: original.createdAt, localPreview: true, ...await requestOptions(original, ledger), refundEligible: await refundEligible(original) }
      const q = await database.getConnection()
      try {
        const [history] = original.kind === 'Printing' ? await q.execute<any[]>('SELECT from_status,to_status,created_at FROM print_status_history WHERE request_id=? ORDER BY created_at DESC LIMIT 20', [original.targetId])
          : original.kind === 'Fine' ? await q.execute<any[]>('SELECT f.fine_type,bt.transaction_status,bt.borrowed_at,bt.due_at,bt.returned_at FROM fines f LEFT JOIN borrow_transactions bt ON bt.transaction_id=f.transaction_id WHERE f.fine_id=? AND f.user_id=?', [original.targetId, original.userId]) : [[]]
        return { request: requestPublic(request, ledger.operations.find(row => row.id === request.operationId)),
          payment: paymentView,
          evidence: { assessed: charge.assessed, paid: charge.paid, adjusted: charge.adjusted, jobStatus: charge.job_status, accruing: charge.accruing, history } }
      } finally { q.release() }
    },
    rejectRefundRequest(actor: PaymentActor, id: unknown, value: unknown) { return locked(async () => {
      const actorId = await admin(actor), input = inputObject(value, ['version','reason']), ledger = await funds.load(), row = ledger.refundRequests?.find(row => row.id === paymentId(id))
      const note = text(input.reason, 'a rejection explanation with at least 10 characters', 10, 500)
      if (!row) throw paymentError('This request is unavailable.', 'REFUND_REQUEST_NOT_FOUND', 404)
      if (row.state === 'Rejected' && row.reviewedBy === actorId && row.reviewNote === note) return requestPublic(row)
      if (row.state !== 'PendingReview' || row.version !== input.version) throw paymentError('This request changed. Refresh before continuing.', 'REFUND_REQUEST_CHANGED', 409)
      row.reviewedBy = actorId; row.reviewNote = note; requestChange(row, 'Rejected', actorId, note)
      await funds.save(ledger); await flushRequestNotices(ledger); return requestPublic(row)
    }) },
    async printingProjection():Promise<PrintingPaymentView[]> {
      const ledger=await funds.load(),attempts=await deps.attempts.load()
      const targets=new Map<string,LocalAttempt>()
      for(const row of attempts)if(row.kind==='Printing'&&row.state==='Succeeded')targets.set(`${row.userId}:${row.targetId}`,row)
      return [...targets.values()].map(row=>{
        const credits=netCredits(attempts,ledger,row.accountId,row.userId).filter(credit=>credit.kind==='Printing'&&credit.targetId===row.targetId)
        const related=ledger.operations.filter(refund=>refund.userId===row.userId&&refund.kind==='Printing'&&refund.targetId===row.targetId)
        const pending=related.some(refund=>['Draft','Processing','Review'].includes(refund.state)) || (ledger.refundRequests ?? []).some(request=>request.kind==='Printing'&&request.targetId===row.targetId&&request.userId===row.userId&&request.state==='PendingReview')
        const cancelled=credits.some(credit=>credit.voided&&credit.principalCentavos>0)
        const applied=credits.filter(credit=>!credit.voided).reduce((sum,credit)=>sum+credit.principalCentavos,0)
        return{request_id:row.targetId,user_id:row.userId,payment_status:pending?'Refund pending':cancelled?'Refunded':applied>0?'Paid':'Unpaid',
          local_payment_id:row.paymentId,paid_centavos:applied,refund_pending:pending,cancel_job:cancelled,paid_at:row.createdAt}
      })
    },
    async sync(actor: PaymentActor) { await admin(actor); return recover() },
    async decorations(original: LocalAttempt) { return {...await requestOptions(original, await funds.load()),refundEligible:original.kind==='Printing'?await refundEligible(original):true} },
    async credits(rows: LocalAttempt[], accountId: number, userId: number) { return netCredits(rows, await funds.load(), accountId, userId) },
    async guard(kind: string, targetId: number) {
      if((await deps.attempts.load()).some(row=>row.kind===kind&&row.targetId===targetId&&['Creating','Active','Review'].includes(row.state)))throw paymentError('Check or cancel the existing online payment before changing this bill.','PAYMENT_ALREADY_ACTIVE',409)
      const ledger = await funds.load()
      if ((ledger.refundRequests ?? []).some(row => row.kind === kind && row.targetId === targetId && row.state === 'PendingReview')) throw paymentError('This job is on hold for refund review.', 'REFUND_REQUEST_PENDING', 409)
      if (ledger.operations.some(row => row.kind === kind && row.targetId === targetId && (['Draft','Processing','Review'].includes(row.state) || kind === 'Printing' && row.state === 'Succeeded' && row.decision === 'Cancel'))) throw paymentError('This job has a refund review or confirmed cancellation. It cannot be changed.', 'REFUND_IN_PROGRESS', 409)
    },
    async overview(actor: PaymentActor) {
      await admin(actor)
      const ledger = await funds.load(), rows = await deps.attempts.load()
      let balance = null
      try { balance = await available(ledger) } catch { /* Missing provider capability is shown without leaking credentials. */ }
      const successes = ledger.operations.filter(confirmed)
      return { enabled: true, refundsEnabled: deps.refundsEnabled, payoutsEnabled: deps.payoutsEnabled, payoutFeeCentavos: transferFee(ledger),
        bankOptions: schoolBanks,
        schoolBanks: ledger.beneficiaries.filter(row => row.type === 'SchoolBank').map(row => ({ id: row.id, type: row.type, label: row.label, active: row.active, isDefault: row.isDefault === true, isSample: row.isSample === true, ...maskedDestination(row.recipient) })),
        payoutFeeIsSample: ledger.transferFee?.isSample === true,
        collections: fundsAccounting(rows, ledger, await readCashCollections(database)),
        practiceTransfers: (ledger.practiceTransfers ?? []).map(row => publicPracticeTransfer(row)).reverse(),
        balance, setupMessage: !deps.payoutsEnabled ? 'Transfers need Xendit Money-out access before they can be sent.' : transferFee(ledger) === null ? 'Confirm the provider transfer fee before sending a transfer.' : null,
        beneficiaries: ledger.beneficiaries.filter(row => row.active).map(row => ({ id: row.id, type: row.type, label: row.label, accountId: row.accountId, isDefault: row.isDefault === true, isSample: row.isSample === true, ...maskedDestination(row.recipient) })),
        operations: ledger.operations.map(moneyOutPublic).reverse(), voids: ledger.voids,
        totals: { grossCollections: rows.filter(row => row.state === 'Succeeded').reduce((sum, row) => sum + row.totalCentavos, 0),
          appliedPrincipal: [...appliedAmounts(rows).values()].reduce((sum, value) => sum + value, 0),
          userFees: rows.filter(row => row.state === 'Succeeded').reduce((sum, row) => sum + row.feeCentavos, 0),
          refundedPrincipal: successes.filter(row => row.type === 'Refund').reduce((sum, row) => sum + row.principal, 0),
          refundedFees: successes.filter(row => row.type === 'Refund').reduce((sum, row) => sum + row.fee, 0),
          withdrawals: successes.filter(row => row.type === 'Withdrawal').reduce((sum, row) => sum + row.total, 0), providerCosts: null } }
    },
    async refundOptions(actor: PaymentActor, id: unknown) {
      await admin(actor)
      const original = await payment(id), ledger = await funds.load()
      const eligible = await refundEligible(original)
      return { ...stateFor(original, ledger), principalCentavos: original.principalCentavos, feeCentavos: original.feeCentavos,
        channel: original.channelCode, kind: original.kind, eligible, enabled: original.channelCode === 'GCASH' ? deps.refundsEnabled : deps.payoutsEnabled && transferFee(ledger) !== null,
        beneficiaries: ledger.beneficiaries.filter(row => row.active && row.type === 'StudentRefund' && row.accountId === original.accountId).map(row => ({ id: row.id, label: row.label, ...maskedDestination(row.recipient) })) }
    },
    draftRefund(actor: PaymentActor, id: unknown, value: unknown) { return locked(async () => {
      const actorId = await admin(actor), original = await payment(id), input = inputObject(value, ['amount','decision','reason','reasonCode','beneficiaryId','requestKey','requestId','requestVersion','verificationNote','verified'])
      const ledger = await funds.load(); expireDrafts(ledger)
      const key = requestKey(input.requestKey), prior = ledger.operations.find(row => row.requestKey === key)
      const principal = amount(input.amount), reason = text(input.reason, 'a reason with at least 10 characters', 10, 500)
      if (!refundReasons.includes(input.reasonCode as RefundReason)) throw paymentError('Choose a refund reason.', 'REFUND_REASON_REQUIRED', 400)
      const reasonCode = input.reasonCode as RefundReason
      const decision = original.kind === 'Printing' ? 'Cancel' : input.decision
      if (!['Restore','Cancel'].includes(String(decision))) throw paymentError('Choose whether to restore the balance or cancel the incorrect charge.')
      if (prior) {
        if (prior.actorId !== actorId || prior.paymentId !== original.paymentId || prior.principal !== principal || prior.reason !== reason || prior.reasonCode !== reasonCode || prior.decision !== decision || prior.beneficiaryId !== input.beneficiaryId || prior.requestId !== input.requestId) throw paymentError('This request was already used. Review the existing refund.', 'MONEY_OUT_RETRY_CONFLICT', 409)
        return moneyOutPublic(prior)
      }
      const request = ledger.refundRequests?.find(row => row.id === input.requestId && row.paymentId === original.paymentId && row.accountId === original.accountId && row.userId === original.userId && row.kind === original.kind && row.targetId === original.targetId)
      if (!request || request.state !== 'PendingReview' || request.version !== input.requestVersion) throw paymentError('Open a pending refund request and review its latest details first.', 'REFUND_REQUEST_REQUIRED', 409)
      const verification = text(input.verificationNote, 'a verification note with at least 10 characters', 10, 500)
      if (request.reasonCode !== reasonCode || request.reason !== reason) throw paymentError('The request details changed. Reload before reviewing.', 'REFUND_REQUEST_CHANGED', 409)
      if (input.verified !== true || principal > request.principal) throw paymentError('Verify the original payment and approve no more than the requested amount.', 'REFUND_REVIEW_REQUIRED', 400)
      const captured = Date.parse(original.capturedAt ?? original.createdAt)
      if (!Number.isFinite(captured) || Date.now()-captured >= 180*86_400_000) throw paymentError('The refund window has ended.', 'REFUND_WINDOW_ENDED', 409)
      const related = ledger.operations.filter(row => row.paymentId === original.paymentId)
      if (ledger.operations.some(row => row.accountId === original.accountId && row.kind === original.kind && row.targetId === original.targetId && ['Draft','Processing','Review'].includes(row.state))) throw paymentError('Finish the existing refund before starting another.', 'REFUND_IN_PROGRESS', 409)
      if ((await deps.attempts.load()).some(row => row.accountId === original.accountId && row.kind === original.kind && row.targetId === original.targetId && ['Creating','Active','Review'].includes(row.state))) throw paymentError('Check or cancel the open checkout before refunding this bill.', 'PAYMENT_ALREADY_ACTIVE', 409)
      if (!['GCASH','QRPH'].includes(original.channelCode)) throw paymentError('Refunds are unavailable for this payment method.')
      const recipient = original.channelCode === 'QRPH' ? ledger.beneficiaries.find(row => row.id === input.beneficiaryId && row.type === 'StudentRefund' && row.accountId === original.accountId && row.active) : undefined
      if (original.channelCode === 'QRPH' && !recipient) throw paymentError('Verify this student’s refund destination first.')
      if (original.channelCode === 'GCASH' && input.beneficiaryId) throw paymentError('GCash refunds return to the original payment method.')
      return bill(original, async charge => {
        if (charge.accruing) throw paymentError('Return the overdue book before refunding this fine.')
        const amounts = refundAmounts(original.principalCentavos, original.feeCentavos, appliedAmounts(await deps.attempts.load()).get(original.paymentId) ?? 0, related, principal)
        const row: MoneyOut = { id: randomUUID(), type: 'Refund', state: 'Draft', actorId, requestKey: key,
          paymentId: original.paymentId, accountId: original.accountId, userId: original.userId, kind: original.kind, targetId: original.targetId,
          ...amounts, decision: decision as 'Restore'|'Cancel', rail: recipient ? 'Transfer' : 'Native', beneficiaryId: recipient?.id,
          destination: recipient ? structuredClone(recipient.recipient) : undefined, transferFee: recipient ? transferFee(ledger) ?? undefined : undefined, businessId: original.businessId!, reason, reasonCode,
          createdAt: new Date().toISOString(), expiresAt: new Date(Date.now()+15*60_000).toISOString(), events: [], requestId: request.id }
        request.reviewedBy = actorId; request.reviewNote = verification; request.operationId = row.id
        requestChange(request, 'Approved', actorId, verification)
        event(row, 'Draft', 'REVIEW_CREATED', actorId); ledger.operations.push(row); await funds.save(ledger); return moneyOutPublic(row)
      }, true)
    }) },
    addBeneficiary(actor: PaymentActor, value: unknown) { return locked(async () => {
      const actorId = await admin(actor)
      const input = inputObject(value, ['type','paymentId','name','accountNumber','confirmAccountNumber','bankCode','firstName','lastName','street','city','province','postalCode','evidence','confirmed'])
      if (!['SchoolBank','StudentRefund'].includes(String(input.type)) || input.confirmed !== true) throw paymentError('Confirm that the destination belongs to the school or the selected student.')
      const school = input.type === 'SchoolBank', original = !school ? await payment(input.paymentId) : undefined
      if (!school && original?.channelCode !== 'QRPH') throw paymentError('Select a QRPh payment for a separate refund transfer.')
      const name = text(input.name, 'the verified account name', 2, 50), number = text(input.accountNumber, 'the account number', 6, 30)
      if (!/^\d{6,30}$/.test(number)) throw paymentError('Use digits only for the destination account number.')
      const bankCode = school ? text(input.bankCode, 'the bank SWIFT code', 8, 11).toUpperCase() : 'PH_GCASH'
      if (school && !schoolBanks.some(bank => bank.code === bankCode)) throw paymentError('Choose a supported school bank.')
      if (school && input.confirmAccountNumber !== number) throw paymentError('The account numbers do not match.', 'BANK_ACCOUNT_MISMATCH', 400)
      const recipient = { type: school ? 'BUSINESS' : 'INDIVIDUAL', ...(school ? { business_name: name } : { given_name: text(input.firstName, 'the student’s first name', 1, 50), surname: text(input.lastName, 'the student’s last name', 1, 50) }),
        relationship: school ? 'OWNSELF' : 'CUSTOMER', account_details: { currency: 'PHP', account_country: 'PH', account_holder_name: name, account_number: number, routing_type_1: school ? 'SWIFT' : 'WALLET', routing_value_1: bankCode },
        address: { country: 'PH', street_line_1: text(input.street, 'the recipient street address'), city: text(input.city, 'the recipient city'), province_state: text(input.province, 'the province'), postal_code: text(input.postalCode, 'the postal code', 4, 10) } }
      const ledger = await funds.load()
      if (ledger.beneficiaries.some(row => row.type === input.type && row.accountId === original?.accountId && row.recipient.account_details.account_number === number && row.recipient.account_details.routing_value_1 === bankCode)) throw paymentError('This account is already saved. Manage the existing account instead.', 'BANK_ALREADY_SAVED', 409)
      const row: Beneficiary = { id: randomUUID(), type: input.type as Beneficiary['type'], accountId: original?.accountId, label: name,
        recipient, verifiedBy: actorId, verifiedAt: new Date().toISOString(), evidence: text(input.evidence, 'the school authorization or recipient verification reference', 10, 500), active: true,
        ...(school ? { isDefault: !ledger.beneficiaries.some(row => row.type === 'SchoolBank' && row.active) } : {}) }
      ledger.beneficiaries.push(row); await funds.save(ledger)
      return { id: row.id, type: row.type, label: row.label, ...maskedDestination(recipient) }
    }) },
    updateBank(actor: PaymentActor, id: unknown, value: unknown) { return locked(async () => {
      const actorId = await admin(actor), input = inputObject(value, ['active','isDefault','confirmed']), ledger = await funds.load()
      const bank = ledger.beneficiaries.find(bank => bank.id === paymentId(id) && bank.type === 'SchoolBank')
      if (!bank) throw paymentError('This school bank is unavailable.', 'BANK_NOT_FOUND', 404)
      if (input.confirmed !== true || typeof input.active !== 'boolean' && input.isDefault !== true) throw paymentError('Review and confirm this school bank change.')
      if (input.active === true && !bank.active) throw paymentError('Add a newly verified school account instead of reactivating this old account.')
      if (input.isDefault === true && !bank.active) throw paymentError('An inactive account cannot be the default.')
      if (input.active === false && !bank.active || input.isDefault === true && bank.isDefault) return { id: bank.id, active: bank.active, isDefault: bank.isDefault === true }
      if (input.active === false) { bank.active = false; bank.isDefault = false }
      if (input.isDefault === true) for (const item of ledger.beneficiaries) if (item.type === 'SchoolBank') item.isDefault = item.id === bank.id
      ledger.bankEvents ??= []; ledger.bankEvents.push({ bankId: bank.id, actorId, active: bank.active, isDefault: bank.isDefault === true, at: new Date().toISOString() })
      await funds.save(ledger); return { id: bank.id, active: bank.active, isDefault: bank.isDefault === true }
    }) },
    setupSampleBank(actor: PaymentActor, value: unknown) { return locked(async () => {
      const actorId = await admin(actor), input = inputObject(value, ['confirmed'])
      if (input.confirmed !== true) throw paymentError('Confirm the Xendit sample destination first.')
      if (!deps.payoutsEnabled) throw paymentError('Enable Xendit Money-out access first.', 'PAYOUT_SETUP_REQUIRED', 503)
      const ledger = await funds.load()
      const hasDefault = ledger.beneficiaries.some(item => item.type === 'SchoolBank' && item.active && item.isDefault)
      let row = ledger.beneficiaries.find(item => item.type === 'SchoolBank' && item.isSample && item.active)
      if (!row) {
        row = { id: randomUUID(), type: 'SchoolBank', label: 'School bank · Xendit sample', isSample: true, active: true,
          ...(hasDefault ? {} : { isDefault: true }),
          verifiedBy: actorId, verifiedAt: new Date().toISOString(), evidence: 'Owner-approved Xendit development sample recipient; not a real school account',
          recipient: { type: 'BUSINESS', business_name: 'SAMPLE SCHOOL LIBRARY', relationship: 'OWNSELF',
            account_details: { currency: 'PHP', account_country: 'PH', account_holder_name: 'SAMPLE SCHOOL LIBRARY', account_number: '8888888888', routing_type_1: 'SWIFT', routing_value_1: 'BNORPHMM' },
            address: { country: 'PH', street_line_1: 'Sample School Road', city: 'Ormoc', province_state: 'Leyte', postal_code: '6541' } } }
        ledger.beneficiaries.push(row)
      } else if (!hasDefault) {
        row.isDefault = true
      }
      if (!ledger.transferFee && deps.payoutFeeCentavos === null) {
        ledger.transferFee = { centavos: 500, reference: 'Owner-approved PHP 5 sample fee; not a provider fee agreement', actorId, confirmedAt: new Date().toISOString(), isSample: true }
        ledger.feeHistory = [...(ledger.feeHistory ?? []), structuredClone(ledger.transferFee)]
      }
      await funds.save(ledger)
      return { id: row.id, type: row.type, label: row.label, isSample: true, isDefault: row.isDefault === true, ...maskedDestination(row.recipient) }
    }) },
    draftWithdrawal(actor: PaymentActor, value: unknown) { return locked(async () => {
      const actorId = await admin(actor), input = inputObject(value, ['amount','beneficiaryId','reason','requestKey']), ledger = await funds.load(); expireDrafts(ledger)
      const principal = amount(input.amount), key = requestKey(input.requestKey), reason = text(input.reason, 'a purpose with at least 10 characters', 10, 500)
      const previous = ledger.operations.find(row => row.requestKey === key)
      if (previous) {
        if (previous.type !== 'Withdrawal' || previous.actorId !== actorId || previous.principal !== principal || previous.beneficiaryId !== input.beneficiaryId || previous.reason !== reason) throw paymentError('This request was already used.', 'MONEY_OUT_RETRY_CONFLICT', 409)
        return moneyOutPublic(previous)
      }
      const destination = ledger.beneficiaries.find(row => row.id === input.beneficiaryId && row.type === 'SchoolBank' && row.active)
      if (!destination) throw paymentError('Choose an approved school bank account.')
      const fee = transferFee(ledger)
      if (!deps.payoutsEnabled || fee === null) throw paymentError('Set up transfer access and confirm its provider fee first.', 'PAYOUT_SETUP_REQUIRED', 503)
      const businesses = new Set((await deps.attempts.load()).filter(row => row.state === 'Succeeded').map(row => row.businessId).filter(Boolean))
      if (businesses.size > 1 || (businesses.size === 0 && !deps.defaultBusinessId)) throw paymentError('Confirm the library’s provider account before withdrawing funds.')
      const businessId = [...businesses][0] ?? deps.defaultBusinessId!
      if (principal + fee > (await available(ledger)).availableCentavos) throw paymentError('This amount exceeds the available provider balance.')
      const row: MoneyOut = { id: randomUUID(), type: 'Withdrawal', state: 'Draft', actorId, requestKey: key, principal, fee,
        total: principal, appliedPrincipal: 0, rail: 'Transfer', transferFee: fee, beneficiaryId: destination.id, destination: structuredClone(destination.recipient),
        businessId, reason, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now()+15*60_000).toISOString(), events: [] }
      event(row, 'Draft', 'REVIEW_CREATED', actorId); ledger.operations.push(row); await funds.save(ledger); return moneyOutPublic(row)
    }) },
    submit(actor: PaymentActor, id: unknown, value: unknown = {}) { return locked(async () => {
      const actorId = await admin(actor), ledger = await funds.load(); expireDrafts(ledger)
      const row = ledger.operations.find(row => row.id === paymentId(id))
      if (!row) throw paymentError('This request is unavailable.', 'MONEY_OUT_NOT_FOUND', 404)
      if (row.state !== 'Draft') { await funds.save(ledger); return moneyOutPublic(row) }
      if (row.actorId !== actorId) throw paymentError('Only the administrator who reviewed this request can confirm it.', 'MONEY_OUT_FORBIDDEN', 403)
      const approval = inputObject(value, ['confirmed'])
      if (row.type === 'Refund' && approval.confirmed !== true) throw paymentError('Confirm the refund amount, reason and original payment before sending.', 'REFUND_APPROVAL_REQUIRED', 400)
      if (row.type === 'Refund' && !ledger.refundRequests?.some(request => request.id === row.requestId && request.operationId === row.id && request.state === 'Approved')) throw paymentError('Cancel this old review and open a verified refund request first.', 'REFUND_REQUEST_REQUIRED', 409)
      const fee = transferFee(ledger)
      if (row.rail === 'Native' ? !deps.refundsEnabled : !deps.payoutsEnabled || fee === null) throw paymentError('Set up provider access before sending this request.', 'MONEY_OUT_SETUP_REQUIRED', 503)
      if (row.rail === 'Transfer' && row.transferFee !== fee) throw paymentError('The provider transfer fee changed. Cancel this review and prepare it again.', 'MONEY_OUT_FEE_CHANGED', 409)
      if (row.beneficiaryId && !ledger.beneficiaries.some(item => item.id === row.beneficiaryId && item.active && JSON.stringify(item.recipient) === JSON.stringify(row.destination))) throw paymentError('The destination changed. Review it again.')
      const original = row.paymentId ? await payment(row.paymentId) : undefined
      const send = async () => {
        if (original && Date.now()-Date.parse(original.capturedAt??original.createdAt)>=180*86_400_000) throw paymentError('The refund window has ended.', 'REFUND_WINDOW_ENDED', 409)
        if (original) row.providerPaymentId = await verifiedCapture(original)
        if (row.rail === 'Transfer' && row.total + fee! > (await available(ledger, row.id, row.type === 'Withdrawal')).availableCentavos) throw paymentError('The provider balance changed. Review the amount again.')
        row.payload = row.rail === 'Native' ? { payment_id: row.providerPaymentId, reference_id: 'sti-out-'+row.id, amount: row.total/100, reason: row.reasonCode === 'DUPLICATE' ? 'DUPLICATE' : ['INCORRECT_CHARGE','OTHER'].includes(row.reasonCode ?? '') ? 'OTHERS' : 'REQUESTED_BY_CUSTOMER' }
          : { reference_id: 'sti-out-'+row.id, recipient: row.destination, payout_details: { source_currency: 'PHP', source_amount: row.total, destination_currency: 'PHP' }, source_of_fund: 'BUSINESS_REVENUE', purpose_code: row.type === 'Refund' ? 'REFUND' : 'SELF', description: row.type === 'Refund' ? 'Library payment refund' : 'School library collections' }
        row.submittedAt = new Date().toISOString()
        if (row.type === 'Refund') { row.approvedAt = row.submittedAt; row.approvedBy = actorId }
        event(row, 'Processing', 'SUBMISSION_SAVED', actorId); await funds.save(ledger)
        try { const result = row.rail === 'Native' ? await provider.createRefund(row.payload) : await provider.createPayout(row.payload, row.id); matches(row, result, original) }
        catch { event(row, 'Review', 'SUBMISSION_UNCERTAIN', actorId) }
        await funds.save(ledger); return moneyOutPublic(row)
      }
      const result = await (original ? bill(original, send, true) : send())
      await flushRequestNotices(ledger); return result
    }) },
    cancel(actor: PaymentActor, id: unknown) { return locked(async () => {
      const actorId = await admin(actor), ledger = await funds.load(), row = ledger.operations.find(row => row.id === paymentId(id))
      if (!row || row.state !== 'Draft') throw paymentError('Only an unsent review can be cancelled. Check a submitted transfer instead.')
      event(row, 'Cancelled', 'REVIEW_CANCELLED', actorId); await funds.save(ledger); return moneyOutPublic(row)
    }) },
    setTransferFee(actor:PaymentActor,value:unknown) { return locked(async()=>{
      const actorId=await admin(actor),input=inputObject(value,['amount','reference','confirmed'])
      if(input.confirmed!==true)throw paymentError('Confirm this rate against the provider agreement first.')
      const fee=/^0(?:\.0{1,2})?$/.test(String(input.amount))?0:amount(input.amount)
      if(fee>100000)throw paymentError('Review the provider fee; it exceeds the supported transfer fee.')
      const ledger=await funds.load()
      ledger.transferFee={centavos:fee,reference:text(input.reference,'the provider fee agreement reference',10,500),actorId,confirmedAt:new Date().toISOString()}
      ledger.feeHistory=[...(ledger.feeHistory??[]),structuredClone(ledger.transferFee)]
      await funds.save(ledger);return{payoutFeeCentavos:fee}
    }) },
    check(actor: PaymentActor, id: unknown, value: unknown = {}) { return locked(async () => {
      await admin(actor)
      const input = inputObject(value, ['providerId']), ledger = await funds.load(), row = ledger.operations.find(row => row.id === paymentId(id))
      if (!row) throw paymentError('This request is unavailable.', 'MONEY_OUT_NOT_FOUND', 404)
      if (input.providerId) {
        if (row.rail !== 'Transfer' || row.providerId || !row.submittedAt || !/^po-[a-f\d-]{36}$/i.test(String(input.providerId))) throw paymentError('Enter the matching Xendit transfer reference.')
        const response = await provider.getPayout(String(input.providerId)); matches(row, response, row.paymentId ? await payment(row.paymentId) : undefined)
        await funds.save(ledger)
      } else await recoverOne(row, ledger)
      return moneyOutPublic(row)
    }) },
    voidFine(actor: PaymentActor, value: unknown) { return locked(async () => {
      const actorId = await admin(actor), input = inputObject(value, ['paymentId','reason','requestKey']), original = await payment(input.paymentId)
      if (original.kind !== 'Fine') throw paymentError('Select a fine payment to review the remaining charge.')
      const ledger = await funds.load(), key = requestKey(input.requestKey), reason = text(input.reason, 'a reason with at least 10 characters', 10, 500)
      if ((ledger.refundRequests ?? []).some(row => row.kind === original.kind && row.targetId === original.targetId && row.accountId === original.accountId && row.state === 'PendingReview')) throw paymentError('Resolve the pending refund request before changing this charge.', 'REFUND_REQUEST_PENDING', 409)
      const previous = ledger.voids.find(row => row.id === key)
      if (previous) { if (previous.actorId !== actorId || previous.targetId !== original.targetId || previous.reason !== reason) throw paymentError('This review was already used.'); return previous }
      if (ledger.operations.some(row => row.targetId === original.targetId && row.kind === original.kind && ['Draft','Processing','Review'].includes(row.state))) throw paymentError('Finish the pending refund before voiding this charge.')
      if ((await deps.attempts.load()).some(row => row.kind === original.kind && row.targetId === original.targetId && ['Creating','Active','Review'].includes(row.state))) throw paymentError('Cancel or check the open checkout first.')
      return bill(original, async charge => {
        if (charge.accruing) throw paymentError('Return the overdue book before changing its charge.')
        const toMoney = (value: unknown) => Number(value) === 0 ? 0 : Number(centavos(value))
        const balance = Math.max(0, toMoney(charge.assessed)-toMoney(charge.paid)-toMoney(charge.adjusted))
        const credit = netCredits(await deps.attempts.load(), ledger, original.accountId, original.userId).filter(row => row.kind === original.kind && row.targetId === original.targetId).reduce((sum,row) => sum+row.principalCentavos,0)
        if (balance <= credit) throw paymentError('This fine has no unpaid balance. Use Refund payment for money already collected.')
        const adjustment = { id: key, paymentId: original.paymentId, accountId: original.accountId, userId: original.userId, kind: 'Fine' as const, targetId: original.targetId, amount: balance-credit, actorId, reason, createdAt: new Date().toISOString() }
        ledger.voids.push(adjustment); await funds.save(ledger); return adjustment
      })
    }) },
    recover,
    async syncOwner(accountId:number,userId:number) { return locked(async()=>{
      const ledger=await funds.load()
      const pending=ledger.operations.filter(row=>row.accountId===accountId&&row.userId===userId&&row.submittedAt&&(['Processing','Review'].includes(row.state)||row.state==='Succeeded'&&row.rail==='Transfer'))
        .sort((a,b)=>(a.checkedAt??a.createdAt).localeCompare(b.checkedAt??b.createdAt)).slice(0,3)
      for(const row of pending)await recoverOne(row,ledger)
      return {checked:pending.length,failed:pending.filter(row=>row.state==='Review').length}
    }) },
  }
}
