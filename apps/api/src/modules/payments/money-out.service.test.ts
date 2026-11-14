import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { createLocalMoneyOut, netCredits, type LocalAttempt } from './money-out.service.ts'
import { emptyFunds, refundAmounts, type FundsLedger } from './money-out.rules.ts'
import { previewFine, previewPrint } from './preview-balances.ts'

const admin = { accountId: 1, role: 'Librarian' }
function fixture(channel = 'GCASH', kind: LocalAttempt['kind'] = 'Fine') {
  let ledger = emptyFunds(), providerState = 'SUCCEEDED', payoutState = 'SUCCEEDED', fail = false, printed = false, cancelled = false
  let queue = Promise.resolve<unknown>(undefined), refundCalls = 0, payoutCalls = 0
  const statements: string[] = [], refundRows: any[] = [], payoutRows: any[] = []
  const original: LocalAttempt = { paymentId: randomUUID(), accountId: 7, userId: 4, kind, targetId: 3,
    principalCentavos: 10000, feeCentavos: 201, totalCentavos: 10201, balanceCentavos: 10000, channelCode: channel, state: 'Succeeded',
    createdAt: '2026-11-12T00:00:00Z', providerSessionId: 'ps-'+'a'.repeat(24), businessId: 'qa-business' }
  const attempts = [original]
  const q = { beginTransaction: async()=>{}, commit: async()=>{}, rollback: async()=>{}, release(){},
    async execute(sql:string) { statements.push(sql)
      if(sql.includes('confirmed_counter_cash'))return [[{cash_centavos:'2500'}]]
      if(sql.includes('FROM accounts'))return [[{role:'Librarian',account_status:'Active',user_status:'Active'}]]
      if(sql.includes('print_status_history'))return [printed?[{found:1}]:[]]
      return [[{assessed:'100',paid:'0',adjusted:'0',status:'Unpaid',accruing:false,job_status:cancelled?'Cancelled':printed?'Printing':'Pending'}]]
    } }
  const session = { payment_session_id:original.providerSessionId, reference_id:'sti-pay-'+original.paymentId, business_id:original.businessId, payment_id:'py-qa',payment_request_id:'pr-qa',country:'PH',currency:'PHP',session_type:'PAY',mode:'PAYMENT_LINK',amount:102.01,allowed_payment_channels:[channel],status:'COMPLETED' }
  const provider = {
    async getSession(){return session},
    async getPayment(){return {payment_id:'py-qa',business_id:original.businessId,payment_request_id:'pr-qa',type:'PAY',country:'PH',currency:'PHP',status:'SUCCEEDED',capture_method:'AUTOMATIC',channel_code:channel,request_amount:102.01,captures:[{capture_id:'cap-qa',capture_amount:102.01}]}},
    async createRefund(body:any){refundCalls++;const row={...body,refund_id:'rfd-'+randomUUID(),business_id:original.businessId,channel_code:channel,currency:'PHP',status:providerState};refundRows.push(row);if(fail)throw new Error('uncertain');return row},
    async getRefund(id:string){return {...refundRows.find(row=>row.refund_id===id),status:providerState}},
    async listRefunds(){return refundRows.map(row=>({...row,status:providerState}))},
    async createPayout(body:any){payoutCalls++;const row={...body,payout_id:'po-'+randomUUID(),business_id:original.businessId,...body.payout_details,destination_amount:body.payout_details.source_amount,status:payoutState};payoutRows.push(row);if(fail)throw new Error('uncertain');return row},
    async getPayout(id:string){return {...payoutRows.find(row=>row.payout_id===id),status:payoutState}},
    async getBalance(){return {balance:1000}},
  }
  const service = createLocalMoneyOut({database:{getConnection:async()=>q} as never,attempts:{load:async()=>structuredClone(attempts)},
    funds:{load:async()=>structuredClone(ledger),save:async value=>{ledger=structuredClone(value)}},provider:provider as never,
    locked<T>(run:()=>Promise<T>){const next=queue.then(run);queue=next.catch(()=>undefined);return next}, refundsEnabled:true,payoutsEnabled:true,payoutFeeCentavos:150 })
  const draft = (overrides:Record<string,unknown>={})=>service.draftRefund(admin,original.paymentId,{amount:'100',decision:'Restore',reason:'Borrower requested a refund',requestKey:randomUUID(),...overrides})
  const destination = (school=false)=>service.addBeneficiary(admin,{type:school?'SchoolBank':'StudentRefund',...(!school?{paymentId:original.paymentId}:{}),name:school?'QA SCHOOL':'QA Student',accountNumber:'09170000000',bankCode:'BNORPHMM',firstName:'QA',lastName:'Student',street:'QA Street',city:'Ormoc',province:'Leyte',postalCode:'6541',evidence:'QA authorization verified',confirmed:true})
  return {service,original,attempts,draft,destination,statements,ledger:()=>ledger,calls:()=>({refundCalls,payoutCalls}),refundRows,payoutRows,
    providerState:(state:string)=>{providerState=state},payoutState:(state:string)=>{payoutState=state},fail:()=>{fail=true},printed:()=>{printed=true},cancelled:()=>{cancelled=true},provider}
}

