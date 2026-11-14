import assert from 'node:assert/strict'
import test from 'node:test'
import { createLocalPaymentPreview } from './payments.preview.ts'
import type { XenditSandboxConfig } from '../../config/xendit-sandbox.ts'

test('local Test quotes are exact, owner scoped, and perform no financial database writes', async () => {
  const statements: string[] = [], rows: any[] = []
  const connection = { beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {},
    async execute(sql: string) { statements.push(sql); return [sql.includes('FROM accounts') ? [{ user_id: 4, role: 'Student' }] : [{ assessed: '100', paid: '0', adjusted: '0', status: 'Unpaid', accruing: false }]] } }
  const database = { getConnection: async () => connection } as never
  const preview = createLocalPaymentPreview({ enabled: true, mode: 'test' } as XenditSandboxConfig, database,
    { load: async () => structuredClone(rows), save: async value => { rows.splice(0, rows.length, ...structuredClone(value)) } }, {} as never)
  const quote = await preview.quote({ accountId: 7, role: 'Student' }, { kind: 'Fine', targetId: 1, channelCode: 'GCASH', amount: '40' })
  assert.equal(quote.totalCentavos, 4140); assert.equal(quote.feeCentavos, 140)
  assert.equal(quote.remainingCentavos, 10000, 'The real balance is deliberately unchanged')
  assert.equal(quote.receiptId, null)
  await assert.rejects(preview.read({ accountId: 8, role: 'Student' }, quote.paymentId))
  assert.ok(statements.every(sql => /^\s*SELECT/i.test(sql)))
})

function fixture(failCreation = false, returnUrl: string | null = null, refundsEnabled = false) {
  const statements: string[] = [], rows: any[] = []
  const connection = { beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {},
    async execute(sql: string) { statements.push(sql); return [sql.includes('a.account_status,u.account_status') ? [{role:'Librarian',account_status:'Active',user_status:'Active'}] : sql.includes('FROM accounts') ? [{ user_id: 4, role: 'Student' }] : [{ assessed: '100', paid: '0', adjusted: '0', status: 'Unpaid', accruing: false }]] } }
  let calls = 0, session: any, refund: any, refundState = 'PENDING'
  const provider = {
    async createSession(body: any) {
      calls++
      if (failCreation) throw new Error('Uncertain response')
      session = { ...body, payment_session_id: 'ps-' + 'a'.repeat(24), business_id: 'sandbox-business', status: 'ACTIVE', payment_link_url: 'https://dev.xen.to/test-checkout' }
      return session
    },
    async getSession() { return session },
    async cancelSession() { session.status = 'CANCELED'; return session },
    async getPayment() { return { payment_id: session.payment_id, business_id: session.business_id, payment_request_id: 'pr-test', type: 'PAY', country: 'PH', currency: 'PHP', status: 'SUCCEEDED', capture_method: 'AUTOMATIC', channel_code: session.allowed_payment_channels[0], request_amount: session.amount, captures: [{ capture_id: 'capture-test', capture_amount: session.amount }] } },
    async createRefund(body:any) { refund={...body,refund_id:'rfd-00000000-0000-4000-8000-000000000001',business_id:session.business_id,currency:'PHP',channel_code:'GCASH',status:refundState};return refund },
    async getRefund() { return {...refund,status:refundState} },
  }
  const preview = createLocalPaymentPreview({ enabled: true, mode: 'test', returnUrl } as XenditSandboxConfig, { getConnection: async () => connection } as never,
    { load: async () => structuredClone(rows), save: async value => { rows.splice(0, rows.length, ...structuredClone(value)) } }, provider,{refundsEnabled})
  return { preview, rows, statements, calls: () => calls, session: () => session,refundState:(state:string)=>{refundState=state} }
}
const actor = { accountId: 7, role: 'Student' }
const input = { kind: 'Fine', targetId: 1, channelCode: 'GCASH', amount: '40' }

test('payment details refresh reconciles an owner refund after releasing the checkout lock',async()=>{
  const f=fixture(false,null,true),quote=await f.preview.quote(actor,input)
  await f.preview.checkout(actor,{quoteId:quote.paymentId,requestKey:'refund-refresh'})
  Object.assign(f.session(),{status:'COMPLETED',payment_id:'py-test',payment_request_id:'pr-test'})
  await f.preview.check(actor,quote.paymentId)
  const admin={accountId:1,role:'Librarian'}
  const draft=await f.preview.moneyOut.draftRefund(admin,quote.paymentId,{amount:'40',decision:'Restore',reason:'Borrower requested a refund',requestKey:'00000000-0000-4000-8000-000000000001'})
  await f.preview.moneyOut.submit(admin,draft.id);f.refundState('SUCCEEDED')
  const result=await f.preview.check(actor,quote.paymentId)
  assert.equal(result.state,'Succeeded');assert.equal(result.refundStatus,'Refunded')
  assert.equal((await f.preview.options(actor,{kind:'Fine',targetId:1})).balanceCentavos,10000)
})

