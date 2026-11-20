import { PayLaterNotice } from './PayLaterNotice'
import { usePaymentUpdates } from '../payments/payment-updates'
import {Link} from 'react-router-dom'
import {getCurrentIdentity} from '../auth/auth-storage'
import { PrintingInvoice } from './PrintingInvoice'
import { PaymentAction } from '../payments/PaymentAction'
import {paymentsApi} from '../payments/payments-api'
import {paymentResultPath} from '../payments/payment-navigation'
import { CheckCircle2, FileText } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PrintRequestForm } from './PrintRequestForm'
import { PrintAnalysisSummary } from './PrintAnalysisSummary'
import { PrintingDialog } from './PrintingDialog'
import { DocumentPreview } from './DocumentPreview'
import { Button, PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { printingApi, type PricingRule, type PrintRequest, type ServiceStatus } from './printing-api'
import { RefreshButton } from '../../components/RefreshButton'

export function StudentPrintingPage(){
  const [service,setService]=useState<ServiceStatus|null>(null)
  const [requests,setRequests]=useState<PrintRequest[]>([])
  const [paymentVersion,setPaymentVersion]=useState(0),[quoteRefresh,setQuoteRefresh]=useState(0)
  const refreshFlight=useRef<Promise<void>|null>(null)
  const prefix=getCurrentIdentity()?.role==='Faculty'?'/faculty':'/student'
  const [pricing,setPricing]=useState<PricingRule[]>([])
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[success,setSuccess]=useState('')
  const [preview,setPreview]=useState<string|null>(null),[acceptingRow,setAcceptingRow]=useState<PrintRequest|null>(null),[acceptBusy,setAcceptBusy]=useState(false)
  const load=()=>{
    if(refreshFlight.current)return refreshFlight.current
    refreshFlight.current=(async()=>{
      setError('')
      const results=await Promise.allSettled([
        printingApi.serviceStatus().then(setService),
        printingApi.pricing().then(setPricing),
        paymentsApi.sync().catch(()=>undefined).then(()=>printingApi.mine()).then(rows=>{setRequests(rows);setPaymentVersion(value=>value+1)}),
      ])
      const messages=results.flatMap(result=>result.status==='rejected'?[result.reason instanceof Error?result.reason.message:'Unable to load printing service.']:[])
      setError([...new Set(messages)].join(' '));setLoading(false)
    })().finally(()=>{refreshFlight.current=null})
    return refreshFlight.current
  }
  useEffect(()=>{void load()},[])
  usePaymentUpdates(load)
  const acceptPrice=async()=>{if(!acceptingRow)return;setAcceptBusy(true);setError('');try{await printingApi.acceptPrice(acceptingRow);setAcceptingRow(null);setSuccess('Price accepted. Payment options are now available.');await load()}catch(e){setError(e instanceof Error?e.message:'Unable to accept price.');await load()}finally{setAcceptBusy(false)}}
  const cancel=async(id:number)=>{setError('');try{await printingApi.cancel(id);await load()}catch(e){setError(e instanceof Error?e.message:'Unable to cancel request.')}}

  return <>
    <PageHeader eyebrow="Online service" title="Printing service" action={<RefreshButton onRefresh={()=>{void load();setQuoteRefresh(v=>v+1)}} variant="secondary" />}/>
    {error&&<div role="alert" className="mb-4 rounded-xl bg-red-700 p-3 text-sm font-bold text-white">{error}</div>}
    {success&&<div role="status" data-tone="success" className="mb-4 flex gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900"><CheckCircle2 size={17}/>{success}</div>}
    <div className="grid gap-5 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
      <PrintRequestForm service={service} pricing={pricing} onSubmitted={load} refreshKey={quoteRefresh}/>
      <SectionCard className="overflow-hidden"><div className="border-b border-[#0b5ea2]/15 p-5"><h2 className="font-bold text-[#0b5ea2]">My print requests</h2></div><div className="divide-y divide-[#0b5ea2]/10">{loading?<p className="p-10 text-center text-[#0b5ea2]">Loading requests…</p>:requests.length===0?<p className="p-10 text-center font-semibold text-[#0b5ea2]">No print requests yet.</p>:requests.map(r=><div key={r.request_id} className="p-5"><PrintingInvoice request={r} /><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><span className="rounded-xl bg-[#0b5ea2]/5 p-3 text-[#0b5ea2]"><FileText size={20}/></span><div className="min-w-0 flex-1"><p className="truncate font-bold text-[#0b5ea2]">{r.file_name}{r.documents_expired_at?<span className="ml-2 text-xs font-normal">Document expired · history retained</span>:null}</p><p className="mt-1 text-xs text-[#0b5ea2]/65">{r.service_kind??'Print'} · {r.page_count} pages · {r.number_of_copies} copies · {r.output_mode??r.print_type} · {r.paper_size}</p></div><div className="flex items-center gap-2"><StatusBadge status={r.payment_status}/><StatusBadge status={r.job_status}/></div></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="font-bold text-[#0b5ea2]">Total ₱{Number(r.calculated_cost).toFixed(2)}{r.payment_status==='Partially Paid'&&<span className="ml-3 text-sm">Due ₱{Number(r.balance??r.calculated_cost).toFixed(2)}</span>}</p><div className="flex gap-2">{r.localPaymentId&&<Link className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold" to={paymentResultPath({paymentId:r.localPaymentId})}>View payment</Link>}{r.print_receipt_id&&<Link className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold" to={prefix+'/transactions?search='+encodeURIComponent(r.receipt_number??'')}>View transaction</Link>}{r.job_status==='Pending'&&r.payment_status==='Unpaid'&&<Button variant="secondary" onClick={()=>void cancel(r.request_id)}>Cancel</Button>}</div></div>{r.pricing_review_state&&r.pricing_review_state!=='Ready'&&r.job_status!=='Cancelled'&&<div className="mt-3 rounded-xl border p-3 text-sm"><p className="font-semibold">{r.pricing_review_state==='Pending'?'Waiting for staff page review':'Final price ready for your confirmation'}</p>{r.pricing_review_state==='Awaiting confirmation'&&<><PrintAnalysisSummary bill={r.pricing_snapshot} pages={r.page_findings}/><Button className="mt-3" onClick={()=>setAcceptingRow(r)}>Review final price</Button></>}</div>}<PayLaterNotice row={r} onUpdated={load}/>{!r.documents_expired_at&&r.service_kind!=='Photocopy'&&<Button variant="secondary" className="mt-3" onClick={()=>setPreview(`/api/v1/printing/requests/${r.request_id}/preview`)}>Preview document</Button>}{(!r.pricing_review_state||r.pricing_review_state==='Ready')&&['Unpaid','Partially Paid'].includes(r.payment_status)&&r.job_status!=='Cancelled'?(r.preferred_payment_method==='Cash'?<p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">Selected payment: <strong>Pay cash at library counter</strong>. Present this request to library staff to settle in cash.</p>:<PaymentAction kind="Printing" targetId={r.request_id} title={r.file_name} refreshKey={paymentVersion} onUpdated={()=>void load()}/>):null}</div>)}</div></SectionCard>
    </div>
    <DocumentPreview url={preview} onClose={()=>setPreview(null)}/>
    {acceptingRow&&<PrintingDialog title="Confirm final price" onClose={()=>{if(!acceptBusy)setAcceptingRow(null)}}><p className="mb-3 text-sm">Request #{acceptingRow.request_id} · {acceptingRow.file_name}</p><PrintAnalysisSummary bill={acceptingRow.pricing_snapshot} pages={acceptingRow.page_findings}/><p className="my-4 text-sm">Accept this price to enable payment. You can cancel an unpaid request instead.</p><Button disabled={acceptBusy} className="w-full" onClick={()=>void acceptPrice()}>{acceptBusy?'Saving…':`Accept ₱${Number(acceptingRow.calculated_cost).toFixed(2)}`}</Button></PrintingDialog>}
    <p className="mt-5 text-sm opacity-75">Your online and onsite payment records are in <Link className="font-semibold underline" to={prefix+'/transactions'}>Transactions</Link>.</p>
  </>
}
