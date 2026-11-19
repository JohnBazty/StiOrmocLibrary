import { ExportMenu } from '../../components/ExportMenu'
import {getCurrentIdentity} from '../auth/auth-storage'

import { PrintCounterPaymentDialog } from './PrintCounterPaymentDialog'

import { PaymentProofPanel } from '../payments/PaymentProofPanel'

import { PrintingDialog } from './PrintingDialog'

import { PrintPriceReview } from './PrintPriceReview'

import {DocumentRetentionPanel} from './DocumentRetentionPanel'

import { DocumentPreview } from './DocumentPreview'

import { RowActions } from '../../components/RowActions'

import { PrintingInvoice } from './PrintingInvoice'

import { ResponsiveTable } from '../../components/ResponsiveTable'

import { Clock3, Download, Eye, PackageCheck, Printer, RefreshCw, Search, WalletCards } from 'lucide-react'

import { useCallback, useEffect, useRef, useState } from 'react'

import { Button, PageHeader, SectionCard, StatCard, StatusBadge } from '../../components/ui'

import { printingApi, type PrintRequest, type PrintingReceipt, type PrintSummary, type PrintQueueFilters } from './printing-api'

import { PrintingReceiptModal } from './PrintingReceiptModal'

import { moneyOutApi } from '../payments/money-out-api'



const field='h-10 rounded-xl border border-[#0b5ea2]/20 bg-[#FFFFFF] px-3 text-sm text-[#0b5ea2] outline-none focus:border-[#0b5ea2]'



