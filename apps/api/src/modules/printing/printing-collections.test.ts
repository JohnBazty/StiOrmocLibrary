import assert from 'node:assert/strict'
import test from 'node:test'
import {printingCollectionsSql} from './printing-collections.ts'
test('printing finance uses issued principal once, preserving cash without a receipt',()=>{
  assert.match(printingCollectionsSql(false),/receipt_status='Issued'/)
  assert.match(printingCollectionsSql(false),/NOT EXISTS/)
  assert.doesNotMatch(printingCollectionsSql(false),/online_payment_attempts/)
  assert.match(printingCollectionsSql(true),/provider_payment_id/)
  assert.match(printingCollectionsSql(true),/Asia\/Manila/)
})
