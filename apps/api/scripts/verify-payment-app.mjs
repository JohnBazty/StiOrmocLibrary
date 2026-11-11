import assert from 'node:assert/strict'
import {readFile,writeFile,readdir,unlink} from 'node:fs/promises'
import {createHash,randomBytes} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import dotenv from 'dotenv'
import express from 'express'
import http from 'node:http'
import {createServer as createProbe} from 'node:net'
import bcrypt from 'bcrypt'
import {readXenditSandboxConfig} from '../src/config/xendit-sandbox.ts'

// Explicit opt-in, loopback only. Never loads the ordinary application's credentials.
const root=new URL('../../../',import.meta.url),output=new URL('output/xendit-sandbox/',root)
const localPreview=process.argv.includes('--local-preview')
const webPort=localPreview?5173:4174,apiPort=localPreview?4000:47146
const webOrigin=localPreview?'http://localhost:5173':'http://127.0.0.1:4174'
const state=JSON.parse(await readFile(new URL('local-state.json',output),'utf8'))
const settings=dotenv.parse(await readFile(new URL('../.env.xendit-sandbox',import.meta.url)))
readXenditSandboxConfig(settings)
assert.match(state.ownerPassword,/^[a-f0-9]{48}$/)
const database=new URL(settings.DATABASE_URL)
assert.equal(database.hostname,'127.0.0.1');assert.equal(database.port,'55438')
assert.equal(database.pathname,'/sti_xendit_sandbox');assert.equal(database.username,'sandbox_app')
assert.equal(settings.DATABASE_URL,settings.XENDIT_SANDBOX_DATABASE_URL)
assert.equal(settings.XENDIT_MODE,'test');assert.equal(settings.XENDIT_SANDBOX_PUBLIC_ORIGIN,'')
const {default:EmbeddedPostgres}=await import(new URL('tools/node_modules/embedded-postgres/dist/index.js',output))
const cluster=new EmbeddedPostgres({databaseDir:fileURLToPath(new URL('data/',output)),user:'sandbox_owner',password:state.ownerPassword,
  port:55438,persistent:true,authMethod:'scram-sha-256',postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}})