test('full refund returns principal and fee once; confirmed credit reopens the fine without school writes',async()=>{
  const f=fixture(),draft=await f.draft()
  assert.equal(draft.totalCentavos,10201)
  await assert.rejects(f.service.guard('Fine',3),/refund|changed/i)
  const [a,b]=await Promise.all([f.service.submit(admin,draft.id),f.service.submit(admin,draft.id)])
  assert.equal(a.state,'Succeeded');assert.equal(b.state,'Succeeded');assert.equal(f.calls().refundCalls,1)
  assert.equal(f.original.state,'Succeeded')
  const credits=await f.service.credits(f.attempts,7,4)
  assert.equal(credits.reduce((sum,row)=>sum+row.principalCentavos,0),0)
  assert.equal((await f.service.decorations(f.original)).refundStatus,'Refunded')
  assert.ok(f.statements.every(sql=>/^SELECT/.test(sql)))
})
test('partial refunds allocate fee cumulatively and cancellation does not masquerade as collected money',async()=>{
  const f=fixture()
  const first=await f.draft({amount:'33.33',decision:'Cancel'});assert.equal(first.feeCentavos,67)
  await f.service.submit(admin,first.id)
  const second=await f.draft({amount:'33.33',decision:'Cancel'});assert.equal(second.feeCentavos,67);await f.service.submit(admin,second.id)
  const last=await f.draft({amount:'33.34',decision:'Cancel'});assert.equal(last.feeCentavos,67);await f.service.submit(admin,last.id)
  const credits=await f.service.credits(f.attempts,7,4)
  const fine=previewFine({fineId:3,lostBookReportId:null,balance:100,paid:0,status:'Unpaid',paymentAllowed:true},credits)
  assert.equal(fine.balance,0);assert.equal(fine.paid,0);assert.equal(fine.status,'Voided')
  assert.equal(f.ledger().operations.reduce((sum,row)=>sum+row.fee,0),201)
  await assert.rejects(f.draft({amount:'0.01'}),/remaining refundable/)
})
test('pending, failure and uncertain submission keep credits; recovery finds the original reference without a second POST',async()=>{
  const f=fixture();f.fail();const draft=await f.draft();const result=await f.service.submit(admin,draft.id)
  assert.equal(result.state,'Review');assert.equal((await f.service.credits(f.attempts,7,4))[0].principalCentavos,10000)
  await assert.rejects(f.draft(),/existing refund/)
  await f.service.submit(admin,draft.id);assert.equal(f.calls().refundCalls,1)
  await f.service.recover();assert.equal(f.ledger().operations[0].state,'Succeeded');assert.equal(f.calls().refundCalls,1)
  const failed=fixture();failed.providerState('FAILED');await failed.service.submit(admin,(await failed.draft()).id)
  assert.equal((await failed.service.decorations(failed.original)).refundableCentavos,10000)
})
test('tampered provider amount or merchant never changes bill credits',async()=>{
  const f=fixture();f.providerState('PENDING');const draft=await f.draft();await f.service.submit(admin,draft.id)
  f.refundRows[0].amount=500;f.providerState('SUCCEEDED')
  const checked=await f.service.check(admin,draft.id)
  assert.equal(checked.state,'Review');assert.equal((await f.service.credits(f.attempts,7,4))[0].principalCentavos,10000)
})
test('duplicate request keys preserve immutable details; other roles cannot read, draft, or confirm',async()=>{
  const f=fixture(),key=randomUUID(),draft=await f.draft({requestKey:key})
  assert.equal((await f.draft({requestKey:key})).id,draft.id)
  await assert.rejects(f.draft({requestKey:key,amount:'99'}),/already used/)
  for(const role of ['Student','Faculty','Staff','Admin']){
    const actor={accountId:1,role}
    await assert.rejects(f.service.overview(actor),{status:403})
    await assert.rejects(f.service.submit(actor,draft.id),{status:403})
    await assert.rejects(f.service.draftRefund(actor,f.original.paymentId,{}),{status:403})
  }
})
test('refunding an excess duplicate capture cannot reopen a fully paid fine',async()=>{
  const f=fixture()
  f.attempts.unshift({...f.original,paymentId:randomUUID(),createdAt:'2026-11-11T00:00:00Z'})
  const draft=await f.draft();assert.equal(draft.appliedPrincipalCentavos,0)
  await f.service.submit(admin,draft.id)
  assert.equal((await f.service.credits(f.attempts,7,4)).reduce((sum,row)=>sum+row.principalCentavos,0),10000)
})
test('printing cannot be refunded after it starts, including between review and confirmation',async()=>{
  const f=fixture('GCASH','Printing'),draft=await f.draft();f.printed()
  await assert.rejects(f.service.submit(admin,draft.id),/already started/)
  assert.equal(f.calls().refundCalls,0)
  await f.service.cancel(admin,draft.id);await assert.rejects(f.draft(),/already started/)
})
test('printing payment card eligibility disappears after printing starts',async()=>{
  const f=fixture('GCASH','Printing')
  assert.equal((await f.service.decorations(f.original)).refundEligible,true)
  f.printed()
  assert.equal((await f.service.decorations(f.original)).refundEligible,false)
  assert.equal((await f.service.refundOptions(admin,f.original.paymentId)).eligible,false)
  f.cancelled()
  assert.equal((await f.service.decorations(f.original)).refundEligible,false)
  await assert.rejects(f.draft(),{code:'PRINT_REFUND_BLOCKED'})
  assert.equal(f.calls().refundCalls,0)
})
test('confirmed printing refund cancels the local view and blocks further printing',async()=>{
  const f=fixture('GCASH','Printing');await f.service.submit(admin,(await f.draft()).id)
  const result=previewPrint({request_id:3,calculated_cost:100,payment_status:'Unpaid',job_status:'Pending'},await f.service.credits(f.attempts,7,4))
  assert.equal(result.job_status,'Cancelled');assert.equal(result.payment_status,'Refunded')
  await assert.rejects(f.service.guard('Printing',3),/cannot be changed/)
})
test('Admin printing projection follows refund holds and confirmation without modifying school jobs',async()=>{
  const f=fixture('GCASH','Printing')
  assert.equal((await f.service.printingProjection())[0].payment_status,'Paid')
  const draft=await f.draft();f.providerState('PENDING');await f.service.submit(admin,draft.id)
  let row=(await f.service.printingProjection())[0]
  assert.equal(row.payment_status,'Refund pending');assert.equal(row.refund_pending,true);assert.equal(row.cancel_job,false)
  assert.equal((await f.service.decorations(f.original)).refundStatus,'Refund processing')
  f.providerState('SUCCEEDED');await f.service.recover()
  row=(await f.service.printingProjection())[0]
  assert.equal(row.payment_status,'Refunded');assert.equal(row.cancel_job,true);assert.equal(row.refund_pending,false)
  assert.equal((await f.service.decorations(f.original)).refundableCentavos,0)
  assert.ok(f.statements.every(sql=>/^SELECT/.test(sql)))
})
test('QRPh uses a verified student transfer only; reversed transfer restores the original credit',async()=>{
  const f=fixture('QRPH');await assert.rejects(f.draft(),/Verify/)
  const destination=await f.destination();assert.match(destination.account,/••••/)
  const draft=await f.draft({beneficiaryId:destination.id})
  assert.equal((await f.service.submit(admin,draft.id)).state,'Succeeded')
  assert.deepEqual(f.calls(),{refundCalls:0,payoutCalls:1})
  assert.equal(f.payoutRows[0].purpose_code,'REFUND');assert.equal(f.payoutRows[0].source_amount,10201)
  f.payoutState('REVERSED');assert.equal((await f.service.check(admin,draft.id)).state,'Reversed')
  assert.equal((await f.service.credits(f.attempts,7,4))[0].principalCentavos,10000)
})
test('unknown payout submission is reserved and requires exact verified provider reference; never resubmits',async()=>{
  const f=fixture('QRPH'),destination=await f.destination();f.fail()
  const draft=await f.draft({beneficiaryId:destination.id});await f.service.submit(admin,draft.id);await f.service.submit(admin,draft.id)
  await f.service.recover();assert.equal(f.calls().payoutCalls,1);assert.equal(f.ledger().operations[0].state,'Review')
  await assert.rejects(f.service.check(admin,draft.id,{providerId:'po-'+randomUUID()}))
  assert.equal((await f.service.check(admin,draft.id,{providerId:f.payoutRows[0].payout_id})).state,'Succeeded')
})
test('withdrawal enforces approved school bank, available balance and separate accounting',async()=>{
  const f=fixture('QRPH'),student=await f.destination(),bank=await f.destination(true)
  await assert.rejects(f.service.draftWithdrawal(admin,{amount:'10',beneficiaryId:student.id,reason:'School bank collections',requestKey:randomUUID()}),/school bank/)
  await assert.rejects(f.service.draftWithdrawal(admin,{amount:'1000',beneficiaryId:bank.id,reason:'School bank collections',requestKey:randomUUID()}),/available/)
  const draft=await f.service.draftWithdrawal(admin,{amount:'100',beneficiaryId:bank.id,reason:'School bank collections',requestKey:randomUUID()})
  assert.equal((await f.service.submit(admin,draft.id)).state,'Succeeded')
  assert.equal(f.payoutRows[0].purpose_code,'SELF');assert.equal(f.payoutRows[0].recipient.type,'BUSINESS')
  assert.equal((await f.service.credits(f.attempts,7,4))[0].principalCentavos,10000)
  const overview=await f.service.overview(admin);assert.equal(overview.totals.withdrawals,10000);assert.equal(overview.totals.refundedPrincipal,0)
})
test('confirmed bank additions become withdrawable without increasing collections; drafts and cash stay excluded', async()=>{
  const f=fixture(),bank=await f.destination(true)
  const input={amount:'150',beneficiaryId:bank.id,reason:'Online collections withdrawal',requestKey:randomUUID()}
  await assert.rejects(f.service.draftWithdrawal(admin,input),/available|online/i)
  const topup=await f.service.practice.draft(admin,{direction:'TopUp',amount:'1000',reason:'Local funding only',requestKey:randomUUID()})
  await assert.rejects(f.service.draftWithdrawal(admin,input),/available|online/i)
  await f.service.practice.confirm(admin,topup.id)
  const before=await f.service.overview(admin)
  assert.equal(before.balance?.availableCentavos,100000)
  assert.equal(before.collections.totalCollectionsCentavos,12701)
  const draft=await f.service.draftWithdrawal(admin,input)
  assert.equal((await f.service.submit(admin,draft.id)).state,'Succeeded')
  const after=await f.service.overview(admin)
  assert.equal(after.balance?.availableCentavos,95051)
  assert.equal(after.collections.totalCollectionsCentavos,12701)
  assert.equal(after.collections.topUpsCentavos,100000)
  assert.equal(f.calls().payoutCalls,1)
})
test('added funding cannot bypass Xendit balance or changing provider funds at confirmation',async()=>{
  const f=fixture(),bank=await f.destination(true)
  const topup=await f.service.practice.draft(admin,{direction:'TopUp',amount:'1000',reason:'School funding for withdrawals',requestKey:randomUUID()})
  await f.service.practice.confirm(admin,topup.id)
  const input={amount:'150',beneficiaryId:bank.id,reason:'Withdraw added school funding',requestKey:randomUUID()}
  const draft=await f.service.draftWithdrawal(admin,input)
  f.provider.getBalance=async()=>({balance:20})
  await assert.rejects(f.service.submit(admin,draft.id),/provider balance/i)
  await assert.rejects(f.service.draftWithdrawal(admin,{...input,requestKey:randomUUID()}),/available/i)
  assert.equal(f.calls().payoutCalls,0)
})
test('withdrawal recovery updates status and balances on provider success, failure and reversal without reposting',async()=>{
  const f=fixture(),bank=await f.destination(true)
  f.payoutState('REQUESTED')
  const draft=await f.service.draftWithdrawal(admin,{amount:'50',beneficiaryId:bank.id,reason:'Provider status acceptance',requestKey:randomUUID()})
  assert.equal((await f.service.submit(admin,draft.id)).state,'Processing')
  assert.equal((await f.service.overview(admin)).balance?.availableCentavos,5051)
  f.payoutState('SUCCEEDED');await f.service.recover()
  assert.equal((await f.service.overview(admin)).operations[0].state,'Succeeded')
  assert.equal((await f.service.overview(admin)).balance?.availableCentavos,5051)
  f.payoutState('REVERSED');await f.service.recover()
  assert.equal((await f.service.overview(admin)).balance?.availableCentavos,10201)
  assert.equal(f.calls().payoutCalls,1)
  f.payoutState('REQUESTED')
  const next=await f.service.draftWithdrawal(admin,{amount:'50',beneficiaryId:bank.id,reason:'Confirmed failure releases reservation',requestKey:randomUUID()})
  await f.service.submit(admin,next.id)
  f.payoutState('FAILED');await f.service.sync(admin)
  const failed=await f.service.overview(admin)
  assert.equal(failed.balance?.availableCentavos,10201);assert.equal(failed.totals.withdrawals,0)
  assert.equal(f.calls().payoutCalls,2)
})
test('same-currency payout validates the exact destination amount when optional source_amount is absent',async()=>{
  const f=fixture(),bank=await f.destination(true),create=f.provider.createPayout
  f.provider.createPayout=async(body:any)=>{const response=await create(body);delete response.source_amount;return response}
  const row=await f.service.draftWithdrawal(admin,{amount:'50',beneficiaryId:bank.id,reason:'Optional source field acceptance',requestKey:randomUUID()})
  assert.equal((await f.service.submit(admin,row.id)).state,'Succeeded')
  const g=fixture(),other=await g.destination(true),createOther=g.provider.createPayout
  g.provider.createPayout=async(body:any)=>{const response=await createOther(body);delete response.source_amount;response.destination_amount=1;return response}
  const invalid=await g.service.draftWithdrawal(admin,{amount:'50',beneficiaryId:other.id,reason:'Mismatching destination amount',requestKey:randomUUID()})
  assert.equal((await g.service.submit(admin,invalid.id)).state,'Review')
})
test('sample school bank setup is admin-only, explicit and idempotent',async()=>{
  const f=fixture()
  await assert.rejects(f.service.setupSampleBank({accountId:7,role:'Student'},{confirmed:true}),/Librarian/)
  await assert.rejects(f.service.setupSampleBank(admin,{confirmed:false}),/Confirm/)
  const first=await f.service.setupSampleBank(admin,{confirmed:true}),second=await f.service.setupSampleBank(admin,{confirmed:true})
  assert.equal(first.id,second.id);assert.equal(first.isSample,true);assert.equal(f.ledger().beneficiaries.length,1)
  assert.equal(f.calls().payoutCalls,0)
})
test('void affects unpaid remainder only and original money remains in history',async()=>{
  const f=fixture();f.original.appliedPrincipalCentavos=4000;f.original.principalCentavos=4000
  const adjustment=await f.service.voidFine(admin,{paymentId:f.original.paymentId,reason:'Incorrect remaining charge',requestKey:randomUUID()})
  assert.equal(adjustment.amount,6000)
  const fine=previewFine({fineId:3,lostBookReportId:null,balance:100,paid:0,status:'Unpaid',paymentAllowed:true},await f.service.credits(f.attempts,7,4))
  assert.equal(fine.balance,0);assert.equal(fine.paid,40);assert.equal(fine.status,'Voided');assert.equal(f.calls().refundCalls,0)
})
test('fee rounding preserves every centavo over many partial refunds',()=>{
  const previous:any[]=[]
  for(let i=0;i<100;i++){const result=refundAmounts(100,7,100,previous,1);previous.push({...result,state:'Succeeded'})}
  assert.equal(previous.reduce((sum,row)=>sum+row.fee,0),7)
  assert.throws(()=>refundAmounts(100,7,100,previous,1))
})
test('cancelled refund review releases reservations and creates no provider request',async()=>{
  const f=fixture(),draft=await f.draft();assert.equal((await f.service.decorations(f.original)).refundableCentavos,0)
  await f.service.cancel(admin,draft.id);assert.equal((await f.service.decorations(f.original)).refundableCentavos,10000)
  assert.equal(f.calls().refundCalls,0)
  const clone:FundsLedger=structuredClone(f.ledger());assert.equal(netCredits(f.attempts,clone,8,4).length,0)
})

