import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, open, readFile, rename } from 'node:fs/promises'
import dotenv from 'dotenv'
import { db, type Pool } from '../../config/db.js'
import { env } from '../../config/env.js'
import { readXenditSandboxConfig, type XenditSandboxConfig } from '../../config/xendit-sandbox.ts'
import { createPaymentsRepository } from './payments.repository.ts'
import { centavos, feeTotal, parseQuote, parseCheckout, parseTarget, paymentError, paymentId, positiveId } from './payments.validation.ts'
import type { PaymentActor } from './payments.service.ts'
import { createXenditClient, paymentReference, verifySession, verifyCapturedPayment, checkoutUrl } from './xendit.client.ts'
import { demoWalletAccounts, requireDemoWalletConfig, verifyDemoWallet } from './demo-wallet.ts'
import { paymentReturnUrl } from './payment-return.ts'
import { previewCredit, type PreviewCredit } from './preview-balances.ts'
import { createLocalMoneyOut, appliedAmounts } from './money-out.service.ts'
import { localFundsStore, type FundsStore } from './money-out.store.ts'
import { emptyFunds } from './money-out.rules.ts'
import { requireLibraryActor } from '../../core/library-permissions.ts'
import { withLocalPaymentLock } from './local-payment-lock.ts'

type Attempt = {
  paymentId: string; accountId: number; userId: number; kind: 'Fine' | 'Printing' | 'LostBook'; targetId: number
  principalCentavos: number; feeCentavos: number; totalCentavos: number; balanceCentavos: number; channelCode: string
  state: 'Quoted' | 'Creating' | 'Active' | 'Review' | 'Succeeded' | 'Cancelled' | 'Expired'
  createdAt: string; expiresAt: string; requestKey?: string; providerSessionId?: string; businessId?: string
  checkoutUrl?: string; reviewCode?: string
  lastCheckedAt?: string
  providerPaymentId?: string; appliedPrincipalCentavos?: number
  demoWallet?: boolean
}
type Store = { load(): Promise<Attempt[]>; save(rows: Attempt[]): Promise<void> }
const directory = new URL('../../../../../output/local-payment-tests/', import.meta.url)
const file = new URL('attempts.json', directory)
const privateStore: Store = {
  async load() { try { return JSON.parse(await readFile(file, 'utf8')) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error } },
  async save(rows) { await mkdir(directory, { recursive: true }); const temporary = new URL('attempts.tmp', directory); const handle=await open(temporary,'w',0o600);try{await handle.writeFile(JSON.stringify(rows));await handle.sync()}finally{await handle.close()};await rename(temporary, file) },
}

