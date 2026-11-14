import assert from 'node:assert/strict'
import test from 'node:test'
import { createLocalPaymentPreview } from './payments.preview.ts'

function fixture(options: { uncertain?: boolean; mismatch?: boolean } = {}) {
  const rows: any[] = [], calls: any[] = [], sql: string[] = []
  let request: any, completed = false
  const q = { async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async execute(statement: string) { sql.push(statement); return [statement.includes('FROM accounts')
      ? [{ user_id: 4, role: 'Student' }] : [{ assessed: '50', paid: '0', adjusted: '0', status: 'Unpaid', accruing: false }]] } }
  const provider = {
    async createSession(body: any) { calls.push(body); if (options.uncertain) throw new Error('timeout'); request = { ...body, business_id: 'business-fixture', payment_session_id: 'ps-' + 'a'.repeat(24), status: 'ACTIVE', payment_link_url: 'https://dev.xen.to/demo' }; return request },
    async getSession() { return { ...request, status: completed ? 'COMPLETED' : 'ACTIVE', payment_id: completed ? 'py-fixture' : null, payment_request_id: 'pr-fixture' } },
    async getPayment() { return { business_id: request.business_id, type: 'PAY', country: 'PH', currency: 'PHP', channel_code: 'GCASH', capture_method: 'AUTOMATIC', request_amount: request.amount, payment_request_id: 'pr-fixture', payment_id: 'py-fixture', status: 'SUCCEEDED', captures: [{ capture_id: 'capture-fixture', capture_amount: options.mismatch ? 1 : 51.5 }] } },
  }
  const preview = createLocalPaymentPreview({ enabled: true, mode: 'test', secretKey: 'xnd_development_fixture' } as never,
    { getConnection: async () => q } as never, { load: async () => structuredClone(rows), save: async value => { rows.splice(0, rows.length, ...structuredClone(value)) } }, provider as never)
  return { preview, rows, calls, sql, complete() { completed = true } }
}
const actor = { accountId: 7, role: 'Student' }
const credentials = { number: '09174826315', pin: '4826' }
async function quote(f: ReturnType<typeof fixture>) { return f.preview.quote(actor, { kind: 'Fine', targetId: 1, channelCode: 'GCASH' }) }

test('demo success requires provider capture, refreshes bill credit once, and never persists or forwards credentials', async () => {
  const f = fixture(), quoted = await quote(f)
  const body = { quoteId: quoted.paymentId, requestKey: 'demo-unique-checkout', ...credentials }
  const [a, b] = await Promise.all([f.preview.demoCheckout(actor, body), f.preview.demoCheckout(actor, body)])
  assert.equal(a.state, 'Active'); assert.equal(a.demoWallet, true); assert.equal(b.paymentId, a.paymentId)
  assert.equal(f.calls.length, 1, 'one provider session only'); assert.equal(a.checkoutUrl, 'https://dev.xen.to/demo')
  assert.equal((await f.preview.options(actor, { kind: 'Fine', targetId: 1 })).balanceCentavos, 5000)
  await f.preview.check(actor, a.paymentId)
  assert.equal(f.rows[0].state, 'Active', 'Demo PIN is never final payment proof')
  f.complete()
  assert.equal((await f.preview.check(actor, a.paymentId)).state, 'Succeeded')
  await f.preview.check(actor, a.paymentId)
  assert.equal((await f.preview.options(actor, { kind: 'Fine', targetId: 1 })).balanceCentavos, 0)
  assert.equal((await f.preview.transactionRows(actor)).length, 1)
  for (const text of [JSON.stringify(f.rows), JSON.stringify(f.calls)]) {
    assert.ok(!text.includes(credentials.number)); assert.ok(!text.includes('"pin"'))
  }
  assert.ok(f.sql.every(statement => /^SELECT/i.test(statement)))
})

test('wrong demo credentials, foreign ownership, unexpected input and non-GCash channels never reach provider', async () => {
  const f = fixture(), quoted = await quote(f), body = { quoteId: quoted.paymentId, requestKey: 'demo-rejected', ...credentials }
  await assert.rejects(f.preview.demoCheckout(actor, { ...body, pin: '9999' }))
  await assert.rejects(f.preview.demoCheckout(actor, { ...body, number: '09123456789' }))
  await assert.rejects(f.preview.demoCheckout({ accountId: 8, role: 'Student' }, body))
  await assert.rejects(f.preview.demoCheckout({ accountId: 7, role: 'Staff' }, body))
  await assert.rejects(f.preview.demoCheckout(actor, { ...body, amount: '1' }))
  const qr = await f.preview.quote(actor, { kind: 'Fine', targetId: 1, channelCode: 'QRPH' })
  await assert.rejects(f.preview.demoCheckout(actor, { ...body, quoteId: qr.paymentId }))
  assert.equal(f.calls.length, 0)
})

test('uncertain creation stays held and is never replayed', async () => {
  const f = fixture({ uncertain: true }), quoted = await quote(f), body = { quoteId: quoted.paymentId, requestKey: 'demo-uncertain', ...credentials }
  assert.equal((await f.preview.demoCheckout(actor, body)).state, 'Review')
  await f.preview.demoCheckout(actor, body); assert.equal(f.calls.length, 1)
  assert.equal((await f.preview.options(actor, { kind: 'Fine', targetId: 1 })).balanceCentavos, 5000)
})

test('mismatched capture stays unpaid despite provider success label', async () => {
  const f = fixture({ mismatch: true }), quoted = await quote(f)
  await f.preview.demoCheckout(actor, { quoteId: quoted.paymentId, requestKey: 'demo-mismatch', ...credentials })
  f.complete(); await assert.rejects(f.preview.check(actor, quoted.paymentId))
  assert.equal((await f.preview.options(actor, { kind: 'Fine', targetId: 1 })).balanceCentavos, 5000)
})