test('transfer fee review is authorized, audited, and invalidates stale withdrawal reviews',async()=>{
  const f=fixture(),bank=await f.destination(true)
  const draft=await f.service.draftWithdrawal(admin,{amount:'100',beneficiaryId:bank.id,reason:'School library collections',requestKey:randomUUID()})
  await assert.rejects(f.service.setTransferFee({accountId:1,role:'Staff'},{amount:'0',reference:'Approved fee contract',confirmed:true}),{status:403})
  await f.service.setTransferFee(admin,{amount:'0',reference:'Approved zero-fee contract',confirmed:true})
  await assert.rejects(f.service.submit(admin,draft.id),/fee changed/)
  assert.equal(f.calls().payoutCalls,0)
  await f.service.setTransferFee(admin,{amount:'2.50',reference:'Updated fee agreement record',confirmed:true})
  assert.equal(f.ledger().feeHistory?.length,2)
})
test('borrower refund refresh is bounded and scoped to their verified account and user',async()=>{
  const f=fixture();f.providerState('PENDING');const draft=await f.draft();await f.service.submit(admin,draft.id)
  f.providerState('SUCCEEDED')
  assert.equal((await f.service.syncOwner(8,4)).checked,0)
  assert.equal(f.ledger().operations[0].state,'Processing')
  assert.equal((await f.service.syncOwner(7,4)).checked,1)
  assert.equal(f.ledger().operations[0].state,'Succeeded')
})
