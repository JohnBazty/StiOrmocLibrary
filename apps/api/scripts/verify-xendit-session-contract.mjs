import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import dotenv from 'dotenv'
import { readXenditSandboxConfig } from '../src/config/xendit-sandbox.ts'

// Explicit opt-in. Reuses this run's saved ID; an uncertain creation is never retried automatically.
async function verify() {
  if (!process.argv.includes('--create-test-session')) throw new Error('Explicit sandbox session flag required.')
  const statePath = 'output/xendit-sandbox/provider-session-check.json'
  if (spawnSync('git',['check-ignore','--quiet',statePath]).status!==0
    || spawnSync('git',['ls-files','--error-unmatch',statePath],{stdio:'ignore'}).status!==1) throw new Error('Private state must stay ignored.')
  const config = readXenditSandboxConfig(dotenv.parse(await readFile(new URL('../.env.xendit-sandbox',import.meta.url))))
  assert.equal(config.enabled,true)
  process.env.DATABASE_URL=config.databaseUrl
  const { createXenditClient, checkoutUrl, paymentReference, verifySession } = await import('../src/modules/payments/xendit.client.ts')
  const client = createXenditClient(()=>config)
  let state
  try { state=JSON.parse(await readFile(statePath,'utf8')) }
  catch(error) { if(error.code!=='ENOENT')throw error }
  if (!state) {
    state={paymentId:randomUUID(),state:'Creating'}
    await writeFile(statePath,JSON.stringify(state),{flag:'wx'})
    const session = await client.createSession({reference_id:paymentReference(state.paymentId),session_type:'PAY',mode:'PAYMENT_LINK',
      currency:'PHP',country:'PH',amount:51.50,capture_method:'AUTOMATIC',allowed_payment_channels:['GCASH'],
      allow_save_payment_method:'DISABLED',expires_at:new Date(Date.now()+30*60_000).toISOString(),
      metadata:{environment:'test'},description:'Disposable library sandbox contract check',
      customer:{reference_id:'Sandbox'+state.paymentId.replaceAll('-',''),type:'INDIVIDUAL',individual_detail:{given_names:'Sandbox',surname:'Payer'}}})
    state.sessionId=session.payment_session_id
    state.state='Created'
    await writeFile(statePath,JSON.stringify(state))
  }
  if (!state.sessionId) throw new Error('Prior creation outcome unknown. Resolve that fixture before creating another.')
  let session = await client.getSession(state.sessionId)
  try {
    verifySession(session,{payment_id:state.paymentId,total_centavos:'5150',channel_code:'GCASH'})
    checkoutUrl(session.payment_link_url)
    assert.equal(session.payment_id??null,null)
  } finally {
    if (session.status==='ACTIVE') await client.cancelSession(state.sessionId)
    session = await client.getSession(state.sessionId)
    state.state=session.status
    await writeFile(statePath,JSON.stringify(state))
  }
  assert.ok(['CANCELED','EXPIRED'].includes(session.status))
  return {environment:'test',sessionCreation:'passed',sessionLookup:'passed',channelRestriction:'GCASH',
    amountCentavos:5150,checkoutOrigin:'validated-sandbox-host',cleanup:session.status,
    actualPayment:'not-attempted',publicWebhookDelivery:'pending-approved-HTTPS-test-host'}
}
try { console.log(JSON.stringify(await verify(),null,2)) }
catch(error) { console.error('Session contract verification failed ('+(error.code||error.name)+'). No automatic creation retry.');process.exitCode=1 }
