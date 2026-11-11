import assert from 'node:assert/strict'
import test from 'node:test'
import { centavos, feeTotal, parseQuote, parseCheckout, parseFeeRule } from './payments.validation.ts'

test('payment amounts use exact centavos and reject ambiguous or excessive values', () => {
  assert.equal(centavos('100.01'), 10001n)
  assert.equal(centavos(0.1), 10n)
  for (const value of ['1e2', '1.001', '-1', '0', '', null, true, '10000000000.00']) {
    assert.throws(() => centavos(value))
  }
})

test('fees round half up without floating point drift and keep principal separate', () => {
  assert.deepEqual(feeTotal(1050n, { fixed: 100n, percentage: 100, tax: 1200 }), {
    principal: 1050n, fee: 124n, total: 1174n,
  })
  assert.deepEqual(feeTotal(4000n, { fixed: 100n, percentage: 100, tax: 0 }), {
    principal: 4000n, fee: 140n, total: 4140n,
  })
})

test('quote requests reject injected totals and another owner supplied in the body', () => {
  assert.equal(parseQuote({kind:'Fine',targetId:1,channelCode:'GCASH',amount:'40'}).amount, 4000n)
  for (const extra of [{userId:2}, {total:1}, {fee:0}, {environment:'live'}]) {
    assert.throws(() => parseQuote({kind:'Printing',targetId:1,channelCode:'GCASH',...extra}))
  }
  assert.throws(() => parseQuote({kind:'Fine',targetId:'1 OR 1=1',channelCode:'GCASH'}))
})

test('checkout preparation requires a quote UUID and an explicit retry key', () => {
  const id = '00000000-0000-4000-8000-000000000001'
  assert.equal(parseCheckout({quoteId:id,requestKey:'retry-123'}).quoteId,id)
  assert.throws(() => parseCheckout({quoteId:'1',requestKey:'retry-123'}))
  assert.throws(() => parseCheckout({quoteId:id,requestKey:'retry-123',amount:'1'}))
})

test('fee rule updates stay in the sandbox and validate bounds', () => {
  const input = {channelCode:'GCASH',displayName:'GCash',fixedFee:'1',percentageBasisPoints:100,
    taxBasisPoints:0,minTotal:'1',maxTotal:'100000',requestKey:'fees-1234'}
  assert.equal(parseFeeRule(input).fixed,100n)
  for (const patch of [{environment:'live'},{percentageBasisPoints:-1},{taxBasisPoints:10001},
    {minTotal:'100',maxTotal:'1'},{isSample:false}]) assert.throws(() => parseFeeRule({...input,...patch}))
})
