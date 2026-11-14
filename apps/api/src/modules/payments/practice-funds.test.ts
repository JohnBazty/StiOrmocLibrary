import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { createPracticeFunds, fundsAccounting, publicPracticeTransfer, readCashCollections } from './practice-funds.ts'
import { PGlite } from '@electric-sql/pglite'
import { emptyFunds } from './money-out.rules.ts'

const actor = { accountId: 1, role: 'Librarian' }
function fixture() {
  let ledger = emptyFunds(), now = Date.now(), queue = Promise.resolve<unknown>(undefined)
  const attempts = [{ state: 'Succeeded', totalCentavos: 10000 }]
  const deps: Parameters<typeof createPracticeFunds>[0] = {
    allowWithdrawals: true,
    funds: { load: async () => structuredClone(ledger), save: async value => { ledger = structuredClone(value) } },
    attempts: { load: async () => attempts },
    admin: async (identity: typeof actor) => { if (identity.role !== 'Librarian') throw new Error('Forbidden'); return Number(identity.accountId) },
    locked<T>(run: () => Promise<T>) { const next = queue.then(run); queue = next.catch(() => undefined); return next },
    now: () => now,
  }
  const service = createPracticeFunds(deps)
  const draft = (direction = 'Withdrawal', amount = '50', key = randomUUID()) => service.draft(actor, { direction, amount, reason: 'Approved practice transfer', requestKey: key })
  return { service, draft, ledger: () => ledger, attempts, expire: () => { now += 16 * 60_000 }, restart: () => createPracticeFunds(deps) }
}

