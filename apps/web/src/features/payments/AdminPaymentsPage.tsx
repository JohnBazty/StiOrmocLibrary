import { notifyPaymentUpdate } from './payment-updates'
import { useCallback,useEffect,useRef,useState } from 'react'
import { Button,PageHeader,SectionCard } from '../../components/ui'
import { getCurrentIdentity } from '../auth/auth-storage'
import { canRefundPayment,downloadPaymentRecord,paymentMoney,paymentsApi,paymentStatus,type Payment } from './payments-api'
import { moneyOutApi } from './money-out-api'
import {PaymentOperationsPanel,SettlementReview} from './PaymentOperationsPanel'
import {RefundReview,VoidFineReview,RefundTimeline} from './RefundReview'

const field='min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-white/25 dark:bg-[#001a4d] dark:text-white'
export function AdminPaymentsPage() {
  const [filters,setFilters]=useState({state:'',channel:'',kind:'',page:1}),[rows,setRows]=useState<Payment[]>([])
  const [total,setTotal]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState('')
  const [methods,setMethods]=useState<Array<{channelCode:string;displayName:string}>>([])
  const [settlement,setSettlement]=useState<Payment|null>(null)
  const [refund,setRefund]=useState<Payment|null>(null),[voidPayment,setVoidPayment]=useState<Payment|null>(null),[local,setLocal]=useState<boolean|null>(null)
  const requestVersion=useRef(0)
  const latestFilters=useRef(filters)
  latestFilters.current=filters
  const latestRows=useRef(rows);latestRows.current=rows
  const syncFlight=useRef(false)
  const canManage=getCurrentIdentity()?.role==='Librarian'
  const load=useCallback(async()=>{const version=++requestVersion.current;setLoading(true);setError('');try{let result=await paymentsApi.list(latestFilters.current);if(canManage&&result.localPreview&&result.items.some(row=>row.refunds?.some(refund=>['Draft','Processing','Review'].includes(refund.state)))){await moneyOutApi.recover();result=await paymentsApi.list(latestFilters.current)}if(version!==requestVersion.current)return;setRows(result.items);setLocal(Boolean(result.localPreview));setTotal(result.pagination.total);setMethods(result.methods??[])}catch(error){if(version!==requestVersion.current)return;setError(error instanceof Error?error.message:'Online payments could not load.')}finally{if(version===requestVersion.current)setLoading(false)}},[canManage])
  useEffect(()=>{void load();return()=>{requestVersion.current++}},[load,filters])
  useEffect(()=>{const refresh=async()=>{if(document.hidden||syncFlight.current)return;syncFlight.current=true;try{await load()}finally{syncFlight.current=false}};const timer=window.setInterval(()=>{if(latestRows.current.some(row=>row.refunds?.some(refund=>['Draft','Processing','Review'].includes(refund.state))||(row.localPreview&&row.kind==='Printing'&&row.state==='Succeeded'&&row.refundEligible!==false)))void refresh()},10000);window.addEventListener('focus',refresh);window.addEventListener('library-payments-updated',refresh);document.addEventListener('visibilitychange',refresh);return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('library-payments-updated',refresh);document.removeEventListener('visibilitychange',refresh)}},[load])
  useEffect(()=>{setRefund(current=>current?rows.find(row=>row.paymentId===current.paymentId)??current:null)},[rows])
  async function action(payment:Payment,run:()=>Promise<unknown>){if(busy)return;setBusy(payment.paymentId);setError('');try{await run();await load()}catch(error){setError(error instanceof Error?error.message:'This payment could not be updated.')}finally{setBusy('')}}
  return <>
    <PageHeader eyebrow="Payment support" title="Online payments" action={<Button variant="secondary" disabled={loading||Boolean(busy)} onClick={()=>void load()}>Refresh</Button>}/>
    <p className="mb-5 max-w-3xl text-sm leading-6">Check a payment before accepting cash. Cancel an online checkout and wait for confirmation before changing its bill. Refunds require library review. Printing payments can be refunded only before printing starts.</p>
    {canManage&&local===false?<PaymentOperationsPanel/>:null}
    {canManage?<a className="mb-5 inline-flex min-h-11 items-center font-semibold underline" href={local?'/librarian/funds':'/librarian/reports?kind=onlinePayments'}>{local?'Open Library funds and refund history':'Open payment reports'}</a>:null}
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
      <p className="text-xs opacity-65">Reference {payment.paymentId.slice(0,8).toUpperCase()} · {new Date(payment.createdAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}{payment.isSample?' · Payment':''}</p>
      {payment.state==='Review'?<p className="text-sm">Check the provider record before any further payment, refund or bill change.</p>:null}
      <div className="flex flex-wrap gap-2"><Button className="min-h-11" variant="secondary" disabled={Boolean(busy)} onClick={()=>void action(payment,()=>paymentsApi.adminCheck(payment.paymentId))}>Check status</Button>
        {canManage&&!payment.refundReview&&!['Succeeded','Cancelled','Expired'].includes(payment.state)?<Button className="min-h-11" variant="ghost" disabled={Boolean(busy)} onClick={()=>void action(payment,()=>paymentsApi.adminCancel(payment.paymentId))}>Cancel online payment</Button>:null}
        {canManage&&payment.receiptId?<Button className="min-h-11" disabled={Boolean(busy)} onClick={()=>void action(payment,()=>downloadPaymentRecord(payment,true))}>Download payment record</Button>:null}
        {canManage&&canRefundPayment(payment)?<Button variant="secondary" className="min-h-11" disabled={Boolean(busy)} onClick={()=>setRefund(payment)}>Refund payment</Button>:null}
        {canManage&&payment.localPreview&&payment.state==='Succeeded'&&payment.kind==='Fine'&&!payment.refundReview&&!payment.refunds?.some(row=>['Draft','Processing','Review'].includes(row.state))&&payment.remainingCentavos>0?<Button variant="ghost" className="min-h-11" disabled={Boolean(busy)} onClick={()=>setVoidPayment(payment)}>Void unpaid remainder</Button>:null}
        {canManage&&!payment.localPreview&&payment.state==='Succeeded'?<Button variant="secondary" className="min-h-11" onClick={()=>setSettlement(payment)}>Settlement evidence</Button>:null}
      </div>
      <div className="payment-ui"><RefundTimeline rows={payment.refunds}/></div>
    </SectionCard>)}</div>
    {!loading&&!rows.length&&!error?<SectionCard className="p-8 text-center">No online payments match these filters.</SectionCard>:null}
    <div className="mt-5 flex flex-wrap items-center justify-end gap-3"><Button variant="secondary" disabled={loading||filters.page===1} onClick={()=>setFilters(value=>({...value,page:value.page-1}))}>Previous</Button><span>Page {filters.page} of {Math.max(1,Math.ceil(total/25))}</span><Button variant="secondary" disabled={loading||filters.page*25>=total} onClick={()=>setFilters(value=>({...value,page:value.page+1}))}>Next</Button></div>
    {settlement?<SettlementReview payment={settlement} onClose={()=>setSettlement(null)}/>:null}
    {refund?<RefundReview payment={refund} onClose={()=>setRefund(null)} onSaved={()=>notifyPaymentUpdate()}/>:null}
    {voidPayment?<VoidFineReview payment={voidPayment} onClose={()=>setVoidPayment(null)} onSaved={()=>void load()}/>:null}
  </>
}
