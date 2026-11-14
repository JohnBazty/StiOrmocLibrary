import assert from 'node:assert/strict'
import test from 'node:test'
import { borrowerBalances } from './borrower-balances.ts'
import type { PreviewCredit } from './preview-balances.ts'

const full: PreviewCredit[] = [1, 2].map(targetId => ({kind:'Fine',targetId,principalCentavos:19000,paymentId:'p'+targetId}))
full.push({kind:'LostBook',targetId:3,principalCentavos:5000,paymentId:'loss'})
function fixture() {
  const statements: string[] = []
  const q = {async execute(sql: string, args: unknown[]) {
    statements.push(sql)
    assert.deepEqual(args,[7])
    if (sql.includes('FROM fines f')) return [[{fine_id:1,balance:'190.00'},{fine_id:2,balance:'190.00'}]]
    if (sql.includes('FROM lost_book_reports l')) return [[{lost_book_report_id:3,balance:'50.00'}]]
    throw new Error('Unexpected query')
  }}
  return {q:q as never,statements}
}
test('borrowing balance applies confirmed net principal only to its matching charge',async()=>{
  const f=fixture()
  assert.equal((await borrowerBalances(f.q,7,full)).totalCentavos,0)
  assert.equal((await borrowerBalances(f.q,7,full.slice(0,1))).totalCentavos,24000)
  assert.equal((await borrowerBalances(f.q,7,[{...full[0],principalCentavos:5000}])).totalCentavos,38000)
  assert.equal((await borrowerBalances(f.q,7,[{...full[0],principalCentavos:999999}])).totalCentavos,24000)
  assert.equal((await borrowerBalances(f.q,7,[{...full[0],targetId:99},{...full[0],kind:'Printing'}])).totalCentavos,43000)
  assert.ok(f.statements.every(sql=>/^SELECT/.test(sql)))
})
test('a restore refund reopens the balance, while a confirmed charge cancellation closes only that part',async()=>{
  const f=fixture(),refunded=full.map(row=>row.targetId===1?{...row,principalCentavos:14000}:row)
  assert.equal((await borrowerBalances(f.q,7,refunded)).totalCentavos,5000)
  assert.equal((await borrowerBalances(f.q,7,[...refunded,{...full[0],principalCentavos:5000,voided:true}])).totalCentavos,0)
})
