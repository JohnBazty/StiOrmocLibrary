import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { createPracticeFunds, fundsAccounting, publicPracticeTransfer, readCashCollections } from './practice-funds.ts'
import { PGlite } from '@electric-sql/pglite'
import { emptyFunds, type Beneficiary } from './money-out.rules.ts'

const actor = { accountId: 1, role: 'Librarian' }
function fixture() {
  let ledger = emptyFunds(), now = Date.now(), queue = Promise.resolve<unknown>(undefined)
  const bank: Beneficiary = { id: randomUUID(), type: 'SchoolBank', label: 'Approved school bank', active: true,
    verifiedBy: 1, verifiedAt: new Date(now).toISOString(), evidence: 'School authorization',
    recipient: { account_details: { account_holder_name: 'School library', account_number: '1234567890', routing_value_1: 'BNORPHMM' } } }
  ledger.beneficiaries.push(bank)
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
  const draft = (direction = 'Withdrawal', amount = '50', key = randomUUID()) => service.draft(actor, { direction, amount, reason: 'Approved practice transfer', requestKey: key, ...(direction === 'TopUp' ? { beneficiaryId: bank.id,transferReference:key,transferredAt:new Date(now).toISOString() } : {}) })
  return { service, draft, bank, ledger: () => ledger, attempts, expire: () => { now += 16 * 60_000 }, restart: () => createPracticeFunds(deps) }
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
    assert.match(sql, /^SELECT/); assert.equal((sql.match(/receipt_status='Issued'/g) ?? []).length, 3)
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
      CREATE TABLE library_service_cash_payments(amount_paid numeric,receipt_status text);
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
  const [a, b] = await Promise.all([f.service.confirm(actor, row.id,{confirmed:true,verificationNote:'School funding reference checked'}), f.restart().confirm(actor, row.id)])
  assert.equal(a.state, 'Succeeded'); assert.equal(b.state, 'Succeeded')
  assert.equal(a.balanceAfterCentavos, 4500)
  assert.equal(f.ledger().practiceTransfers?.length, 1)
  assert.equal(fundsAccounting(f.attempts, f.ledger(), 99999).availableCentavos, 4500)
})
test('top-up increases funds but never student collections; confirmation and actor are required', async () => {
  const f = fixture(), row = await f.draft('TopUp', '20')
  assert.equal(fundsAccounting(f.attempts, f.ledger(), 0).availableCentavos, 10000)
  await assert.rejects(f.service.confirm({ ...actor, accountId: 2 }, row.id), /administrator/i)
  await f.service.confirm(actor, row.id,{confirmed:true,verificationNote:'School funding reference checked'})
  const result = fundsAccounting(f.attempts, f.ledger(), 0)
  assert.equal(result.availableCentavos, 12000)
  assert.equal(result.totalCollectionsCentavos, 10000)
  assert.equal(result.topUpsCentavos, 2000)
})
test('bank additions require an active school source and retain only masked provenance publicly', async () => {
  const f = fixture(), body = { direction: 'TopUp', amount: '20', transferReference:'BANK-TEST-123',transferredAt:new Date().toISOString(), reason: 'School approved funding', requestKey: randomUUID() }
  await assert.rejects(f.service.draft(actor, body), /school bank/i)
  await assert.rejects(f.service.draft(actor, { ...body, beneficiaryId: randomUUID() }), /school bank/i)
  f.bank.type = 'StudentRefund'
  await assert.rejects(f.service.draft(actor, { ...body, beneficiaryId: f.bank.id }), /school bank/i)
  f.bank.type = 'SchoolBank'
  const row = await f.service.draft(actor, { ...body, beneficiaryId: f.bank.id })
  assert.match(row.destination, /7890/)
  assert.doesNotMatch(JSON.stringify(row), /1234567890|sourceBankFingerprint/)
  assert.equal((await f.service.draft(actor, { ...body, beneficiaryId: f.bank.id })).id, row.id)
  await assert.rejects(f.service.draft(actor, { ...body, beneficiaryId: randomUUID() }), /already used/i)
  f.ledger().beneficiaries[0].recipient.account_details.account_number = '9876547890'
  await assert.rejects(f.service.confirm(actor, row.id,{confirmed:true,verificationNote:'School funding reference checked'}), /bank.*changed/i)
  assert.equal(f.ledger().practiceTransfers?.[0].state, 'Draft')
  f.ledger().beneficiaries[0].recipient.account_details.account_number = '1234567890'; f.ledger().beneficiaries[0].active = false
  await assert.rejects(f.service.confirm(actor, row.id,{confirmed:true,verificationNote:'School funding reference checked'}), /bank.*changed/i)
})
test('legacy completed bank additions keep their amount without inventing a bank source', async () => {
  const f = fixture(), row = await f.draft('TopUp', '20')
  await f.service.confirm(actor, row.id,{confirmed:true,verificationNote:'School funding reference checked'})
  const saved = f.ledger().practiceTransfers![0]
  delete saved.sourceBank; delete saved.sourceBankFingerprint
  const legacy = await f.service.confirm(actor, row.id,{confirmed:true,verificationNote:'School funding reference checked'})
  assert.equal(legacy.state, 'Succeeded'); assert.match(legacy.destination, /not recorded/i)
  assert.equal(fundsAccounting(f.attempts, f.ledger(), 0).topUpsCentavos, 2000)
})
test('bank funding requires evidence review and never credits the same bank reference twice', async()=>{
  const f=fixture(),key=randomUUID(),body={direction:'TopUp',amount:'20',reason:'School funding for library operations',requestKey:key,beneficiaryId:f.bank.id,transferReference:'BANK-REFERENCE-123',transferredAt:new Date().toISOString()}
  await assert.rejects(f.service.draft(actor,{...body,transferredAt:'2099-01-01T00:00:00Z'}),/date/)
  const row=await f.service.draft(actor,body)
  await assert.rejects(f.service.confirm(actor,row.id),{code:'FUNDS_VERIFICATION_REQUIRED'})
  await assert.rejects(f.service.confirm(actor,row.id,{confirmed:true,verificationNote:'short'}),/verified/)
  assert.equal(fundsAccounting(f.attempts,f.ledger(),0).topUpsCentavos,0)
  await assert.rejects(f.service.draft(actor,{...body,requestKey:randomUUID()}),{code:'FUNDS_DUPLICATE_REFERENCE'})
  const [a,b]=await Promise.all([f.service.confirm(actor,row.id,{confirmed:true,verificationNote:'School authorization and bank reference checked'}),f.service.confirm(actor,row.id,{confirmed:true,verificationNote:'School authorization and bank reference checked'})])
  assert.equal(a.state,'Succeeded');assert.equal(b.state,'Succeeded')
  assert.equal(fundsAccounting(f.attempts,f.ledger(),0).topUpsCentavos,2000)
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
  assert.equal((await f.service.confirm(actor, row.id,{confirmed:true,verificationNote:'School funding reference checked'})).state, 'Cancelled')
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