export function AdminPrintingQueuePage(){

  const [counterRow,setCounterRow]=useState<PrintRequest|null>(null),[proofId,setProofId]=useState<string|null>(null)

  const [reviewRow,setReviewRow]=useState<PrintRequest|null>(null),[preview,setPreview]=useState<string|null>(null)

  const [summary,setSummary]=useState<PrintSummary|null>(null),[rows,setRows]=useState<PrintRequest[]>([])

  const [section,setSection]=useState<'active'|'history'|'retention'>('active')
  const [filters,setFilters]=useState<PrintQueueFilters>({q:'',status:'',payment:'',scope:'active',page:1,limit:25})
  const [pagination,setPagination]=useState({page:1,limit:25,total:0,total_pages:0})
  const visibleRows=rows.filter(row=>filters.scope==='history'?['Completed','Cancelled'].includes(row.job_status):!['Completed','Cancelled'].includes(row.job_status))
  function openSection(next: 'active'|'history'|'retention') {
    setSection(next)
    if(next!=='retention') {setLoading(true); setFilters(value=>({...value,scope:next,status:'',page:1}))}
  }

  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState(''),[exporting,setExporting]=useState(false)

  const [selectedReceipt,setSelectedReceipt]=useState<PrintingReceipt|null>(null),[downloadingReceipt,setDownloadingReceipt]=useState(false)

  const [pauseReason,setPauseReason]=useState('Temporarily paused by library staff.')

  const accepting=Boolean(summary&&Number(summary.service_status?.accepting_requests))

  const manuallyAccepting=Boolean(Number(summary?.service_status?.manually_accepting_requests??summary?.service_status?.accepting_requests))

  const currentFilters=useRef(filters);currentFilters.current=filters

  const requestVersion=useRef(0),polling=useRef(false)

  const load=useCallback(async()=>{const version=++requestVersion.current;setError('');try{let[s,q]=await Promise.all([printingApi.summary(),printingApi.queue(currentFilters.current)]);if(s.localPreview&&q.rows.some(row=>row.refund_pending)){await moneyOutApi.recover();[s,q]=await Promise.all([printingApi.summary(),printingApi.queue(currentFilters.current)])}if(version!==requestVersion.current)return;setSummary(s);setRows(q.rows);setPagination(q.pagination??{page:currentFilters.current.page??1,limit:25,total:q.rows.length,total_pages:1});if(s.service_status?.unavailable_reason)setPauseReason(s.service_status.unavailable_reason)}catch(e){if(version===requestVersion.current)setError(e instanceof Error?e.message:'Unable to load the print queue.')}finally{if(version===requestVersion.current)setLoading(false)}},[])

  useEffect(()=>{setLoading(true);setRows([]);const timer=setTimeout(()=>void load(),250);return()=>{clearTimeout(timer);requestVersion.current++}},[load,filters.q,filters.status,filters.payment,filters.scope,filters.page])

  useEffect(()=>{const refresh=async()=>{if(document.hidden||polling.current)return;polling.current=true;try{await load()}finally{polling.current=false}};const timer=window.setInterval(refresh,10000);window.addEventListener('focus',refresh);window.addEventListener('library-payments-updated',refresh);document.addEventListener('visibilitychange',refresh);return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('library-payments-updated',refresh);document.removeEventListener('visibilitychange',refresh)}},[load])

  const action=async(key:string,fn:()=>Promise<unknown>)=>{setBusy(key);setError('');try{await fn();await load()}catch(e){setError(e instanceof Error?e.message:'Unable to update the print request.')}finally{setBusy('')}}

  const exportPdf=async()=>{setExporting(true);try{await printingApi.printReport({...filters,page:undefined})}catch(e){setError(e instanceof Error?e.message:'Unable to export the report.')}finally{setExporting(false)}}

  const viewReceipt=async(id:number)=>{setBusy(`receipt-${id}`);setError('');try{setSelectedReceipt(await printingApi.receipt(id,true))}catch(e){setError(e instanceof Error?e.message:'Unable to load the printing receipt.')}finally{setBusy('')}}

  const downloadReceipt=async(receipt:PrintingReceipt)=>{setDownloadingReceipt(true);setError('');try{await printingApi.downloadReceipt(receipt,true)}catch(e){setError(e instanceof Error?e.message:'Unable to download the printing receipt.')}finally{setDownloadingReceipt(false)}}



  return <>

    <PageHeader eyebrow="Service operations" title="Printing queue" action={<div className="flex flex-wrap gap-2"><a href="/librarian/payments" className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold">Online payments</a>{section!=='retention'?<Button variant="secondary" onClick={()=>void load()}><RefreshCw size={15}/>Refresh</Button>:null}{section!=='retention'?<ExportMenu label="Export filtered results" disabled={exporting} exports={[{label:exporting?'Preparing PDF…':'PDF',onSelect:()=>void exportPdf()}]}/>:null}</div>}/>
    <nav aria-label="Printing tasks" className="mb-5 flex flex-wrap gap-2">
      {([['active','Active queue'],['history','History'],...(getCurrentIdentity()?.role==='Librarian'?[['retention','Document retention']]:[])] as Array<['active'|'history'|'retention',string]>).map(([key,label])=><Button key={key} variant={section===key?'primary':'secondary'} aria-pressed={section===key} onClick={()=>openSection(key)}>{label}</Button>)}
    </nav>
    {section==='retention'?<DocumentRetentionPanel/>:null}
    {section!=='retention'?<>
    {error&&<div role="alert" className="mb-4 rounded-xl bg-[#FFF200] p-3 text-sm font-bold text-[#0b5ea2]">{error}</div>}

    <SectionCard className="mb-5 flex flex-col gap-3 p-4 md:flex-row md:items-end"><div className="flex-1"><p className="text-xs font-bold uppercase tracking-wider text-[#0b5ea2]/65">Student request availability</p><p className="mt-1 font-bold text-[#0b5ea2]">{!summary ? loading ? 'Loading printing service…' : 'Printing service status unavailable.' : accepting?'Accepting print requests':manuallyAccepting?'Outside printing hours':'Print requests are paused'}</p>{summary&&!manuallyAccepting&&<input aria-label="Printing unavailable reason" className={`${field} mt-2 w-full`} value={pauseReason} onChange={e=>setPauseReason(e.target.value)} maxLength={255}/>}</div>{summary&&<Button variant={manuallyAccepting?'secondary':'primary'} disabled={busy!==''||loading} onClick={()=>void action('service-status',()=>printingApi.setServiceStatus(!manuallyAccepting,manuallyAccepting?pauseReason:undefined))}>{manuallyAccepting?'Pause requests':'Resume requests'}</Button>}</SectionCard>

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><StatCard label="Pending" value={summary?.pending_jobs??'—'} icon={Clock3}/><StatCard label="Printing" value={summary?.printing_jobs??'—'} icon={Printer}/><StatCard label="Ready" value={summary?.ready_jobs??'—'} icon={PackageCheck}/><StatCard label="Unpaid" value={summary?.unpaid_jobs??'—'} icon={WalletCards}/><StatCard label="Payments applied today" value={summary?`₱${Number(summary.revenue_today).toFixed(2)}`:'—'} icon={WalletCards}/></div>

    <SectionCard className="mb-5 p-4"><div className="grid gap-3 md:grid-cols-3"><label className={`${field} flex items-center gap-2`}><Search size={15}/><input aria-label="Find print request" className="w-full outline-none" placeholder="User, ID, request, receipt, or verification" value={filters.q} onChange={e=>setFilters(v=>({...v,q:e.target.value,page:1}))}/></label><select aria-label="Job status" className={field} value={filters.status} onChange={e=>setFilters(v=>({...v,status:e.target.value,page:1}))}><option value="">All job statuses</option>{(section==='history'?['Completed','Cancelled']:['Pending','Printing','Ready for Pickup']).map(v=><option key={v}>{v}</option>)}</select><select aria-label="Payment status" className={field} value={filters.payment} onChange={e=>setFilters(v=>({...v,payment:e.target.value,page:1}))}><option value="">All payment states</option><option>Unpaid</option><option>Partially Paid</option><option>Paid</option><option>Refund pending</option><option>Refunded</option></select></div></SectionCard>

    <SectionCard className="overflow-hidden"><div className="border-b border-[#0b5ea2]/15 p-5"><h2 className="font-bold text-[#0b5ea2]">{section==='history'?'Completed and cancelled jobs':'Active print requests'}</h2><p className="mt-1 text-sm opacity-70">{section==='history'?'Completed and cancelled requests retain their payment and document history.':'Active requests appear in submission order, oldest first.'}</p></div><ResponsiveTable><table className="w-full min-w-[1120px] text-left text-sm"><thead className="bg-[#0b5ea2] text-[#FFFFFF]"><tr>{['Request / user','Document','Configuration','Cost / payment','Payment record','Status','Actions'].map(h=><th className="px-4 py-3 text-xs" key={h}>{h}</th>)}</tr></thead><tbody>{loading?<tr><td colSpan={7} className="p-10 text-center text-[#0b5ea2]">Loading queue…</td></tr>:visibleRows.length===0?<tr><td colSpan={7} className="p-10 text-center font-semibold text-[#0b5ea2]">{error&&!summary?'Unable to load print requests. Use Refresh to try again.':error?'Unable to load print requests. Use Refresh to try again.':'No print requests match these filters.'}</td></tr>:visibleRows.map(r=><tr key={r.request_id} className="border-b border-[#0b5ea2]/10"><td className="px-4 py-4"><b className="text-[#0b5ea2]">#{r.request_id} · {r.full_name}</b><p className="text-xs text-[#0b5ea2]/65">{r.school_id} · {r.user_role}</p></td><td className="max-w-[220px] px-4 py-4"><p className="truncate font-semibold text-[#0b5ea2]">{r.file_name}{r.documents_expired_at?<span className="ml-2 text-xs font-normal">Document expired · history retained</span>:null}</p><PrintingInvoice request={r} admin /><p className="text-xs text-[#0b5ea2]/65">{new Date(r.created_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</p></td><td className="px-4 py-4 text-[#0b5ea2]">{r.page_count} pages × {r.number_of_copies}{r.number_of_copies >= 60 ? <p className="text-xs font-bold">Large job · check paper stock</p> : null}<p className="text-xs text-[#0b5ea2]/65">{r.service_kind??'Print'} · {r.output_mode??r.print_type} · {r.paper_size}</p>{r.output_mode==='Automatic'&&r.pricing_snapshot&&<p className="mt-1 break-words text-xs">Color pages: {r.pricing_snapshot.coloredPages.join(', ')||'None'}. Remaining pages monochrome.</p>}</td><td className="px-4 py-4"><b className="text-[#0b5ea2]">₱{Number(r.calculated_cost).toFixed(2)}</b><div className="mt-1"><StatusBadge status={r.payment_status}/></div>{['Unpaid','Partially Paid'].includes(r.payment_status)&&<p className="mt-2 text-xs">Due ₱{Number(r.balance??r.calculated_cost).toFixed(2)}</p>}{r.pay_later_accepted&&<p className="mt-1 text-xs font-semibold">Pay later approved</p>}</td><td className="px-4 py-4">{r.print_receipt_id?<><p className="font-bold text-[#0b5ea2]">{r.receipt_number}</p><p className="text-xs text-[#0b5ea2]/60">{r.verification_code}</p></>:<span className="text-xs text-[#0b5ea2]/50">{r.localPaymentId?<a className="underline" href="/librarian/payments">View online payment</a>:'Not issued'}</span>}</td><td className="px-4 py-4"><StatusBadge status={r.job_status}/>{r.pricing_review_state&&r.pricing_review_state!=='Ready'&&r.job_status!=='Cancelled'&&<p className="mt-2 text-xs font-semibold">{r.pricing_review_state==='Pending'?'Page review needed':'Waiting for requester price confirmation'}</p>}</td><td className="px-4 py-4"><RowActions label={`Actions for print request ${r.request_id}`}>

{r.pricing_review_state==='Pending'&&r.job_status==='Pending'&&<Button onClick={()=>setReviewRow(r)}>Review pages and price</Button>}

{!r.documents_expired_at&&r.service_kind!=='Photocopy'&&<><Button variant="secondary" onClick={()=>setPreview(`/api/v1/admin/printing/requests/${r.request_id}/preview`)}>Preview document</Button><Button variant="secondary" disabled={busy!==''} onClick={()=>void action(`download-${r.request_id}`,()=>printingApi.downloadDocument(r))}><Download size={14}/>{busy===`download-${r.request_id}`?'Downloading…':'Download file'}</Button></>}{(!r.pricing_review_state||r.pricing_review_state==='Ready')&&['Unpaid','Partially Paid'].includes(r.payment_status)&&r.job_status!=='Cancelled'&&!r.refund_pending&&<Button variant="secondary" disabled={busy!==''} onClick={()=>setCounterRow(r)}>Receive cash / pay later</Button>}{(r.proof_payment_id||r.localPaymentId)&&<Button variant="secondary" onClick={()=>setProofId(r.proof_payment_id??r.localPaymentId!)}>View proof</Button>}{r.print_receipt_id&&<Button variant="secondary" disabled={busy!==''} onClick={()=>void viewReceipt(Number(r.print_receipt_id))}><Eye size={14}/>{busy===`receipt-${r.print_receipt_id}`?'Loading…':'View payment'}</Button>}{(!r.pricing_review_state||r.pricing_review_state==='Ready')&&r.job_status==='Pending'&&!r.refund_pending&&<>{r.payment_status==='Paid'||r.pay_later_accepted?<Button disabled={busy!==''} onClick={()=>void action(`start-${r.request_id}`,()=>printingApi.status(r.request_id,'Printing'))}>Start printing</Button>:null}{r.payment_status==='Unpaid'?<Button variant="secondary" disabled={busy!==''} onClick={()=>void action(`cancel-${r.request_id}`,()=>printingApi.status(r.request_id,'Cancelled','Cancelled by printing staff'))}>Cancel</Button>:null}</>}{r.job_status==='Printing'&&<Button onClick={()=>void action(`ready-${r.request_id}`,()=>printingApi.status(r.request_id,'Ready for Pickup'))}>Mark ready</Button>}{r.job_status==='Ready for Pickup'&&<Button onClick={()=>void action(`done-${r.request_id}`,()=>printingApi.status(r.request_id,'Completed'))}>Confirm pickup</Button>}</RowActions></td></tr>)}</tbody></table></ResponsiveTable></SectionCard>

    <div className="my-4 flex flex-wrap items-center justify-between gap-3 text-sm"><p>{loading?'Loading print requests…':`${pagination.total} matching requests · Page ${pagination.page} of ${Math.max(1,pagination.total_pages)}`}</p><div className="flex gap-2"><Button variant="secondary" disabled={loading||pagination.page<=1} onClick={()=>{setLoading(true);setFilters(v=>({...v,page:(v.page??1)-1}))}}>Previous</Button><Button variant="secondary" disabled={loading||pagination.page>=pagination.total_pages} onClick={()=>{setLoading(true);setFilters(v=>({...v,page:(v.page??1)+1}))}}>Next</Button></div></div>
    </>:null}
    {counterRow&&<PrintCounterPaymentDialog row={counterRow} onClose={()=>setCounterRow(null)} onSaved={load}/>}

    {proofId&&<PrintingDialog title="Payment proof" onClose={()=>setProofId(null)}><PaymentProofPanel paymentId={proofId} admin onUpdated={load}/></PrintingDialog>}

    <DocumentPreview url={preview} onClose={()=>setPreview(null)}/>

    {reviewRow&&<PrintPriceReview row={reviewRow} onClose={()=>setReviewRow(null)} onSaved={load}/>}

    <PrintingReceiptModal receipt={selectedReceipt} onClose={()=>setSelectedReceipt(null)} onDownload={()=>selectedReceipt&&void downloadReceipt(selectedReceipt)} downloading={downloadingReceipt}/>

  </>

}
