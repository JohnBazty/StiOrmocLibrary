import express from 'express'
import { spawn } from 'node:child_process'
import { readFile,writeFile,unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const web=new URL('../../web/',import.meta.url)
const html=new URL('payment-qa.html',web),entry=new URL('.payment-qa.tsx',web)
const id='00000000-0000-4000-8000-000000000001'
let payment={paymentId:id,kind:'Fine',targetId:1,principalCentavos:4000,feeCentavos:140,totalCentavos:4140,remainingCentavos:6000,
  channelCode:'GCASH',state:'Active',isSample:true,checkoutUrl:null,cancellationPending:false,receiptId:null,
  payerName:'Sandbox Student',schoolId:'QA-PAYMENT-001',description:'Sample library fine',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+30*60_000).toISOString()}
const api=express();api.use(express.json());api.use((_request,response,next)=>{response.set('Cache-Control','no-store');next()})
const fine={id:'F-1',fineId:1,lostBookReportId:null,userId:1,schoolId:'QA-PAYMENT-001',userName:'Sandbox Student',type:'Infraction',title:'Sample library fine',reason:'Disposable payment fixture',assessed:100,paid:0,adjusted:0,balance:100,status:'Unpaid',occurredAt:new Date().toISOString(),updatedAt:new Date().toISOString(),paymentAllowed:true,receipts:[]}
const print={request_id:1,file_name:'Sample course notes.pdf',number_of_copies:1,print_type:'Monochrome',paper_size:'A4',page_count:10,total_sheets:10,calculated_cost:50,payment_status:'Unpaid',job_status:'Pending',created_at:new Date().toISOString()}
const reply=(response,data)=>response.json({success:true,data})
const settlements=new Map()
let stopRun
api.post('/qa/stop',(_request,response)=>{reply(response,{stopping:true});setTimeout(()=>stopRun?.(),25)})
api.get('/qa/reset',(request,response)=>{payment={...payment,state:request.query.state??'Quoted',cancellationPending:false,receiptId:null};reply(response,{reset:true})})
api.get('/api/v1/user/payments/options',(request,response)=>reply(response,{enabled:true,isSample:true,paymentAllowed:true,balanceCentavos:request.query.kind==='Printing'?5000:10000,
  methods:[{channelCode:'GCASH',displayName:'GCash',minTotalCentavos:100,maxTotalCentavos:1000000},{channelCode:'CARDS',displayName:'Cards',minTotalCentavos:2000,maxTotalCentavos:10000000}],
  active:['Active','Review','Creating'].includes(payment.state)&&request.query.kind===payment.kind?payment:null}))
api.post('/api/v1/user/payments/quote',(request,response)=>{const principal=request.body.amount?Math.round(Number(request.body.amount)*100):request.body.kind==='Printing'?5000:10000;
  payment={...payment,kind:request.body.kind,targetId:Number(request.body.targetId),channelCode:request.body.channelCode,principalCentavos:principal,
    feeCentavos:100+Math.round(principal/100),totalCentavos:principal+100+Math.round(principal/100),remainingCentavos:request.body.kind==='Fine'?10000-principal:0,state:'Quoted'};reply(response,payment)})
api.post('/api/v1/user/payments/checkout',(_request,response)=>{payment={...payment,state:'Review'};reply(response,payment)})
api.post('/api/v1/user/payments/:id/check',(_request,response)=>{if(payment.state!=='Cancelled')payment={...payment,state:'Succeeded',receiptId:8,cancellationPending:false};reply(response,payment)})
api.post('/api/v1/user/payments/:id/resume',(_request,response)=>reply(response,payment))
api.post('/api/v1/user/payments/:id/cancel',(_request,response)=>{payment={...payment,state:'Cancelled',cancellationPending:false};reply(response,payment)})
api.get('/api/v1/user/payments/:id',(_request,response)=>reply(response,payment))
api.get('/api/v1/admin/payments',(request,response)=>{let rows=['Review','Active','Succeeded','Cancelled'].map((state,index)=>({...payment,paymentId:id.slice(0,-1)+(index+1),state,receiptId:state==='Succeeded'?8:null,description:index%2?'Sample printing bill':'Sample library fine'}));if(request.query.state)rows=rows.filter(row=>row.state===request.query.state);if(request.query.channel)rows=rows.filter(row=>row.channelCode===request.query.channel);reply(response,{items:rows,pagination:{page:1,limit:25,total:rows.length}})})
api.post('/api/v1/admin/payments/:id/check',(_request,response)=>reply(response,{...payment,state:'Succeeded'}))
api.post('/api/v1/admin/payments/:id/cancel',(_request,response)=>reply(response,{...payment,state:'Cancelled'}))
api.get('/api/v1/admin/payments/operations',(_request,response)=>reply(response,{checkoutEnabled:false,needs_review:1,due_checks:2,review_events:1,pending_events:2,
  runnerStatus:{last_success_at:new Date().toISOString(),last_error:null},events:[{event_id:'1',payment_id:id,event_type:'payment_session.completed',state:'Review',attempts:8,last_error_code:'PAYMENT_RECONCILIATION_REQUIRED',received_at:new Date().toISOString(),next_attempt_at:new Date().toISOString()}]}))