let owner,appDatabase,worker,server,webServer,created=false,committed=false,privateCreated=false,manifest=[]
let preserveUnresolvedPayments=false
const runPassword=randomBytes(24).toString('base64url'),codes=new Map()
const privateFile=new URL('phase7-app-private.json',output),stopFile=new URL('phase7-app-stop',output)
const guideFile=new URL('local-payment-sign-in.md',output)
let phase='start',failure
let stopRequested=false
process.once('SIGINT',()=>{stopRequested=true});process.once('SIGTERM',()=>{stopRequested=true})
try{
  for(const port of [webPort,apiPort]){
    const probe=createProbe()
    await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(port,'127.0.0.1',resolve)})
    await new Promise(resolve=>probe.close(resolve))
  }
  for(const file of [output,new URL('../.env.xendit-sandbox',import.meta.url)]){
    const checked=spawnSync('git',['check-ignore','--quiet','--no-index',fileURLToPath(file)],{cwd:fileURLToPath(root)})
    assert.equal(checked.status,0,'Private sandbox output must remain ignored.')
  }
  await cluster.start()
  owner=cluster.getPgClient('sti_xendit_sandbox','127.0.0.1');await owner.connect()
  const identity=(await owner.query('SELECT current_database() AS name,host(inet_server_addr()) AS host')).rows[0]
  assert.deepEqual(identity,{name:'sti_xendit_sandbox',host:'127.0.0.1'})
  // Refuse to replace an existing installation or an interrupted run.
  const before=await owner.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'")
  assert.equal(before.rowCount,0,'The sandbox public schema must be empty before this run.')
  const otherObjects=await owner.query("SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace UNION ALL SELECT 1 FROM pg_type WHERE typnamespace='public'::regnamespace UNION ALL SELECT 1 FROM pg_extension WHERE extnamespace='public'::regnamespace")
  assert.equal(otherObjects.rowCount,0,'Existing public functions, types or extensions must be preserved.')
  assert.equal((await owner.query("SELECT 1 FROM pg_namespace WHERE nspname='storage'")).rowCount,0,'Storage stand-in must not replace existing data.')
  for(const role of ['anon','authenticated','service_role'])if(!(await owner.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount)await owner.query('CREATE ROLE '+role+' NOLOGIN')
  await owner.query('BEGIN');created=true
  // Bucket metadata only. No Supabase Storage service or production uploads are connected.
  await owner.query('CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[])')
  const excluded=new Set(['002_from_migrations.sql','011_advisor_security_lockdown.sql','012_performance_advisor_fixes.sql'])
  const files=(await readdir(new URL('database/supabase/',root))).filter(name=>/^\d.*\.sql$/.test(name)&&Number(name.slice(0,3))<=41&&!excluded.has(name)).sort()
  for(const name of files){
    phase=name
    const source=await readFile(new URL('database/supabase/'+name,root),'utf8')
    manifest.push({name,sha256:createHash('sha256').update(source).digest('hex')})
    await owner.query(source)
    if(name==='001_from_baseline.sql'){
      const fixture=await readFile(new URL('./fixtures/payment-app-catalog.sql',import.meta.url),'utf8')
      await owner.query(fixture)
      manifest.push({name:'fixtures/payment-app-catalog.sql',sha256:createHash('sha256').update(fixture).digest('hex')})
    }
  }
  phase='schema readiness'
  // dotenv's normal .env loader cannot fill in any production settings in this process.
  const ordinary=dotenv.parse(await readFile(new URL('../.env',import.meta.url)).catch(()=>Buffer.from('')))
  for(const key of new Set([...Object.keys(process.env).filter(key=>/^(DATABASE|DB_|SUPABASE|MS_GRAPH|RESEND|GMAIL|MAIL_|XENDIT|VERCEL|JWT_|SESSION_|REPORT_|ATTENDANCE_|DOCX_|ENROLLMENT_|LOGIN_|JOBS_)/.test(key)),...Object.keys(ordinary)]))process.env[key]=''
  Object.assign(process.env,settings,{NODE_ENV:'test',WEB_ORIGIN:webOrigin,XENDIT_CHECKOUT_ENABLED:localPreview?'true':'false',
    SESSION_SECRET:randomBytes(48).toString('hex'),JWT_SECRET:randomBytes(48).toString('hex'),REPORT_INTEGRITY_SECRET:randomBytes(48).toString('hex'),ATTENDANCE_QR_SECRET:randomBytes(48).toString('hex'),
    ENROLLMENT_ROSTER_ENABLED:'false',LOGIN_DEVICES_ENABLED:'true',JOB_RUNNER_SECRET:'',JOB_RUNNER_LOCAL_TIMER:'off'})
  const {db}=await import('../src/config/db.js');appDatabase=db
  const {checkSchemaReadiness}=await import('../src/core/schema-readiness.ts')
  // Readiness intentionally checks public; run through the owner before committing.
  const adapter={execute:async(sql,values)=>{const {toPgPlaceholders}=await import('../src/config/sql.js');return [(await owner.query(toPgPlaceholders(sql),values)).rows]}}
  const readiness=await checkSchemaReadiness(adapter)
  assert.equal(readiness.ready,true,JSON.stringify(readiness))
  await writeFile(new URL('phase7-app-schema.json',output),JSON.stringify({result:'ready',manifest,excluded:[...excluded],readiness,scope:'local synthetic database; not live migration evidence'},null,2))
  console.log('Full local schema readiness passed.')
  phase='synthetic accounts'
  const hash=await bcrypt.hash(runPassword,12)
  for(const [index,role] of ['Student','Faculty','Staff','Librarian'].entries()){
    const id=index+1,schoolId='QA-PAYMENT-'+role.toUpperCase(),roleName={Student:'Student',Faculty:'Faculty',Staff:'Library Staff',Librarian:'Librarian'}[role]
    await owner.query(`INSERT INTO users(user_id,role_id,user_role,institutional_id,school_id,full_name,email,password_hash)
      SELECT $1,role_id,$2,$3,$3,$4,$5,$6 FROM roles WHERE role_name=$7`,[id,role,schoolId,'Disposable '+role,'qa-payment-'+role.toLowerCase()+'@ormoc.sti.edu.ph',hash,roleName])
    await owner.query('INSERT INTO accounts(account_id,user_id,school_id,password_hash,role) VALUES($1,$1,$2,$3,$4)',[id,schoolId,hash,role])
    if(role==='Student')await owner.query("INSERT INTO student_profiles(account_id,first_name,last_name,program_strand,year_grade_level) VALUES($1,'Disposable','Student','BSIT','1')",[id])
  }
  await owner.query("INSERT INTO fines(user_id,fine_type,fine_amount,payment_status,finalized_at) VALUES(1,'Infraction',100,'Unpaid',now())")
  await owner.query("INSERT INTO print_requests(user_id,file_name,file_path,calculated_cost,payment_status) VALUES(1,'Disposable course notes.pdf','qa-no-upload.pdf',50,'Unpaid')")
  const reference=JSON.parse(await readFile(new URL('./fixtures/xendit-sandbox-channels.json',import.meta.url),'utf8'))
  for(const method of reference.channels.filter(row=>['QRPH','GCASH'].includes(row.channelCode)))await owner.query(`INSERT INTO online_payment_fee_rules(environment,channel_code,display_name,fixed_centavos,percentage_basis_points,tax_basis_points,min_total_centavos,max_total_centavos,created_by_account_id,request_key)
    VALUES('test',$1,$2,100,100,0,$3,$4,4,$5)`,[method.channelCode,method.displayName,method.minTotalCentavos,method.maxTotalCentavos,'qa-app-'+method.channelCode])
  // Private app role gets normal RLS access only in this disposable database.
  await owner.query('GRANT USAGE ON SCHEMA public TO sandbox_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO sandbox_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO sandbox_app')
  const secured=await owner.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity")
  for(const {tablename} of secured.rows){assert.match(tablename,/^[a-z_]+$/);await owner.query('CREATE POLICY sandbox_app_only ON public.'+tablename+' FOR ALL TO sandbox_app USING(true) WITH CHECK(true)')}
  await owner.query('COMMIT');created=false;committed=true
  phase='full application'
  // The normal login/OTP/session logic remains; only delivery goes to a private local sink.
  const {loginSecurityService,createLoginSecurityService}=await import('../src/modules/auth/login-security.service.ts')
  Object.assign(loginSecurityService,createLoginSecurityService(db,undefined,async(email,content)=>{assert.match(email,/^qa-payment-(student|faculty)@ormoc\.sti\.edu\.ph$/);codes.set(email,content);await writePrivate()}))
  async function writePrivate(){await writeFile(privateFile,JSON.stringify({password:runPassword,accounts:['QA-PAYMENT-STUDENT','QA-PAYMENT-FACULTY','QA-PAYMENT-STAFF','QA-PAYMENT-LIBRARIAN'],codes:Object.fromEntries(codes)}),{flag:privateCreated?'w':'wx',mode:0o600});privateCreated=true}
  await writePrivate()
  const {createApp}=await import('../src/app.js')
  const app=createApp()
  server=await new Promise((resolve,reject)=>{const listener=app.listen(apiPort,'127.0.0.1',()=>resolve(listener));listener.once('error',reject)})
  const web=express()
  web.use('/api',(request,response)=>{
    const upstream=http.request('http://127.0.0.1:'+apiPort+request.originalUrl,{method:request.method,headers:{...request.headers,host:'127.0.0.1:'+apiPort}},incoming=>{response.writeHead(incoming.statusCode??502,incoming.headers);incoming.pipe(response)})
    upstream.on('error',()=>{if(!response.headersSent)response.status(502).end('Local test API unavailable.');else response.destroy()});request.pipe(upstream)
  })
  if(localPreview){
    const html=await readFile(new URL('apps/web/dist/index.html',root),'utf8')
    const notice='<div role="status" style="position:relative;z-index:100;padding:12px 16px;background:#fff4d6;color:#553a00;text-align:center;font:600 14px/1.5 system-ui">Local payment test — sample records only. No real money. Use the sample account from the local sign-in guide.</div>'
    const previewHtml=html.replace('<body>','<body>'+notice)
    web.use((request,response,next)=>{
      if(request.method==='GET'&&!request.path.split('/').at(-1)?.includes('.')){response.type('html').send(previewHtml);return}
      next()
    })
  }
  web.use(express.static(fileURLToPath(new URL('apps/web/dist/',root))))
  web.use((_request,response)=>response.sendFile(fileURLToPath(new URL('apps/web/dist/index.html',root))))
  webServer=await new Promise((resolve,reject)=>{const listener=web.listen(webPort,localPreview?'localhost':'127.0.0.1',()=>resolve(listener));listener.once('error',reject)})
  function sessionHeaders(session,write=false){return session?{Cookie:session.cookie,...(write?{'X-CSRF-Token':session.csrf}:{})}:{}}
  async function call(path,body,session){const response=await fetch(webOrigin+path,{method:body?'POST':'GET',headers:{Origin:webOrigin,...(body?{'Content-Type':'application/json'}:{}),...sessionHeaders(session,Boolean(body))},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const value=await response.json();return {status:response.status,value,cookies:response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ')}}
  const evidence={schema:'ready',roles:{},boundaries:[],reports:[],worker:[],email:'local synthetic sink; no real email sent',scope:localPreview?'full local sandbox app; Xendit Test checkout; no public callback':'full local app; checkout paused; no external callback'}
  const health=await call('/api/health');assert.equal(health.status,200);assert.equal(health.value.data.status,'healthy')
  const landing=await fetch(webOrigin+'/staff');assert.equal(landing.status,200);assert.match(await landing.text(),/<div id="root"><\/div>/)
  evidence.web='production build served with same-origin API proxy; browser inspection remains separate'
  const unauthenticated=await call('/api/v1/admin/payments');assert.equal(unauthenticated.status,401)
  evidence.boundaries.push({role:'Anonymous',path:'/api/v1/admin/payments',status:401})
  const tokens={}
  for(const role of ['Student','Faculty','Staff','Librarian']){
    let result=await call('/api/v1/auth/login',{school_id:'QA-PAYMENT-'+role.toUpperCase(),password:runPassword,portal:['Student','Faculty'].includes(role)?'user':'staff'})
    assert.equal(result.status,200,'Synthetic account sign-in or API request failed')
    if(['Student','Faculty'].includes(role)){
      assert.equal(result.value.data.otpRequired,true)
      result=await call('/api/v1/auth/login/verify',{challenge_id:result.value.data.challengeId,code:codes.get('qa-payment-'+role.toLowerCase()+'@ormoc.sti.edu.ph')})
      assert.equal(result.status,200,'Synthetic account sign-in or API request failed')
    }
    assert.equal(result.value.data.token,undefined);assert.equal(result.value.data.session.role,role)
    tokens[role]={cookie:result.cookies,csrf:result.value.data.csrfToken};assert.ok(tokens[role].cookie);assert.ok(tokens[role].csrf)
    assert.equal((await call('/api/v1/auth/me',null,tokens[role])).status,200)
    evidence.roles[role]='password/session passed'+(['Student','Faculty'].includes(role)?'; OTP verified using local sink':'')
  }
  for(const [role,path,status] of [['Student','/api/v1/admin/payments',403],['Staff','/api/v1/admin/payments/operations',403],['Staff','/api/v1/admin/reports?kind=payments',403],['Faculty','/api/v1/user/payments/options?kind=Printing&targetId=1',404],['Librarian','/api/v1/admin/payments/operations',200]]){
    const result=await call(path,null,tokens[role]);assert.equal(result.status,status,JSON.stringify({role,path,...result}));evidence.boundaries.push({role,path,status})
  }
  const csrfDenied=await fetch(webOrigin+'/api/v1/user/payments/quote',{
    method:'POST',headers:{Origin:webOrigin,'Content-Type':'application/json',Cookie:tokens.Student.cookie},
    body:JSON.stringify({kind:'Fine',targetId:1,channelCode:'GCASH',amount:'40'}),
  })
  assert.equal(csrfDenied.status,403)
  evidence.boundaries.push({role:'Student cookie without CSRF',path:'payment quote',status:403})
  const ownFine=await call('/api/v1/user/payments/options?kind=Fine&targetId=1',null,tokens.Student)
  assert.equal(ownFine.status,200);assert.equal(ownFine.value.data.balanceCentavos,10000);assert.equal(ownFine.value.data.paymentAllowed,localPreview)
  const paused=await call('/api/v1/user/payments/quote',{kind:'Fine',targetId:1,channelCode:'GCASH',amount:'40'},tokens.Student)
  assert.equal(paused.status,localPreview?200:503);if(!localPreview)assert.equal(paused.value.code,'ONLINE_CHECKOUT_PAUSED')
  evidence.boundaries.push({role:'Student',path:localPreview?'own finalized fine, test checkout enabled':'own finalized fine, checkout paused',status:paused.status,balanceCentavos:10000})
  phase='borrower payment activity'
  // Quoted drafts are deliberately absent from both user-facing lists.
  const due=await call('/api/v1/fines/me?status=outstanding',null,tokens.Student)
  assert.equal(due.status,200);assert.equal(due.value.data.items.length,1)
  for(const view of ['pending','history']){
    const result=await call('/api/v1/user/payments?view='+view,null,tokens.Student)
    assert.equal(result.status,200);assert.deepEqual(result.value.data.items,[])
    assert.equal((await call('/api/v1/user/payments?view='+view,null,tokens.Staff)).status,403)
  }
  const {createPaymentsService}=await import('../src/modules/payments/payments.service.ts')
  const quoteService=createPaymentsService(db,{enabled:()=>true})
  const qr=await quoteService.quote({accountId:1,role:'Student'},{kind:'Fine',targetId:1,channelCode:'QRPH',amount:'40'})
  assert.equal(qr.totalCentavos,4140);assert.equal(qr.remainingCentavos,6000)
  await quoteService.prepare({accountId:1,role:'Student'},{quoteId:qr.paymentId,requestKey:'qa-user-qr-review'})
  const pending=await call('/api/v1/user/payments?view=pending',null,tokens.Student)
  assert.equal(pending.value.data.items.length,1);assert.equal(pending.value.data.items[0].channelCode,'QRPH')
  const otherPending=await call('/api/v1/user/payments?view=pending',null,tokens.Faculty)
  assert.equal(otherPending.value.data.items.length,0)
  const cancelled=await call('/api/v1/user/payments/'+qr.paymentId+'/cancel',{},tokens.Student)
  assert.equal(cancelled.value.data.state,'Cancelled')
  const history=await call('/api/v1/user/payments?view=history',null,tokens.Student)
  assert.equal(history.value.data.items[0].paymentId,qr.paymentId)
  const offlineHistory=await createPaymentsService(db,{enabled:()=>false}).userList({accountId:1,role:'Student'},{view:'history'})
  assert.equal(offlineHistory.enabled,false);assert.equal(offlineHistory.items[0].paymentId,qr.paymentId)
  evidence.userActivity={qrQuote:'4140 centavos',pendingOwnership:'passed',cancelBeforeProvider:'passed',terminalHistory:'passed',providerCreation:'not called'}
  phase='cash coexistence and protected receipt'
  const cashBody={requestKey:'qa-app-cash-partial',allocations:[{fineId:1,amount:40}],notes:'Disposable Phase 7 acceptance only'}
  const cash=await call('/api/v1/admin/fines/payments',cashBody,tokens.Librarian)
  assert.equal(cash.status,201,JSON.stringify(cash));assert.equal(cash.value.data.amountReceived,40)
  const receiptId=cash.value.data.receiptId
  const retry=await call('/api/v1/admin/fines/payments',cashBody,tokens.Librarian)
  assert.equal(retry.status,201);assert.equal(retry.value.data.receiptId,receiptId)
  const remainder=await call('/api/v1/user/payments/options?kind=Fine&targetId=1',null,tokens.Student)
  assert.equal(remainder.value.data.balanceCentavos,6000)
  assert.equal((await call('/api/v1/fines/receipts/'+receiptId,null,tokens.Faculty)).status,403)
  const receipt=await fetch(webOrigin+'/api/v1/fines/receipts/'+receiptId+'.pdf',{headers:sessionHeaders(tokens.Student)})
  assert.equal(receipt.status,200);assert.match(receipt.headers.get('cache-control'),/private/)
  const receiptBytes=Buffer.from(await receipt.arrayBuffer());assert.equal(receiptBytes.subarray(0,5).toString(),'%PDF-')
  await writeFile(new URL('phase7-app-cash-receipt.pdf',output),receiptBytes)
  evidence.cash={partialPrincipal:40,remainingPrincipal:60,idempotentRetry:'same receipt',otherBorrower:'forbidden',ownerPdf:'downloaded'}
  phase='real reports'
  for(const kind of ['payments','printRevenue','onlinePayments']){
    const result=await call('/api/v1/admin/reports?kind='+kind,null,tokens.Librarian);assert.equal(result.status,200,'Synthetic account sign-in or API request failed');assert.equal(result.value.data.kind,kind)
    const response=await fetch(webOrigin+'/api/v1/admin/reports/export?kind='+kind+'&format=csv',{headers:sessionHeaders(tokens.Librarian)});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/csv/);await writeFile(new URL('phase7-app-'+kind+'.csv',output),await response.text());evidence.reports.push(kind)
    const pdf=await fetch(webOrigin+'/api/v1/admin/reports/export?kind='+kind+'&format=pdf',{headers:sessionHeaders(tokens.Librarian)});assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-type'),/pdf/);const bytes=Buffer.from(await pdf.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');await writeFile(new URL('phase7-app-'+kind+'.pdf',output),bytes)
  }
  phase='worker acceptance'
  const {jobRunner,startLocalJobTimer}=await import('../src/modules/job-runner/index.ts')
  const report=await jobRunner.runAll()
  assert.ok(report.every(row=>row.outcome==='succeeded'),JSON.stringify(report))
  evidence.worker=report.map(row=>({job:row.job,outcome:row.outcome}))
  evidence.authentication='HttpOnly cookies with CSRF; no bearer token returned'
  await writeFile(new URL('phase7-app-acceptance.json',output),JSON.stringify(evidence,null,2))
  if(localPreview){
    // Keep acceptance checks separate from the sample charges used for hands-on review.
    await owner.query("INSERT INTO fines(user_id,fine_type,fine_amount,payment_status,finalized_at) VALUES(1,'Infraction',100,'Unpaid',now())")
    // Acceptance sign-ins must not leave the sample user waiting through an OTP cooldown.
    await owner.query('DELETE FROM login_otp_challenges WHERE account_id IN (1,2,3,4)')
    await owner.query('UPDATE library_login_sessions SET revoked_at=now() WHERE account_id IN (1,2,3,4) AND revoked_at IS NULL')
    await writeFile(guideFile,'# Local payment test\n\nOpen http://localhost:5173/login. Use QA-PAYMENT-STUDENT and the password in phase7-app-private.json in this folder. Your school account is not part of this separate test database.\n\nWhen asked for an email code, open phase7-app-private.json again and copy the code for the sample Student. No real email is sent.\n\nOpen Payments. Choose the sample bill or fine, then Pay now. Xendit is in Test mode: use its test payment flow, never real money. Come back and use Check status after completing the test.\n\nFor the staff view, sign out and use QA-PAYMENT-LIBRARIAN at /staff, with the same sample password.\n\nStop safely by pressing Ctrl+C in the running terminal. This removes only this run’s sample database tables.\n',{mode:0o600})
    console.log('Local payment test ready at '+webOrigin+'. Sign-in instructions are in ignored output/xendit-sandbox/local-payment-sign-in.md. Test mode only.')
  }else console.log('Four cookie sign-ins, boundaries and report exports passed.')
  if(localPreview||process.argv.includes('--serve')||process.argv.includes('--cadence')){
    worker=startLocalJobTimer(true)
    const deadline=Date.now()+(localPreview?8*60:process.argv.includes('--cadence')?5:15)*60_000
    while(Date.now()<deadline&&!stopRequested){
      try{await readFile(stopFile);await unlink(stopFile);break}catch(error){if(error.code!=='ENOENT')throw error}
      await new Promise(resolve=>setTimeout(resolve,1000))
    }
  }
  evidence.lastWorker=await jobRunner.status()
  await writeFile(new URL('phase7-app-acceptance.json',output),JSON.stringify(evidence,null,2))
}catch(error){failure={phase,code:error.code??error.name,message:error.message};console.error(JSON.stringify(failure))}
finally{
  await worker?.stop()
  for(const listener of [webServer,server])if(listener)await new Promise(resolve=>{listener.close(resolve);listener.closeAllConnections()})
  if(localPreview&&committed&&appDatabase){
    // Do not discard the only local evidence of an uncertain provider operation.
    try{
      const {createPaymentGatewayService}=await import('../src/modules/payments/payments.gateway.ts')
      const gateway=createPaymentGatewayService(appDatabase)
      const pending=(await owner.query("SELECT payment_id FROM online_payment_attempts WHERE state IN ('Creating','Active','Review')")).rows
      for(const row of pending)await gateway.cancel({accountId:4,role:'Librarian'},row.payment_id,true).catch(()=>{})
      const unresolved=(await owner.query("SELECT payment_id,provider_session_id,state,review_code FROM online_payment_attempts WHERE state IN ('Creating','Active','Review')")).rows
      preserveUnresolvedPayments=unresolved.length>0
      if(preserveUnresolvedPayments){
        await writeFile(new URL('local-preview-unresolved.json',output),JSON.stringify({database:'isolated loopback sandbox',records:unresolved},null,2))
        console.error('Unresolved Test payments preserved in the local database. Do not remove the database; review output/xendit-sandbox/local-preview-unresolved.json before restarting.')
      }
    }catch{
      preserveUnresolvedPayments=true
      console.error('Could not confirm Test payment cleanup. The isolated database was preserved for review.')
    }
  }
  if(appDatabase)await appDatabase.end()
  if(owner){if(created)await owner.query('ROLLBACK');if(committed&&!preserveUnresolvedPayments){const identity=(await owner.query('SELECT current_database() AS name,host(inet_server_addr()) AS host')).rows[0];assert.deepEqual(identity,{name:'sti_xendit_sandbox',host:'127.0.0.1'});await owner.query('DROP SCHEMA public CASCADE; DROP SCHEMA storage CASCADE; CREATE SCHEMA public; REVOKE CREATE ON SCHEMA public FROM PUBLIC')}await owner.end()}
  if(localPreview)await unlink(guideFile).catch(error=>{if(error.code!=='ENOENT')throw error})
  if(privateCreated)await unlink(privateFile).catch(error=>{if(error.code!=='ENOENT')throw error})
  if(cluster.process){const control=fileURLToPath(new URL('tools/node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe',output));const stopped=spawnSync(control,['-D',fileURLToPath(new URL('data/',output)),'-m','fast','-w','stop'],{stdio:'ignore',timeout:15000});assert.equal(stopped.status,0);cluster.process=undefined}
  await cluster.stop()
}
if(failure)process.exitCode=1