test('duplicate Test submissions create one provider session; capture leaves the school balance and receipts untouched', async () => {
  const f = fixture(), quote = await f.preview.quote(actor, input)
  const body = { quoteId: quote.paymentId, requestKey: 'same-checkout' }
  const [first, retry] = await Promise.all([f.preview.checkout(actor, body), f.preview.checkout(actor, body)])
  assert.equal(first.state, 'Active'); assert.equal(retry.paymentId, first.paymentId); assert.equal(f.calls(), 1)
  await assert.rejects(f.preview.checkout({ accountId: 8, role: 'Student' }, body))
  const second = await f.preview.quote(actor, input)
  await assert.rejects(f.preview.checkout(actor, { quoteId: second.paymentId, requestKey: 'different-checkout' }))
  Object.assign(f.session(), { status: 'COMPLETED', payment_id: 'py-test', payment_request_id: 'pr-test' })
  const completed = await f.preview.check(actor, first.paymentId)
  assert.equal(completed.state, 'Succeeded'); assert.equal(completed.localPreview, true)
  assert.equal(completed.remainingCentavos, 6000); assert.equal(completed.receiptId, null)
  assert.equal((await f.preview.options(actor, { kind: 'Fine', targetId: 1 })).balanceCentavos, 6000)
  assert.ok(f.statements.every(sql => /^\s*SELECT/i.test(sql)))
  assert.equal((await f.preview.transactionRows({ accountId: 8, role: 'Student' })).length, 0)
})

test('uncertain creation never retries; mismatched provider evidence never becomes successful', async () => {
  const uncertain = fixture(true), quote = await uncertain.preview.quote(actor, input)
  const body = { quoteId: quote.paymentId, requestKey: 'uncertain-checkout' }
  assert.equal((await uncertain.preview.checkout(actor, body)).state, 'Review')
  await uncertain.preview.checkout(actor, body); assert.equal(uncertain.calls(), 1)
  const f = fixture(), validQuote = await f.preview.quote(actor, input)
  await f.preview.checkout(actor, { quoteId: validQuote.paymentId, requestKey: 'valid-checkout' })
  f.session().amount = 999
  await assert.rejects(f.preview.check(actor, validQuote.paymentId))
  assert.equal((await f.preview.read(actor, validQuote.paymentId)).state, 'Active')
  await assert.rejects(f.preview.quote(actor, { ...input, kind: 'Printing' }))
})

test('Test cancellation preserves history and a request key cannot be reused for another bill', async () => {
  const f = fixture(), quote = await f.preview.quote(actor, input)
  await f.preview.checkout(actor, { quoteId: quote.paymentId, requestKey: 'cancel-test' })
  assert.equal((await f.preview.check(actor, quote.paymentId, true)).state, 'Cancelled')
  const second = await f.preview.quote(actor, { ...input, targetId: 2 })
  await assert.rejects(f.preview.checkout(actor, { quoteId: second.paymentId, requestKey: 'cancel-test' }))
  const transaction = (await f.preview.transactionRows(actor))[0]
  assert.equal(transaction.status, 'Cancelled')
  assert.match(transaction.reference, /^PAY-/)
  assert.equal(transaction.description, 'Library fine payment')
  assert.equal(f.calls(), 1)
})

test('new provider sessions return to configured confirmation with no claimed paid status', async () => {
  const f = fixture(false, 'https://return.example/payments/result'), quote = await f.preview.quote(actor, input)
  await f.preview.checkout(actor, { quoteId: quote.paymentId, requestKey: 'redirect-checkout' })
  const expected = 'https://return.example/payments/result?payment=' + quote.paymentId
  assert.equal(f.session().success_return_url, expected)
  assert.equal(f.session().cancel_return_url, expected)
  assert.equal(f.session().metadata.environment, 'test')
  assert.ok(!expected.includes('status=paid'))
  assert.equal((await f.preview.read(actor, quote.paymentId)).state, 'Active')
  assert.throws(() => fixture(false, 'http://localhost:5173/payments/result'))
})

test('verified full payment disables new checkout; fees and cancelled attempts never reduce the bill', async () => {
  const f = fixture(), quote = await f.preview.quote(actor, { kind: 'Fine', targetId: 1, channelCode: 'GCASH' })
  await f.preview.checkout(actor, { quoteId: quote.paymentId, requestKey: 'full-payment' })
  assert.equal((await f.preview.options(actor, { kind: 'Fine', targetId: 1 })).balanceCentavos, 10000)
  Object.assign(f.session(), { status: 'COMPLETED', payment_id: 'py-test', payment_request_id: 'pr-test' })
  await f.preview.check(actor, quote.paymentId)
  const options = await f.preview.options(actor, { kind: 'Fine', targetId: 1 })
  assert.equal(options.balanceCentavos, 0); assert.equal(options.paymentAllowed, false)
  await assert.rejects(f.preview.quote(actor, input))
  const credits = await f.preview.credits(actor)
  assert.equal(credits[0].principalCentavos, 10000)
  assert.equal(quote.totalCentavos, 10200, 'Provider fee is not bill principal')
  assert.equal((await f.preview.credits({ accountId: 8, role: 'Student' })).length, 0)
  await assert.rejects(f.preview.credits({ accountId: 7, role: 'Librarian' }))
  assert.ok(f.statements.every(sql => /^\s*SELECT/i.test(sql)))
})

test('refresh sync verifies only the signed-in borrower’s pending payments and keeps failures unpaid', async () => {
  const f = fixture(), quote = await f.preview.quote(actor, input)
  await f.preview.checkout(actor, { quoteId: quote.paymentId, requestKey: 'sync-payment' })
  Object.assign(f.session(), { status: 'COMPLETED', payment_id: 'py-test', payment_request_id: 'pr-test' })
  assert.equal((await f.preview.sync({ accountId: 8, role: 'Student' })).checked, 0)
  assert.equal((await f.preview.read(actor, quote.paymentId)).state, 'Active')
  assert.equal((await f.preview.sync(actor)).checked, 1)
  assert.equal((await f.preview.read(actor, quote.paymentId)).state, 'Succeeded')
  assert.equal((await f.preview.sync(actor)).checked, 0)
})