api.post('/api/v1/admin/payments/recover',(_request,response)=>reply(response,{processed:1,pending:0,reviewed:1}))
api.get('/api/v1/admin/payments/:id/settlement',(request,response)=>reply(response,settlements.get(request.params.id)??null))
api.post('/api/v1/admin/payments/:id/settlement',(request,response)=>{settlements.set(request.params.id,{provider_reference:request.body.reference,processing_cost_centavos:String(Math.round(Number(request.body.processingCost)*100)),net_centavos:'4000',settled_at:request.body.settledAt,recorded_at:new Date().toISOString()});reply(response,{recorded:true})})
api.get('/api/v1/admin/reports',async(request,response)=>{
  const kind=request.query.kind
  if(!['payments','printRevenue','onlinePayments'].includes(kind))return response.status(400).json({success:false,message:'This fixture provides only the three payment reports.'})
  try{
    const report=JSON.parse(await readFile(new URL('../../../output/xendit-sandbox/phase67-'+kind+'.json',import.meta.url),'utf8'))
    if(report.kind!==kind)throw new Error('Synthetic report kind does not match.')
    reply(response,report)
  }catch{response.status(503).json({success:false,message:'Run --phase6 acceptance first to prepare synthetic report data.'})}
})
api.get('/api/v1/fines/me',(_request,response)=>reply(response,{range:{label:'Fine history'},summary:{assessed:100,outstanding:100,collected:0,waived:0,accountsWithBalance:1},items:[fine],pagination:{page:1,limit:100,total:1,totalPages:1}}))
api.get('/api/v1/fines/receipts',(_request,response)=>reply(response,[{receiptId:8,receiptNumber:'XF-QA-ONLY',amountReceived:40,totalReceived:41.4,transactionFeeCentavos:140,paymentMethod:'GCASH',status:'Issued',receivedAt:new Date().toISOString()}]))
api.get('/api/v1/printing/service-status',(_request,response)=>reply(response,{accepting_requests:true,unavailable_reason:null,docx_auto_count_available:false}))
api.get('/api/v1/printing/requests',(_request,response)=>reply(response,[print]))
api.get('/api/v1/printing/receipts',(_request,response)=>reply(response,[]))
api.use((_request,response)=>response.status(404).json({success:false,message:'Disposable fixture does not provide this operation.'}))

let server,vite,createdHtml=false,createdEntry=false
try{
  await writeFile(html,'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local Payment UI QA</title></head><body><div id="root"></div><script type="module" src="/.payment-qa.tsx"></script></body></html>',{flag:'wx'});createdHtml=true
  await writeFile(entry,`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import '/src/index.css';
import {StudentFinesPage} from '/src/features/fines/StudentFinesPage';import {StudentPrintingPage} from '/src/features/printing/StudentPrintingPage';
import {AdminPaymentsPage} from '/src/features/payments/AdminPaymentsPage';import {PaymentResultPage} from '/src/features/payments/PaymentResultPage';import {setSessionIdentity} from '/src/features/auth/auth-storage';
import {OperationalReports} from '/src/features/catalog/OperationalReports';
import {ThemeProvider,useTheme} from '/src/features/theme/ThemeProvider';
function QaTheme(){const {toggleTheme}=useTheme();return <button type="button" className="mb-4 min-h-11 rounded-xl border px-4" onClick={toggleTheme}>Toggle QA theme</button>}
const view=new URLSearchParams(location.search).get('view')||'fines';setSessionIdentity({userId:1,schoolId:'QA-PAYMENT-001',role:['admin','reports'].includes(view)?'Librarian':'Student',source:'session'});
const requestedReport=new URLSearchParams(location.search).get('report'),report=['payments','printRevenue','onlinePayments'].includes(requestedReport??'')?requestedReport:'onlinePayments';
createRoot(document.getElementById('root')!).render(<ThemeProvider><MemoryRouter initialEntries={['/payments/result?payment=${id}'+(view==='reports'?'&kind='+report:'')]}><div className="mx-auto max-w-6xl p-4 sm:p-8"><p className="mb-5 rounded-xl bg-slate-100 p-3 text-sm text-slate-900">Local QA · disposable data only</p><QaTheme/>{view==='admin'?<AdminPaymentsPage/>:view==='reports'?<OperationalReports/>:view==='printing'?<StudentPrintingPage/>:view==='result'?<PaymentResultPage/>:<StudentFinesPage/>}</div></MemoryRouter></ThemeProvider>);`,{flag:'wx'});createdEntry=true
  server=api.listen(47145,'127.0.0.1')
  vite=spawn(process.execPath,[fileURLToPath(new URL('../../../node_modules/vite/bin/vite.js',import.meta.url)),'--host','127.0.0.1','--port','5174'],
    {cwd:fileURLToPath(web),env:{...process.env,VITE_API_PROXY_TARGET:'http://127.0.0.1:47145'},windowsHide:true,stdio:'ignore'})
  await new Promise((resolve,reject)=>{let done=false;const finish=()=>{if(!done){done=true;resolve()}};stopRun=finish;process.once('SIGINT',finish);process.once('SIGTERM',finish);vite.once('error',reject);vite.once('exit',finish);
    console.log('Disposable payment UI at http://127.0.0.1:5174/payment-qa.html with views fines, printing, admin and result.');})
}finally{
  if(vite&&!vite.killed)vite.kill();if(server)await new Promise(resolve=>server.close(resolve))
  if(createdEntry)await unlink(entry);if(createdHtml)await unlink(html)
}