test('collections separate cash, online funds and top-ups; only successful online money is withdrawable', () => {
  const ledger = emptyFunds()
  const result = fundsAccounting([{ state: 'Succeeded', totalCentavos: 10000 }, { state: 'Active', totalCentavos: 90000 }], ledger, 20000)
  assert.equal(result.totalCollectionsCentavos, 30000)
  assert.equal(result.cashCollectedCentavos, 20000)
  assert.equal(result.availableCentavos, 10000)
})
test('ordinary local funds service refuses new simulated withdrawals',async()=>{
  const service=createPracticeFunds({funds:{load:async()=>emptyFunds(),save:async()=>{}},attempts:{load:async()=>[]},admin:async()=>1,locked:run=>run()})
  await assert.rejects(service.draft(actor,{direction:'Withdrawal',amount:'1',reason:'Old local withdrawal',requestKey:randomUUID()}),/use Xendit/i)
})
test('cash totals read issued Cash receipts only, exclude gateway receipts and never write school records', async () => {
  let released = false
  const database = { getConnection: async () => ({ release() { released = true }, execute: async (sql: string) => {
    assert.match(sql, /^SELECT/); assert.equal((sql.match(/receipt_status='Issued'/g) ?? []).length, 2)
    assert.equal((sql.match(/payment_method='Cash'/g) ?? []).length, 2)
    assert.match(sql, /UNION ALL/); assert.match(sql, /<>\'Xendit\'/)
    return [[{ cash_centavos: '12500' }]]
  } }) }
  assert.equal(await readCashCollections(database as never), 12500); assert.equal(released, true)
})
test('Postgres totals count each valid counter receipt once and remove reversals', async () => {
  const sql = new PGlite()
  try {
    await sql.exec(`CREATE TABLE fine_payment_receipts (amount_received numeric,receipt_status text,payment_method text,confirmation_source text);
      CREATE TABLE print_payment_receipts (amount_received numeric,receipt_status text,payment_method text,confirmation_source text);
      INSERT INTO fine_payment_receipts VALUES (12.34,'Issued','Cash','Staff'),(100,'Reversed','Cash','Staff'),(500,'Issued','GCash','Staff'),(800,'Issued','Cash','Xendit');
      INSERT INTO print_payment_receipts VALUES (20.11,'Issued','Cash',NULL),(25,'Issued','Cash','Staff'),(200,'Reversed','Cash','Staff');`)
    const database = { getConnection: async () => ({ release() {}, execute: async (query: string) => [(await sql.query(query)).rows] }) }
    assert.equal(await readCashCollections(database as never), 5745)
    await sql.exec("UPDATE print_payment_receipts SET receipt_status='Reversed' WHERE amount_received=25")
    assert.equal(await readCashCollections(database as never), 3245)
  } finally { await sql.close() }
})
test('withdrawal reviews reserve principal plus fee, confirm once and survive service retries', async () => {
  const f = fixture(), key = randomUUID(), row = await f.draft('Withdrawal', '50', key)
  assert.equal(row.feeCentavos, 500)
  assert.equal(row.balanceAfterCentavos, 4500)
  assert.equal(fundsAccounting(f.attempts, f.ledger(), 99999).availableCentavos, 4500)
  assert.equal((await f.draft('Withdrawal', '50', key)).id, row.id)
  const [a, b] = await Promise.all([f.service.confirm(actor, row.id), f.restart().confirm(actor, row.id)])
  assert.equal(a.state, 'Succeeded'); assert.equal(b.state, 'Succeeded')
  assert.equal(a.balanceAfterCentavos, 4500)
  assert.equal(f.ledger().practiceTransfers?.length, 1)
  assert.equal(fundsAccounting(f.attempts, f.ledger(), 99999).availableCentavos, 4500)
})
test('top-up increases funds but never student collections; confirmation and actor are required', async () => {
  const f = fixture(), row = await f.draft('TopUp', '20')
  assert.equal(fundsAccounting(f.attempts, f.ledger(), 0).availableCentavos, 10000)
  await assert.rejects(f.service.confirm({ ...actor, accountId: 2 }, row.id), /administrator/i)
  await f.service.confirm(actor, row.id)
  const result = fundsAccounting(f.attempts, f.ledger(), 0)
  assert.equal(result.availableCentavos, 12000)
  assert.equal(result.totalCollectionsCentavos, 10000)
  assert.equal(result.topUpsCentavos, 2000)
})
test('parallel requests cannot spend cash or overdraw online funds', async () => {
  const f = fixture()
  const results = await Promise.allSettled([f.draft('Withdrawal', '60'), f.draft('Withdrawal', '60')])
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1)
  await assert.rejects(f.draft('Withdrawal', '100'), /online balance/i)
})
test('retry conflicts, forbidden roles, unexpected input and expired reviews cannot create movements', async () => {
  const f = fixture(), key = randomUUID(), row = await f.draft('Withdrawal', '50', key)
  await assert.rejects(f.draft('TopUp', '50', key), /already used/i)
  await assert.rejects(f.service.draft({ ...actor, role: 'Student' }, {}), /Forbidden/)
  await assert.rejects(f.service.draft(actor, { direction: 'TopUp', amount: '10', reason: 'Approved transfer', requestKey: randomUUID(), fee: 0 }), /details/i)
  f.expire()
  assert.equal(publicPracticeTransfer(f.ledger().practiceTransfers![0], Date.now() + 16 * 60_000).state, 'Cancelled')
  assert.equal((await f.service.confirm(actor, row.id)).state, 'Cancelled')
  assert.equal(fundsAccounting(f.attempts, f.ledger(), 0).availableCentavos, 10000)
})
test('refunds reduce online funds, cancelled reviews release holds and balance is checked again', async () => {
  const f = fixture(), row = await f.draft('Withdrawal', '50')
  await f.service.cancel(actor, row.id)
  assert.equal(fundsAccounting(f.attempts, f.ledger(), 0).availableCentavos, 10000)
  const next = await f.draft('Withdrawal', '50')
  f.attempts[0].state = 'Failed'
  await assert.rejects(f.service.confirm(actor, next.id), /online balance/i)
  const ledger = emptyFunds()
  ledger.operations.push({ type: 'Refund', state: 'Succeeded', total: 2000 } as never)
  assert.equal(fundsAccounting([{ state: 'Succeeded', totalCentavos: 10000 }], ledger, 5000).totalCollectionsCentavos, 13000)
})
