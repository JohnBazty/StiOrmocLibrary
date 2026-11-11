import assert from 'node:assert/strict'
import test from 'node:test'
import { paymentReportSql, paymentReportMetrics,onlineReconciliationSql } from './payment-report.ts'

test('printing reports use receipts once and retain historical cash rows without double counting',()=>{
  const sql=paymentReportSql('printRevenue',false)
  assert.match(sql,/NOT EXISTS/)
  assert.match(sql,/print_payment_receipts/)
  assert.match(sql,/historical_entry/)
  assert.doesNotMatch(sql,/online_payment_attempts/)
  assert.match(paymentReportSql('payments',true),/provider_payment_id/)
  assert.match(paymentReportSql('payments',true),/Asia\/Manila/)
})

test('principal and fees total separately and reversed records do not count',()=>{
  const metrics=paymentReportMetrics([
    {status:'Issued',principal:'40.00',transaction_fee:'1.40',gross:'41.40'},
    {status:'Reversed',principal:'9.00',transaction_fee:'0',gross:'9.00'},
    {status:'Issued',principal:'0.10',transaction_fee:'0.01',gross:'0.11'},
  ])
  assert.deepEqual(metrics,{principal:40.1,transaction_fees:1.41,gross:41.51,processing_cost:0,net_settled:0,settlements_recorded:0})
})

test('reconciliation includes captured exceptions even when no receipt was issued',()=>{
  assert.match(onlineReconciliationSql,/captured_needing_review/)
  assert.match(onlineReconciliationSql,/FROM online_payment_attempts/)
  assert.doesNotMatch(onlineReconciliationSql,/JOIN .*payment_receipts/)
})
