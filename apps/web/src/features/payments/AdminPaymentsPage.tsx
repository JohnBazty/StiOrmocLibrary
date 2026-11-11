import { useCallback,useEffect,useRef,useState } from 'react'
import { Button,PageHeader,SectionCard } from '../../components/ui'
import { getCurrentIdentity } from '../auth/auth-storage'
import { downloadPaymentRecord,paymentMoney,paymentsApi,paymentStatus,type Payment } from './payments-api'
import {PaymentOperationsPanel,SettlementReview} from './PaymentOperationsPanel'

const field='min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-white/25 dark:bg-[#001a4d] dark:text-white'
export function AdminPaymentsPage() {
  const [filters,setFilters]=useState({state:'',channel:'',kind:'',page:1}),[rows,setRows]=useState<Payment[]>([])
  const [total,setTotal]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState('')
  const [methods,setMethods]=useState<Array<{channelCode:string;displayName:string}>>([])
  const [settlement,setSettlement]=useState<Payment|null>(null)
  const requestVersion=useRef(0)
  const latestFilters=useRef(filters)
  latestFilters.current=filters
  const canManage=getCurrentIdentity()?.role==='Librarian'
  const load=useCallback(async()=>{const version=++requestVersion.current;setLoading(true);setError('');try{const result=await paymentsApi.list(latestFilters.current);if(version!==requestVersion.current)return;setRows(result.items);setTotal(result.pagination.total);setMethods(result.methods??[])}catch(error){if(version!==requestVersion.current)return;setRows([]);setTotal(0);setError(error instanceof Error?error.message:'Online payments could not load.')}finally{if(version===requestVersion.current)setLoading(false)}},[])
  useEffect(()=>{void load();return()=>{requestVersion.current++}},[load,filters])
  async function action(payment:Payment,run:()=>Promise<unknown>){if(busy)return;setBusy(payment.paymentId);setError('');try{await run();await load()}catch(error){setError(error instanceof Error?error.message:'This payment could not be updated.')}finally{setBusy('')}}
  return <>
    <PageHeader eyebrow="Payment support" title="Online payments" action={<Button variant="secondary" disabled={loading||Boolean(busy)} onClick={()=>void load()}>Refresh</Button>}/>
    <p className="mb-5 max-w-3xl text-sm leading-6">Check a payment before accepting cash. Cancel an online checkout and wait for confirmation before changing its bill. Refunds require library review.</p>
    {canManage?<PaymentOperationsPanel/>:null}
    {canManage?<a className="mb-5 inline-flex min-h-11 items-center font-semibold underline" href="/librarian/reports?kind=onlinePayments">Open payment reports</a>:null}
    <SectionCard className="mb-5 grid gap-4 p-4 sm:grid-cols-3">
      <label className="text-sm font-semibold">Payment status<select className={field+' mt-2'} value={filters.state} onChange={event=>setFilters(value=>({...value,state:event.target.value,page:1}))}>
        <option value="">All statuses</option>{[['Active','Payment in progress'],['Creating','Waiting for confirmation'],['Prepared','Ready to continue'],['Succeeded','Paid / partially paid'],['Review','Needs review'],['Cancelled','Cancelled'],['Expired','Expired']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-sm font-semibold">Payment method<select className={field+' mt-2'} value={filters.channel} onChange={event=>setFilters(value=>({...value,channel:event.target.value,page:1}))}><option value="">All methods</option>{methods.map(method=><option key={method.channelCode} value={method.channelCode}>{method.displayName}</option>)}</select></label>
      <label className="text-sm font-semibold">Payment for<select className={field+' mt-2'} value={filters.kind} onChange={event=>setFilters(value=>({...value,kind:event.target.value,page:1}))}><option value="">Printing and fines</option><option value="Printing">Printing</option><option value="Fine">Library fine</option><option value="LostBook">Lost-book charge</option></select></label>
    </SectionCard>
    {error?<p role="alert" className="auth-error mb-4 rounded-xl p-4">{error}</p>:null}
    {loading?<p role="status" className="p-5">Loading online payments…</p>:null}
    <div className="space-y-4">{rows.map(payment=><SectionCard key={payment.paymentId} className="space-y-4 p-5">
      <div className="flex flex-wrap justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-lg font-bold">{payment.payerName??'Library user'}</h2><p className="break-words text-sm opacity-70">{payment.schoolId} · {payment.description??payment.kind}</p></div><p className="font-semibold">{paymentStatus(payment)}</p></div>
      <dl className="grid gap-3 text-sm tabular-nums sm:grid-cols-4">{[['Principal',paymentMoney(payment.principalCentavos)],['Transaction fee',paymentMoney(payment.feeCentavos)],['Total',paymentMoney(payment.totalCentavos)],['Method',payment.channelCode]].map(([label,value])=><div key={label}><dt className="opacity-65">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl>
      <p className="text-xs opacity-65">Reference {payment.paymentId.slice(0,8).toUpperCase()} · {new Date(payment.createdAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}{payment.isSample?' · Sandbox test':''}</p>
      {payment.state==='Review'?<p className="text-sm">Check the provider record before any further payment, refund or bill change.</p>:null}
      <div className="flex flex-wrap gap-2"><Button className="min-h-11" variant="secondary" disabled={Boolean(busy)} onClick={()=>void action(payment,()=>paymentsApi.adminCheck(payment.paymentId))}>Check status</Button>
        {canManage&&!payment.refundReview&&!['Succeeded','Cancelled','Expired'].includes(payment.state)?<Button className="min-h-11" variant="ghost" disabled={Boolean(busy)} onClick={()=>void action(payment,()=>paymentsApi.adminCancel(payment.paymentId))}>Cancel online payment</Button>:null}
        {canManage&&payment.receiptId?<Button className="min-h-11" disabled={Boolean(busy)} onClick={()=>void action(payment,()=>downloadPaymentRecord(payment,true))}>Download payment record</Button>:null}
        {canManage&&payment.state==='Succeeded'?<Button variant="secondary" className="min-h-11" onClick={()=>setSettlement(payment)}>Settlement evidence</Button>:null}
      </div>
    </SectionCard>)}</div>
    {!loading&&!rows.length&&!error?<SectionCard className="p-8 text-center">No online payments match these filters.</SectionCard>:null}
    <div className="mt-5 flex flex-wrap items-center justify-end gap-3"><Button variant="secondary" disabled={loading||filters.page===1} onClick={()=>setFilters(value=>({...value,page:value.page-1}))}>Previous</Button><span>Page {filters.page} of {Math.max(1,Math.ceil(total/25))}</span><Button variant="secondary" disabled={loading||filters.page*25>=total} onClick={()=>setFilters(value=>({...value,page:value.page+1}))}>Next</Button></div>
    {settlement?<SettlementReview payment={settlement} onClose={()=>setSettlement(null)}/>:null}
  </>
}
