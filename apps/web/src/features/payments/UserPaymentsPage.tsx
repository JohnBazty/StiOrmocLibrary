import {useCallback,useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {ArrowUpRight,CheckCircle2,Clock3,CreditCard,Download,Printer,ReceiptText,RefreshCw,ShieldCheck} from 'lucide-react'
import {Button,PageHeader,SectionCard} from '../../components/ui'
import {getCurrentIdentity} from '../auth/auth-storage'
import {finesApi} from '../fines/fines-api'
import type {FineList,FineReceiptSummary} from '../fines/types'
import {fineDate} from '../fines/fine-format'
import {printingApi,type PrintRequest,type PrintingReceipt} from '../printing/printing-api'
import {PaymentAction,PaymentStatusPanel,PaymentSummary} from './PaymentAction'
import {paymentMoney,paymentsApi,type Payment} from './payments-api'

type Tab='unpaid'|'pending'|'history'
const errorText=(error:unknown)=>error instanceof Error?error.message:'Payment records could not load. Please try again.'
const card='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/15 dark:bg-white/5'
const empty='rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-white/25'

function Pager({page,pages,onChange}:{page:number;pages:number;onChange:(page:number)=>void}){
  if(pages<=1)return null
  return <nav aria-label="Payment pages" className="flex flex-wrap items-center justify-end gap-3 py-3"><Button variant="secondary" className="min-h-11" disabled={page===1} onClick={()=>onChange(page-1)}>Previous</Button><span className="text-sm">Page {page} of {pages}</span><Button variant="secondary" className="min-h-11" disabled={page>=pages} onClick={()=>onChange(page+1)}>Next</Button></nav>
}

function UnpaidCharges({version,refresh,prefix}:{version:number;refresh:()=>void;prefix:string}){
  const [fines,setFines]=useState<FineList|null>(null),[prints,setPrints]=useState<PrintRequest[]|null>(null)
  const [fineError,setFineError]=useState(''),[printError,setPrintError]=useState(''),[finePage,setFinePage]=useState(1),[printPage,setPrintPage]=useState(1)
  useEffect(()=>{let active=true;setFines(null);setFineError('');void finesApi.mine({search:'',status:'outstanding',type:'all',period:'all',page:finePage,limit:10}).then(value=>{if(active)setFines(value)}).catch(error=>{if(active)setFineError(errorText(error))});return()=>{active=false}},[version,finePage])
  useEffect(()=>{let active=true;setPrints(null);setPrintError('');void printingApi.mine().then(value=>{if(active){setPrints(value.filter(row=>row.payment_status==='Unpaid'&&row.job_status!=='Cancelled'&&Number(row.calculated_cost)>0));setPrintPage(1)}}).catch(error=>{if(active)setPrintError(errorText(error))});return()=>{active=false}},[version])
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2">{[['Printing to pay',prints?paymentMoney(prints.reduce((sum,row)=>sum+Math.round(Number(row.calculated_cost)*100),0)):'—'],['Fines to pay',fines?paymentMoney(Math.round(fines.summary.outstanding*100)):'—']].map(([label,value])=><div key={label} className={card}><p className="text-sm text-slate-600 dark:text-slate-300">{label}</p><p className="mt-2 text-3xl font-bold tabular-nums">{value}</p><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Online fees appear before you confirm.</p></div>)}</div>
    <div className="grid items-start gap-6 xl:grid-cols-2">
      <section aria-label="Unpaid printing" className="min-w-0 space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-xl font-bold"><Printer size={21} aria-hidden="true"/>Printing</h2><Link className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold underline" to={prefix+'/printing'}>Printing service<ArrowUpRight size={16}/></Link></div>
        {printError?<p role="alert" className="auth-error rounded-xl p-4">{printError}</p>:!prints?<p role="status">Loading printing bills…</p>:prints.length?prints.slice((printPage-1)*10,printPage*10).map(row=><article key={row.request_id} className={card}><p className="text-sm text-slate-600 dark:text-slate-300">Printing bill</p><h3 className="mt-1 break-words text-lg font-semibold">{row.file_name}</h3><p className="mt-3 text-2xl font-bold tabular-nums">{paymentMoney(Math.round(Number(row.calculated_cost)*100))}</p><PaymentAction kind="Printing" targetId={row.request_id} title={row.file_name} onUpdated={refresh} refreshKey={version}/></article>):<div className={empty}><CheckCircle2 className="mx-auto mb-3 text-emerald-600"/><p className="font-semibold">No unpaid printing bills</p></div>}
        <Pager page={printPage} pages={Math.ceil((prints?.length??0)/10)} onChange={setPrintPage}/>
      </section>
      <section aria-label="Unpaid fines" className="min-w-0 space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-xl font-bold"><ReceiptText size={21} aria-hidden="true"/>Fines & replacement charges</h2><Link className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold underline" to={prefix+'/fines'}>Fine details<ArrowUpRight size={16}/></Link></div>
        {fineError?<p role="alert" className="auth-error rounded-xl p-4">{fineError}</p>:!fines?<p role="status">Loading fines…</p>:fines.items.length?fines.items.map(row=><article key={row.id} className={card}><p className="text-sm text-slate-600 dark:text-slate-300">{row.lostBookReportId?'Replacement charge':'Library fine'}</p><h3 className="mt-1 break-words text-lg font-semibold">{row.title}</h3><p className="mt-2 break-words text-sm leading-6 text-slate-600 dark:text-slate-300">{row.reason}</p><p className="mt-3 text-2xl font-bold tabular-nums">{paymentMoney(Math.round(row.balance*100))}</p>{!row.paymentAllowed?<p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-300/10 dark:text-amber-100">Return the overdue book or ask the library to confirm this charge before paying.</p>:null}<PaymentAction kind={row.fineId?'Fine':'LostBook'} targetId={row.fineId??row.lostBookReportId!} title={row.title} allowNew={row.paymentAllowed} onUpdated={refresh} refreshKey={version}/></article>):<div className={empty}><CheckCircle2 className="mx-auto mb-3 text-emerald-600"/><p className="font-semibold">No outstanding fines</p></div>}
        <Pager page={finePage} pages={fines?.pagination.totalPages??1} onChange={setFinePage}/>
      </section>
    </div>
  </div>
}

function PaymentActivity({view,version,refresh}:{view:'pending'|'history';version:number;refresh:()=>void}){
  const [data,setData]=useState<Awaited<ReturnType<typeof paymentsApi.mine>>|null>(null),[error,setError]=useState(''),[page,setPage]=useState(1)
  useEffect(()=>{let active=true;setData(null);setError('');void paymentsApi.mine(view,page).then(value=>{if(active)setData(value)}).catch(error=>{if(active)setError(errorText(error))});return()=>{active=false}},[view,page,version])
  return <section aria-label={view==='pending'?'Pending online payments':'Online payment history'} className="space-y-4">
    {error?<p role="alert" className="auth-error rounded-xl p-4">{error}</p>:!data?<p role="status">Loading payments…</p>:<>
      {!data.enabled?<p className="rounded-xl bg-slate-100 p-4 text-sm dark:bg-white/10">Online payments are unavailable. You can still pay cash at the library.</p>:null}
      {data.items.length?<div className="grid gap-5 lg:grid-cols-2">{data.items.map(payment=><article key={payment.paymentId} className={card}><h2 className="break-words text-lg font-semibold">{payment.description??(payment.kind==='Printing'?'Printing bill':payment.kind==='LostBook'?'Replacement charge':'Library fine')}</h2><p className="my-3 text-sm text-slate-600 dark:text-slate-300">{fineDate(payment.createdAt)} · {payment.channelCode==='QRPH'?'QRPh':payment.channelCode}</p><PaymentSummary payment={payment}/><div className="mt-4"><PaymentStatusPanel payment={payment} onChange={(next:Payment)=>{setData(current=>current?{...current,items:current.items.map(row=>row.paymentId===next.paymentId?next:row)}:current)}} onUpdated={refresh}/></div></article>)}</div>:<div className={empty}><Clock3 className="mx-auto mb-3 text-slate-500"/><h2 className="font-semibold">{view==='pending'?'No pending online payments':'No online payment history yet'}</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{view==='pending'?'Payments awaiting confirmation will appear here.':'Completed, expired and cancelled online payments will appear here.'}</p></div>}
      <Pager page={page} pages={Math.ceil(data.pagination.total/data.pagination.limit)} onChange={setPage}/>
    </>}
  </section>
}

function CounterHistory({version}:{version:number}){
  const [data,setData]=useState<{fines:FineReceiptSummary[];prints:PrintingReceipt[]}|null>(null),[error,setError]=useState(''),[downloadError,setDownloadError]=useState(''),[downloading,setDownloading]=useState<string|null>(null)
  useEffect(()=>{let active=true;setError('');setData(null);void Promise.all([finesApi.receipts(),printingApi.receipts()]).then(([fines,prints])=>{if(active)setData({fines:fines.filter(row=>row.confirmationSource!=='Xendit'),prints:prints.filter(row=>row.confirmation_source!=='Xendit')})}).catch(error=>{if(active)setError(errorText(error))});return()=>{active=false}},[version])
  const rows=data?[...data.fines.map(row=>({key:'fine:'+row.receiptId,number:row.receiptNumber,method:row.paymentMethod,amount:row.totalReceived??row.amountReceived,date:row.receivedAt,status:row.status,download:()=>finesApi.downloadReceipt(row.receiptId,row.receiptNumber)})),...data.prints.map(row=>({key:'print:'+row.print_receipt_id,number:row.receipt_number,method:row.payment_method,amount:Number(row.total_received??row.amount_received),date:row.received_at,status:row.receipt_status,download:()=>printingApi.downloadReceipt(row)}))].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()):[]
  async function download(row:typeof rows[number]){if(downloading)return;setDownloading(row.key);setDownloadError('');try{await row.download()}catch(error){setDownloadError(errorText(error))}finally{setDownloading(null)}}
  return <section aria-label="Counter payment history" className="space-y-4"><h2 className="text-xl font-bold">Counter payment records</h2>{error?<p role="alert" className="auth-error rounded-xl p-4">{error}</p>:!data?<p role="status">Loading cash records…</p>:rows.length?<div className="grid gap-4 lg:grid-cols-2">{rows.map(row=><article key={row.key} className={card}><p className="break-words font-semibold">{row.number}</p><p className="mt-2 text-sm">{row.method} · {fineDate(row.date)} · {row.status}</p><p className="my-3 text-2xl font-bold">{paymentMoney(Math.round(row.amount*100))}</p><Button variant="secondary" disabled={!!downloading} aria-label={'Download '+row.number} onClick={()=>void download(row)}><Download size={17}/>Download payment record</Button></article>)}</div>:<p className="text-sm text-slate-600 dark:text-slate-300">No counter payment records yet.</p>}{downloadError?<p role="alert" className="auth-error rounded-xl p-4">{downloadError}</p>:null}</section>
}

export function UserPaymentsPage(){
  const [tab,setTab]=useState<Tab>('unpaid'),[version,setVersion]=useState(0)
  const refresh=useCallback(()=>setVersion(value=>value+1),[])
  const prefix=getCurrentIdentity()?.role==='Faculty'?'/faculty':'/student'
  return <div className="mx-auto max-w-6xl space-y-6 text-base text-slate-900 dark:text-white">
    <PageHeader eyebrow="Your library account" title="Payments" action={<Button variant="secondary" className="min-h-11" onClick={refresh}><RefreshCw size={17}/>Refresh payments</Button>}/>
    <SectionCard className="overflow-hidden p-5 sm:p-6"><div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200"><CreditCard size={25}/></span><div><h2 className="text-xl font-bold">Pay your library charges</h2><p className="mt-2 max-w-2xl leading-7 text-slate-600 dark:text-slate-300">Choose a bill, review the total, then pay securely. QR and wallet options appear when available for your payment.</p><p className="mt-3 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300"><ShieldCheck size={18} className="shrink-0"/>Your bill updates after verified confirmation. Cash is also accepted at the library.</p></div></div></SectionCard>
    <div role="group" aria-label="Payment views" className="flex flex-wrap gap-2 rounded-2xl bg-slate-100 p-2 dark:bg-white/5">{([['unpaid','Unpaid'],['pending','Pending'],['history','Payment history']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={tab===value} onClick={()=>setTab(value)} className={'min-h-12 flex-1 rounded-xl px-4 py-3 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 '+(tab===value?'bg-white text-blue-800 shadow-sm dark:bg-white/15 dark:text-white':'text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/10')}>{label}</button>)}</div>
    {tab==='unpaid'?<UnpaidCharges version={version} refresh={refresh} prefix={prefix}/>:<PaymentActivity key={tab} view={tab} version={version} refresh={refresh}/>}
    {tab==='history'?<CounterHistory version={version}/>:null}
  </div>
}
