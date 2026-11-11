import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import dotenv from 'dotenv'
import {readXenditSandboxConfig} from '../src/config/xendit-sandbox.ts'
import {createPaymentsService} from '../src/modules/payments/payments.service.ts'
import {createPaymentGatewayService} from '../src/modules/payments/payments.gateway.ts'
import {createXenditClient} from '../src/modules/payments/xendit.client.ts'

/** Explicit opt-in. One synthetic test charge, bounded wait, no credentials or real school data in output. */
export async function verifyHostedPayment(pool,owner){
  const settings=dotenv.parse(await readFile(new URL('../.env.xendit-sandbox',import.meta.url)))
  const config=readXenditSandboxConfig(settings)
  assert.equal(config.enabled,true)
  const output=new URL('../../../output/xendit-sandbox/phase67-hosted-payment.json',import.meta.url)
  // Do not silently recreate a payment after an interrupted or uncertain provider write.
  try{await readFile(output);throw new Error('Hosted acceptance already has an audit file; review it before another test.')}catch(error){if(error.code!=='ENOENT')throw error}
  const provider=createXenditClient(()=>config),service=createPaymentsService(pool,{enabled:()=>true})
  const gateway=createPaymentGatewayService(pool,{config:()=>config,provider})
  await owner.query("INSERT INTO print_requests(request_id,user_id,calculated_cost,payment_status,job_status) VALUES(90,1,50,'Unpaid','Pending')")
  const actor={accountId:1,role:'Student'},quote=await service.quote(actor,{kind:'Printing',targetId:90,channelCode:'GCASH'})
  let payment,record={paymentId:quote.paymentId,provider:'Xendit Test',result:'Creating',publicCallback:'not tested'}
  await writeFile(output,JSON.stringify(record),{flag:'wx'})
  try{
    payment=await gateway.checkout(actor,{quoteId:quote.paymentId,requestKey:'hosted-qa-'+quote.paymentId})
    assert.equal(payment.state,'Active')
    record={...record,result:'Awaiting sandbox payer',checkoutUrl:payment.checkoutUrl}
    await writeFile(output,JSON.stringify(record))
    console.log('Hosted Test checkout ready. Its link is in ignored output/xendit-sandbox/phase67-hosted-payment.json. Waiting up to ten minutes for test completion.')
    const deadline=Date.now()+10*60_000
    for(let index=0;index<120&&Date.now()<deadline;index++){
      const [rows]=await pool.execute('SELECT provider_session_id FROM online_payment_attempts WHERE payment_id=?',[payment.paymentId])
      const session=await provider.getSession(rows[0].provider_session_id)
      if(session.status==='COMPLETED'){
        await pool.execute('UPDATE online_payment_attempts SET next_check_at=now() WHERE payment_id=?',[payment.paymentId])
        const verified=await gateway.check(actor,payment.paymentId)
        assert.equal(verified.state,'Succeeded');assert.ok(verified.receiptId)
        await gateway.check(actor,payment.paymentId)
        const [receipts]=await pool.execute('SELECT count(*)::int count FROM print_payment_receipts WHERE online_payment_attempt_id=?',[payment.paymentId])
        assert.equal(receipts[0].count,1)
        record={...record,result:'Passed: actual test capture verified and one local receipt',checkoutUrl:null}
        await writeFile(output,JSON.stringify(record))
        return {capture:'actual-Xendit-test',localReceipt:'once',publicCallback:'not tested'}
      }
      if(['EXPIRED','CANCELED'].includes(session.status))throw new Error('The hosted Test session ended before a successful capture.')
      await new Promise(resolve=>setTimeout(resolve,5000))
    }
    throw new Error('Hosted Test payment did not complete within the bounded acceptance window.')
  }finally{
    const [rows]=await pool.execute('SELECT provider_session_id FROM online_payment_attempts WHERE payment_id=?',[quote.paymentId])
    if(rows[0]?.provider_session_id){
      record={...record,providerSessionId:rows[0].provider_session_id}
      const session=await provider.getSession(rows[0].provider_session_id)
      if(session.status==='ACTIVE')await provider.cancelSession(rows[0].provider_session_id)
      if(!record.result.startsWith('Passed'))record={...record,result:'Not completed; session canceled or terminal',checkoutUrl:null}
      await writeFile(output,JSON.stringify(record))
    }
  }
}
