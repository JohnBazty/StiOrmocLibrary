import {Link} from 'react-router-dom'
import {getCurrentIdentity} from '../auth/auth-storage'
import { PrintingInvoice } from './PrintingInvoice'
import { PaymentAction } from '../payments/PaymentAction'
import {paymentsApi} from '../payments/payments-api'
import {paymentResultPath} from '../payments/payment-navigation'
import { CheckCircle2, FileText, RefreshCw, Upload } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { SelectedFilePreview } from '../../components/SelectedFilePreview'
import { Button, PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { printingApi, type PrintQuote, type PrintRequest, type ServiceStatus } from './printing-api'

const field='mt-1.5 h-14 w-full rounded-xl border border-[#0b5ea2]/20 bg-[#FFFFFF] px-4 text-sm font-normal text-[#0b5ea2] outline-none focus:border-[#0b5ea2]'
function validQuantity(value:string,max:number){const count=Number(value);return Number.isInteger(count)&&count>=1&&count<=max?count:0}

export function StudentPrintingPage(){
  const [service,setService]=useState<ServiceStatus|null>(null)
  const [requests,setRequests]=useState<PrintRequest[]>([])
  const [paymentVersion,setPaymentVersion]=useState(0)
  const refreshFlight=useRef<Promise<void>|null>(null)
  const prefix=getCurrentIdentity()?.role==='Faculty'?'/faculty':'/student'
  const [file,setFile]=useState<File|null>(null)
  const fileInput=useRef<HTMLInputElement>(null)
  const clearFile=()=>{setFile(null);setQuoteState(null);if(fileInput.current)fileInput.current.value=''}
  const [copies,setCopies]=useState('1')
  const [type,setType]=useState<'Monochrome'|'Colored'>('Monochrome')
  const [paper,setPaper]=useState<'Short'|'A4'|'Long'>('A4')
  const [notes,setNotes]=useState('')
  const [loading,setLoading]=useState(true),[submitting,setSubmitting]=useState(false)
  const [error,setError]=useState(''),[success,setSuccess]=useState('')
  const [quoteState,setQuoteState]=useState<{file:File;copies:string;type:string;paper:string;quote:PrintQuote}|null>(null),[quoteError,setQuoteError]=useState(''),[quoting,setQuoting]=useState(false)
  const [quoteAttempt,setQuoteAttempt]=useState(0)
  const accepting=Boolean(service&&Number(service.accepting_requests))
  const quote=quoteState?.file===file&&quoteState.copies===copies&&quoteState.type===type&&quoteState.paper===paper?quoteState.quote:null
  const pageCount=quoteState?.file===file?quoteState.quote.page_count:null

  const load=()=>{
    if(refreshFlight.current)return refreshFlight.current
    refreshFlight.current=(async()=>{
      setError('')
      const results=await Promise.allSettled([
        printingApi.serviceStatus().then(setService),
        paymentsApi.sync().catch(()=>undefined).then(()=>printingApi.mine()).then(rows=>{setRequests(rows);setPaymentVersion(value=>value+1)}),
      ])
      const messages=results.flatMap(result=>result.status==='rejected'?[result.reason instanceof Error?result.reason.message:'Unable to load printing service.']:[])
      setError([...new Set(messages)].join(' '));setLoading(false)
    })().finally(()=>{refreshFlight.current=null})
    return refreshFlight.current
  }
  useEffect(()=>{void load();const refresh=()=>{if(!document.hidden)void load()};window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh)},[])
  useEffect(()=>{
    setQuoteError('');setQuoting(false)
    if(!file){setQuoteState(null);return}
    if(file.size>4*1024*1024){setQuoteError('The document must not exceed 4 MB.');return}
    const copyCount=validQuantity(copies,100)||1
    let active=true
    const timer=setTimeout(()=>{setQuoting(true);const form=new FormData();form.set('document',file);form.set('number_of_copies',String(copyCount));form.set('print_type',type);form.set('paper_size',paper);void printingApi.quote(form).then(result=>{if(active)setQuoteState({file,copies:validQuantity(copies,100)?copies:'1',type,paper,quote:result})}).catch(e=>{if(active){setQuoteState(null);setQuoteError(e instanceof Error?e.message:'Unable to read the document.')}}).finally(()=>{if(active)setQuoting(false)})},250)
    return()=>{active=false;clearTimeout(timer)}
  },[file,copies,type,paper,quoteAttempt])
  const submit=async(event:FormEvent)=>{event.preventDefault();if(!file){setError('Select a PDF or DOCX document.');return}const copyCount=validQuantity(copies,100);if(!copyCount){setError('Enter a whole number from 1 to 100 copies.');return}if(!quote||quoting){setError('Wait for the page count and price before submitting.');return}setSubmitting(true);setError('');setSuccess('');try{const form=new FormData();form.set('document',file);form.set('number_of_copies',String(copyCount));form.set('page_count',String(quote.page_count));form.set('document_sha256',quote.document_sha256);form.set('quoted_cost',String(quote.calculated_cost));form.set('print_type',type);form.set('paper_size',paper);form.set('optional_notes',notes);await printingApi.submit(form);clearFile();setNotes('');setSuccess('Request submitted. Review payment options below before printing starts.');await load()}catch(e){setError(e instanceof Error?e.message:'Unable to submit print request.')}finally{setSubmitting(false)}}
  const cancel=async(id:number)=>{setError('');try{await printingApi.cancel(id);await load()}catch(e){setError(e instanceof Error?e.message:'Unable to cancel request.')}}

  return <>
    <PageHeader eyebrow="Online service" title="Printing service" action={<Button variant="secondary" onClick={()=>{void load();setQuoteAttempt(value=>value+1)}}><RefreshCw size={15}/>Refresh</Button>}/>
    {error&&<div className="mb-4 rounded-xl bg-[#FFF200] p-3 text-sm font-bold text-[#0b5ea2]">{error}</div>}
    {success&&<div className="mb-4 flex gap-2 rounded-xl border border-[#0b5ea2] p-3 text-sm font-bold text-[#0b5ea2]"><CheckCircle2 size={17}/>{success}</div>}
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <SectionCard className="p-5">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-bold text-[#0b5ea2]">New print request</h2><span className={`rounded-full px-3 py-1 text-xs font-bold ${accepting?'bg-[#0b5ea2] text-[#FFFFFF]':'bg-[#FFF200] text-[#0b5ea2]'}`}>{service?(accepting?'Accepting requests':'Printing unavailable'):(loading?'Checking availability…':'Availability unavailable')}</span></div>
        {!accepting&&service?.unavailable_reason&&<p className="mb-4 rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#0b5ea2]">{service.unavailable_reason}</p>}
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-xs font-bold text-[#0b5ea2]">Document<input ref={fileInput} disabled={submitting} aria-label="Print document" type="file" accept={service?.docx_auto_count_available?'.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document':'.pdf,application/pdf'} onChange={e=>setFile(e.target.files?.[0]??null)} className="mt-1.5 block w-full rounded-xl border border-dashed border-[#0b5ea2]/25 p-4 text-sm font-normal"/><span className="mt-1 block font-normal text-[#0b5ea2]/65">{service?.docx_auto_count_available?'PDF or DOCX':'PDF only while automatic DOCX counting is unavailable'}, maximum 4 MB</span></label>
          <SelectedFilePreview file={file} onRemove={clearFile} disabled={submitting} display="icon" />
          <div className="grid gap-3 sm:grid-cols-2"><div className="text-xs font-bold text-[#0b5ea2]">Pages in document<div aria-label="Pages in document" aria-live="polite" className={`${field} flex items-center`}>{pageCount??(quoting?'Reading…':'—')}</div><span className="mt-1 block font-normal text-[#0b5ea2]/65">Counted automatically from your uploaded file.</span></div><label className="text-xs font-bold text-[#0b5ea2]">Copies<input className={field} type="number" min="1" max="100" value={copies} onChange={e=>setCopies(e.target.value)}/>{copies && !validQuantity(copies,100) ? <span role="alert" className="mt-1 block text-xs">Enter a whole number from 1 to 100 copies.</span> : null}{Number(copies) >= 60 && validQuantity(copies,100) ? <span className="mt-1 block text-xs font-normal">Large print job. Library staff will check paper stock before starting.</span> : null}</label><label className="text-xs font-bold text-[#0b5ea2]">Print type<select className={field} value={type} onChange={e=>setType(e.target.value as typeof type)}><option>Monochrome</option><option>Colored</option></select></label><label className="text-xs font-bold text-[#0b5ea2]">Paper size<select className={field} value={paper} onChange={e=>setPaper(e.target.value as typeof paper)}><option>Short</option><option>A4</option><option>Long</option></select></label></div>
          {quoting&&<p role="status" className="text-sm text-[#0b5ea2]">Reading document and calculating price…</p>}
          {quoteError&&<div role="alert" className="rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#0b5ea2]"><p>{quoteError}</p><Button type="button" variant="secondary" className="mt-2" onClick={()=>setQuoteAttempt(value=>value+1)}><RefreshCw size={14}/>Retry page count</Button></div>}
          {quote?.printable_file_name!==file?.name&&quote&&<p className="text-xs text-[#0b5ea2]/70">The DOCX will be converted to {quote.printable_file_name} for printing.</p>}
          <label className="block text-xs font-bold text-[#0b5ea2]">Notes<textarea className="mt-1.5 min-h-20 w-full rounded-xl border border-[#0b5ea2]/20 p-3 text-sm font-normal outline-none" value={notes} onChange={e=>setNotes(e.target.value)} maxLength={1000}/></label>
          <div className="rounded-xl bg-[#0b5ea2]/5 p-4"><p className="text-xs font-bold text-[#0b5ea2]/65">Calculated cost</p><p className="mt-1 text-2xl font-bold text-[#0b5ea2]">{quote?`₱${Number(quote.calculated_cost).toFixed(2)}`:'—'}</p><p className="text-xs text-[#0b5ea2]/65">{quote?`${quote.total_sheets} total printed sheets · `:''}Payment options appear after submitting your request.</p></div>
          <Button className="w-full" type="submit" disabled={submitting||!accepting||!quote||quoting||!validQuantity(copies,100)}><Upload size={16}/>{submitting?'Submitting…':'Submit print request'}</Button>
        </form>
      </SectionCard>
      <SectionCard className="overflow-hidden"><div className="border-b border-[#0b5ea2]/15 p-5"><h2 className="font-bold text-[#0b5ea2]">My print requests</h2></div><div className="divide-y divide-[#0b5ea2]/10">{loading?<p className="p-10 text-center text-[#0b5ea2]">Loading requests…</p>:requests.length===0?<p className="p-10 text-center font-semibold text-[#0b5ea2]">No print requests yet.</p>:requests.map(r=><div key={r.request_id} className="p-5"><PrintingInvoice request={r} /><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><span className="rounded-xl bg-[#0b5ea2]/5 p-3 text-[#0b5ea2]"><FileText size={20}/></span><div className="min-w-0 flex-1"><p className="truncate font-bold text-[#0b5ea2]">{r.file_name}</p><p className="mt-1 text-xs text-[#0b5ea2]/65">{r.page_count} pages · {r.number_of_copies} copies · {r.print_type} · {r.paper_size}</p></div><div className="flex items-center gap-2"><StatusBadge status={r.payment_status}/><StatusBadge status={r.job_status}/></div></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="font-bold text-[#0b5ea2]">₱{Number(r.calculated_cost).toFixed(2)}</p><div className="flex gap-2">{r.localPaymentId&&<Link className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold" to={paymentResultPath({paymentId:r.localPaymentId})}>View payment</Link>}{r.print_receipt_id&&<Link className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold" to={prefix+'/transactions?search='+encodeURIComponent(r.receipt_number??'')}>View transaction</Link>}{r.job_status==='Pending'&&r.payment_status==='Unpaid'&&<Button variant="secondary" onClick={()=>void cancel(r.request_id)}>Cancel</Button>}</div></div>{r.payment_status==='Unpaid'&&r.job_status==='Pending'?<PaymentAction kind="Printing" targetId={r.request_id} title={r.file_name} refreshKey={paymentVersion} onUpdated={()=>void load()}/>:null}</div>)}</div></SectionCard>
    </div>
    <p className="mt-5 text-sm opacity-75">Your online and onsite payment records are in <Link className="font-semibold underline" to={prefix+'/transactions'}>Transactions</Link>.</p>
  </>
}