/** Local Test checkout only. School charges are read, never settled or updated. */
export function createLocalPaymentPreview(config: XenditSandboxConfig, database: Pool = db, store: Store = privateStore,
  provider: Pick<ReturnType<typeof createXenditClient>, 'createSession'|'getSession'|'cancelSession'|'getPayment'> & Partial<ReturnType<typeof createXenditClient>> = createXenditClient(() => config),
  moneyOutOptions: { funds?: FundsStore; refundsEnabled?: boolean; payoutsEnabled?: boolean; payoutFeeCentavos?: number | null } = {}) {
  if (!config.enabled || config.mode !== 'test') throw paymentError('Test checkout is not configured.')
  if (config.returnUrl) paymentReturnUrl(config.returnUrl, '00000000-0000-4000-8000-000000000001')
  let queue = Promise.resolve<unknown>(undefined)
  const locked = <T>(run: () => Promise<T>): Promise<T> => { const next = queue.then(()=>store===privateStore?withLocalPaymentLock(database,run):run()); queue = next.catch(() => undefined); return next }
  const methods = [
    { channelCode: 'GCASH', displayName: 'GCash', minTotalCentavos: 100, maxTotalCentavos: 1000000 },
    { channelCode: 'QRPH', displayName: 'QRPh', minTotalCentavos: 100, maxTotalCentavos: 1000000 },
  ]
  let testFunds = emptyFunds()
  const moneyOut = createLocalMoneyOut({ database, attempts: store, provider: provider as ReturnType<typeof createXenditClient>, locked,
    funds: moneyOutOptions.funds ?? (store === privateStore ? localFundsStore : { load: async () => structuredClone(testFunds), save: async value => { testFunds = structuredClone(value) } }),
    refundsEnabled: moneyOutOptions.refundsEnabled ?? false, payoutsEnabled: moneyOutOptions.payoutsEnabled ?? false, payoutFeeCentavos: moneyOutOptions.payoutFeeCentavos ?? null })
  const creditsFor = (rows: Attempt[], accountId: number, userId: number): Promise<PreviewCredit[]> => moneyOut.credits(rows, accountId, userId)
  async function currentOwner(actor: PaymentActor) {
    if (!['Student', 'Faculty'].includes(String(actor.role))) throw paymentError('Use a borrower account.', 'PAYMENT_ROLE_FORBIDDEN', 403)
    const accountId = positiveId(actor.accountId), q = await database.getConnection()
    try {
      const owner = await createPaymentsRepository(q).owner(accountId)
      if (!owner || owner.role !== actor.role) throw paymentError('Sign in again.', 'PAYMENT_OWNER_UNAVAILABLE', 401)
      return { accountId, userId: Number(owner.user_id) }
    } finally { q.release() }
  }
  async function credits(actor: PaymentActor) {
    const owner = await currentOwner(actor)
    return creditsFor(await store.load(), owner.accountId, owner.userId)
  }
  async function charge(actor: PaymentActor, target: { kind: 'Fine' | 'Printing' | 'LostBook'; targetId: number }) {
    if (!['Student', 'Faculty'].includes(String(actor.role))) throw paymentError('Use a borrower account.', 'PAYMENT_ROLE_FORBIDDEN', 403)
    const accountId = positiveId(actor.accountId), q = await database.getConnection()
    try {
      await q.beginTransaction()
      const repository = createPaymentsRepository(q), owner = await repository.owner(accountId)
      if (!owner || owner.role !== actor.role) throw paymentError('Sign in again.', 'PAYMENT_OWNER_UNAVAILABLE', 401)
      const row = await repository.charge(target, Number(owner.user_id))
      if (!row) throw paymentError('This bill is unavailable.', 'PAYMENT_TARGET_NOT_FOUND', 404)
      const money = (value: unknown) => Number(value || 0) === 0 ? 0n : centavos(value)
      const schoolBalance = money(row.assessed) - money(row.paid) - money(row.adjusted)
      const credit = previewCredit(await creditsFor(await store.load(), accountId, Number(owner.user_id)), target.kind, target.targetId, Number(schoolBalance))
      const balance = schoolBalance - BigInt(credit.applied)
      const allowed = balance > 0n && !row.accruing && row.job_status !== 'Cancelled' && !['Paid', 'Waived', 'Voided'].includes(row.status)
      await q.commit()
      return { balance, allowed, userId: Number(owner.user_id), schoolBalance: Number(schoolBalance) }
    } catch (error) { await q.rollback(); throw error } finally { q.release() }
  }
  async function owned(actor: PaymentActor, id: unknown, rows: Attempt[]) {
    const owner = await currentOwner(actor)
    const row = rows.find(row => row.paymentId === paymentId(id) && row.accountId === owner.accountId && row.userId === owner.userId)
    if (!row) throw paymentError('This payment is unavailable.', 'PAYMENT_NOT_FOUND', 404)
    return row
  }
  const publicRow = (row: Attempt) => ({ paymentId: row.paymentId, kind: row.kind, targetId: row.targetId,
    principalCentavos: row.principalCentavos, feeCentavos: row.feeCentavos, totalCentavos: row.totalCentavos,
    remainingCentavos: row.state === 'Succeeded' ? Math.max(0, row.balanceCentavos - row.principalCentavos) : row.balanceCentavos, channelCode: row.channelCode, state: row.state, isSample: true, localPreview: true,
    checkoutUrl: row.state === 'Active' ? row.checkoutUrl : null, demoWallet: Boolean(row.demoWallet), receiptId: null, createdAt: row.createdAt, expiresAt: row.expiresAt,
    description: row.kind === 'Printing' ? 'Printing payment' : row.kind === 'LostBook' ? 'Replacement charge' : 'Library fine payment', reviewCode: row.reviewCode ?? null })
  const evidence = (row: Attempt) => ({ payment_id: row.paymentId, total_centavos: String(row.totalCentavos), channel_code: row.channelCode,
    created_at: row.createdAt, provider_session_id: row.providerSessionId, provider_business_id: row.businessId })
  const decorated = async (row: Attempt) => ({ ...publicRow(row), ...await moneyOut.decorations(row) })
  async function libraryActor(actor: PaymentActor) {
    const q = await database.getConnection()
    try { await requireLibraryActor(q, positiveId(actor.accountId), 'desk.operate') } finally { q.release() }
  }
  async function borrowerOf(row: Attempt): Promise<PaymentActor> {
    const q = await database.getConnection()
    try { const owner = await createPaymentsRepository(q).owner(row.accountId); return { accountId: row.accountId, role: owner?.role } } finally { q.release() }
  }
  return {
    moneyOut,
    async adminList(actor: PaymentActor, query: Record<string, unknown>) {
      await libraryActor(actor)
      const rows = (await store.load()).filter(row => row.state !== 'Quoted' && (!query.state || row.state === query.state) && (!query.kind || row.kind === query.kind) && (!query.channel || row.channelCode === query.channel)).reverse()
      const page = positiveId(query.page ?? 1), items = await Promise.all(rows.slice((page-1)*25,page*25).map(decorated))
      const q = await database.getConnection()
      try {
        const ids = rows.slice((page-1)*25,page*25).map(row=>row.userId)
        const [owners] = ids.length ? await q.execute<any[]>('SELECT user_id,full_name,school_id FROM users WHERE user_id=ANY(?::int[])',[ids]) : [[]]
        return { localPreview: true, items: items.map((item,index)=>{const owner=owners.find((owner:any)=>Number(owner.user_id)===ids[index]);return {...item,payerName:owner?.full_name??'Library user',schoolId:owner?.school_id??''}}), pagination: { total: rows.length, page, limit: 25 }, methods }
      } finally { q.release() }
    },
    async adminCheck(actor: PaymentActor, id: unknown, cancel = false) {
      await libraryActor(actor)
      if (cancel && actor.role !== 'Librarian') throw paymentError('Only Librarian/Admin can cancel this checkout.', 'PAYMENT_ROLE_FORBIDDEN', 403)
      const row = (await store.load()).find(row => row.paymentId === paymentId(id))
      if (!row) throw paymentError('Payment unavailable.', 'PAYMENT_NOT_FOUND', 404)
      return this.check(await borrowerOf(row), row.paymentId, cancel)
    },
    credits,
    async sync(actor: PaymentActor): Promise<{ checked: number; failed: number }> {
      const owner = await currentOwner(actor)
      const pending = (await store.load()).filter(row => row.accountId === owner.accountId && row.userId === owner.userId
        && row.providerSessionId && ['Creating', 'Active', 'Review'].includes(row.state))
        .sort((a, b) => Date.parse(a.lastCheckedAt ?? a.createdAt) - Date.parse(b.lastCheckedAt ?? b.createdAt)).slice(0, 3)
      let checked = 0, failed = 0
      for (const row of pending) {
        try { await this.check(actor, row.paymentId); checked++ } catch { failed++ }
      }
      const refunds = await moneyOut.syncOwner(owner.accountId, owner.userId)
      checked += refunds.checked; failed += refunds.failed
      return { checked, failed }
    },
    async options(actor: PaymentActor, query: any) {
      const target = parseTarget(query), current = await charge(actor, target)
      const rows = await store.load(), active = rows.find(row => row.accountId === Number(actor.accountId) && row.kind === target.kind
        && row.targetId === target.targetId && ['Creating', 'Active', 'Review'].includes(row.state))
      const demoWalletEnabled = config.enabled && config.secretKey?.startsWith('xnd_development_')
      return { enabled: true, isSample: true, localPreview: true, demoWalletEnabled, demoAccounts: demoWalletEnabled ? demoWalletAccounts : [], paymentAllowed: current.allowed, balanceCentavos: Number(current.balance), methods, active: active ? publicRow(active) : null }
    },
    quote(actor: PaymentActor, body: unknown) { return locked(async () => {
      const input = parseQuote(body)
      await moneyOut.guard(input.kind, input.targetId)
      const current = await charge(actor, input)
      if (!current.allowed) throw paymentError('Return the overdue book or ask the library to confirm this charge first.')
      if (input.amount !== null && input.kind !== 'Fine') throw paymentError('Printing and replacement bills require the full amount.')
      const principal = input.amount ?? current.balance
      if (principal > current.balance || !methods.some(method => method.channelCode === input.channelCode)) throw paymentError('Choose a valid amount and payment method.')
      const { fee, total } = feeTotal(principal, { fixed: 100n, percentage: 100, tax: 0 })
      const rows = await store.load(), now = new Date(), row: Attempt = { paymentId: randomUUID(), accountId: Number(actor.accountId), userId: current.userId,
        kind: input.kind, targetId: input.targetId, channelCode: input.channelCode, principalCentavos: Number(principal), feeCentavos: Number(fee),
        totalCentavos: Number(total), balanceCentavos: Number(current.balance), state: 'Quoted', createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 30 * 60000).toISOString() }
      if (row.totalCentavos < 100 || row.totalCentavos > 1000000) throw paymentError('Choose a total between PHP 1 and PHP 10,000.')
      // Only expired, never-submitted quotes are disposable. Keep provider evidence.
      await store.save([...rows.filter(row => row.state !== 'Quoted' || Date.parse(row.expiresAt) > now.getTime()), row])
      return publicRow(row)
    }) },
    async demoCheckout(actor: PaymentActor, body: unknown) {
      requireDemoWalletConfig(config)
      verifyDemoWallet(body)
      return this.checkout(actor, body, true)
    },
    checkout(actor: PaymentActor, body: unknown, demo = false) { return locked(async () => {
      if (demo) { requireDemoWalletConfig(config); verifyDemoWallet(body) }
      const fields = body as { quoteId?: unknown; requestKey?: unknown }
      const input = parseCheckout(demo ? { quoteId: fields.quoteId, requestKey: fields.requestKey } : body), rows = await store.load(), row = await owned(actor, input.quoteId, rows)
      if (demo && row.channelCode !== 'GCASH') throw paymentError('Choose GCash for the demo wallet.')
      if (rows.some(other => other.paymentId !== row.paymentId && other.accountId === row.accountId && other.requestKey === input.requestKey)) throw paymentError('Review this checkout again.', 'PAYMENT_RETRY_CONFLICT', 409)
      if (row.requestKey && row.requestKey !== input.requestKey) throw paymentError('Use the original checkout request.', 'PAYMENT_RETRY_CONFLICT', 409)
      if (row.state !== 'Quoted') return publicRow(row)
      if (Date.parse(row.expiresAt) <= Date.now()) throw paymentError('Review the payment again.', 'PAYMENT_QUOTE_EXPIRED', 409)
      if (rows.some(other => other.paymentId !== row.paymentId && other.accountId === row.accountId && other.kind === row.kind
        && other.targetId === row.targetId && ['Creating', 'Active', 'Review'].includes(other.state))) throw paymentError('Check the existing payment first.', 'PAYMENT_ALREADY_ACTIVE', 409)
      const current = await charge(actor, row)
      await moneyOut.guard(row.kind, row.targetId)
      if (!current.allowed || Number(current.balance) !== row.balanceCentavos) throw paymentError('The balance changed. Review it again.', 'PAYMENT_QUOTE_CHANGED', 409)
      row.requestKey = input.requestKey; row.state = 'Creating'; row.demoWallet = demo; await store.save(rows)
      try {
        const returnUrl = paymentReturnUrl(config.returnUrl, row.paymentId)
        const session = await provider.createSession({ reference_id: paymentReference(row.paymentId), session_type: 'PAY', mode: 'PAYMENT_LINK', country: 'PH', currency: 'PHP',
          amount: row.totalCentavos / 100, capture_method: 'AUTOMATIC', allow_save_payment_method: 'DISABLED', allowed_payment_channels: [row.channelCode],
          expires_at: row.expiresAt, metadata: { environment: 'test', library_payment_id: row.paymentId }, description: 'Library payment',
          ...(returnUrl ? { success_return_url: returnUrl, cancel_return_url: returnUrl } : {}),
          customer: { reference_id: 'Sandbox' + row.paymentId.replaceAll('-', ''), type: 'INDIVIDUAL', individual_detail: { given_names: 'Sandbox', surname: 'Payer' } } })
        row.providerSessionId = session.payment_session_id; row.businessId = session.business_id
        verifySession(session, evidence(row)); row.checkoutUrl = checkoutUrl(session.payment_link_url); row.state = 'Active'
      } catch { row.state = 'Review'; row.reviewCode = 'PAYMENT_CREATION_UNCERTAIN' }
      await store.save(rows); return publicRow(row)
    }) },
    read(actor: PaymentActor, id: unknown) { return store.load().then(async rows => decorated(await owned(actor, id, rows))) },
    check(actor: PaymentActor, id: unknown, cancel = false) { return locked(async () => {
      const rows = await store.load(), row = await owned(actor, id, rows)
      if (!row.providerSessionId || ['Succeeded', 'Cancelled', 'Expired'].includes(row.state)) return decorated(row)
      let session = await provider.getSession(row.providerSessionId)
      verifySession(session, evidence(row))
      if (cancel && session.status === 'ACTIVE') { await provider.cancelSession(row.providerSessionId); session = await provider.getSession(row.providerSessionId); verifySession(session, evidence(row)) }
      if (session.status === 'COMPLETED') {
        if (!session.payment_id) throw paymentError('Payment confirmation is still pending.')
        verifyCapturedPayment(await provider.getPayment(session.payment_id), session, evidence(row))
        for (const prior of rows) if (prior.state === 'Succeeded' && prior.appliedPrincipalCentavos === undefined) prior.appliedPrincipalCentavos = appliedAmounts(rows).get(prior.paymentId) ?? 0
        row.appliedPrincipalCentavos = Math.min(row.principalCentavos, Number((await charge(actor, row)).balance))
        row.providerPaymentId = session.payment_id
        row.state = 'Succeeded' // Local bill views use this verified credit; school financial tables remain unchanged.
      } else row.state = ({ ACTIVE: 'Active', CANCELED: 'Cancelled', EXPIRED: 'Expired' } as Record<string, Attempt['state']>)[session.status]
      row.lastCheckedAt = new Date().toISOString()
      await store.save(rows); return decorated(row)
    }).then(async result => {
      // The checkout lock has been released before refund reconciliation acquires it.
      if (result.refunds.some(refund => ['Processing','Review'].includes(refund.state) || refund.state === 'Succeeded' && refund.rail === 'Transfer')) {
        const owner = await currentOwner(actor)
        await moneyOut.syncOwner(owner.accountId, owner.userId)
        return decorated(await owned(actor,id,await store.load()))
      }
      return result
    }) },
    async transactionRows(actor: PaymentActor) {
      const owner = await currentOwner(actor)
      return Promise.all((await store.load()).filter(row => row.accountId === owner.accountId && row.userId === owner.userId && row.state !== 'Quoted').map(async row => ({
        id: 'Test:' + row.paymentId, channel: 'Online', kind: row.kind, description: row.kind === 'Printing' ? 'Printing payment' : row.kind === 'LostBook' ? 'Replacement charge' : 'Library fine payment', reference: 'PAY-' + row.paymentId.slice(0, 8).toUpperCase(),
        method: row.channelCode, status: row.state, occurred_at: row.createdAt, amount_centavos: row.totalCentavos,
        principal_centavos: row.principalCentavos, fee_centavos: row.feeCentavos, receipt_id: null, payment: await decorated(row),
      })))
    },
  }
}

function configuredPreview() {
  if (process.env.LOCAL_PAYMENT_PREVIEW !== 'true' || process.env.NODE_TEST_CONTEXT) return null
  if (env.isProduction || process.env.VERCEL || env.webOrigin !== 'http://localhost:5173') throw new Error('Local Test checkout is only available on localhost.')
  const settings = dotenv.parse(readFileSync(new URL('../../../.env.xendit-sandbox', import.meta.url)))
  const config = readXenditSandboxConfig(settings)
  const localReturnUrl = settings.XENDIT_LOCAL_RETURN_URL?.trim()
  const payoutFee = settings.XENDIT_LOCAL_PAYOUT_FEE_CENTAVOS
  return createLocalPaymentPreview(config.enabled && localReturnUrl ? { ...config, returnUrl: localReturnUrl } : config, db, privateStore, createXenditClient(() => config), {
    refundsEnabled: settings.XENDIT_LOCAL_REFUNDS_ENABLED === 'true', payoutsEnabled: settings.XENDIT_LOCAL_PAYOUTS_ENABLED === 'true',
    payoutFeeCentavos: payoutFee && /^\d{1,7}$/.test(payoutFee) ? Number(payoutFee) : null,
  })
}
export const localPaymentPreview = configuredPreview()
