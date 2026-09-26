import { CheckCircle2, Download, Eye, FileText, ReceiptText, RefreshCw, Upload } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Button, PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { printingApi, type PrintQuote, type PrintRequest, type PrintingReceipt, type ServiceStatus } from './printing-api'
import { PrintingReceiptModal } from './PrintingReceiptModal'

const field='mt-1.5 h-14 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-4 text-sm font-normal text-[#003399] outline-none focus:border-[#003399]'
function validQuantity(value:string,max:number){const count=Number(value);return Number.isInteger(count)&&count>=1&&count<=max?count:0}

export function StudentPrintingPage(){
  const [service,setService]=useState<ServiceStatus|null>(null)
  const [requests,setRequests]=useState<PrintRequest[]>([])
  const [receipts,setReceipts]=useState<PrintingReceipt[]>([]),[selectedReceipt,setSelectedReceipt]=useState<PrintingReceipt|null>(null)
  const [file,setFile]=useState<File|null>(null)
  const [copies,setCopies]=useState('1')
  const [type,setType]=useState<'Monochrome'|'Colored'>('Monochrome')
  const [paper,setPaper]=useState<'Short'|'A4'|'Long'>('A4')
  const [notes,setNotes]=useState('')
  const [loading,setLoading]=useState(true),[submitting,setSubmitting]=useState(false),[downloading,setDownloading]=useState(false)
  const [error,setError]=useState(''),[success,setSuccess]=useState('')
  const [quoteState,setQuoteState]=useState<{file:File;copies:string;type:string;paper:string;quote:PrintQuote}|null>(null),[quoteError,setQuoteError]=useState(''),[quoting,setQuoting]=useState(false)
  const accepting=Boolean(service&&Number(service.accepting_requests))
  const quote=quoteState?.file===file&&quoteState.copies===copies&&quoteState.type===type&&quoteState.paper===paper?quoteState.quote:null

  const load=async()=>{setLoading(true);setError('');try{const[s,r,receipts]=await Promise.all([printingApi.serviceStatus(),printingApi.mine(),printingApi.receipts()]);setService(s);setRequests(r);setReceipts(receipts)}catch(e){setError(e instanceof Error?e.message:'Unable to load printing service.')}finally{setLoading(false)}}
  useEffect(()=>{void load()},[])
  useEffect(()=>{
    setQuoteState(null);setQuoteError('');setQuoting(false)
    if(!file||!accepting)return
    if(file.size>4*1024*1024){setQuoteError('The document must not exceed 4 MB.');return}
    const copyCount=validQuantity(copies,50)
    if(!copyCount)return
    let active=true
    const timer=setTimeout(()=>{setQuoting(true);const form=new FormData();form.set('document',file);form.set('number_of_copies',String(copyCount));form.set('print_type',type);form.set('paper_size',paper);void printingApi.quote(form).then(result=>{if(active)setQuoteState({file,copies,type,paper,quote:result})}).catch(e=>{if(active)setQuoteError(e instanceof Error?e.message:'Unable to read the document.')}).finally(()=>{if(active)setQuoting(false)})},250)
    return()=>{active=false;clearTimeout(timer)}
  },[file,copies,type,paper,accepting])
  const submit=async(event:FormEvent)=>{event.preventDefault();if(!file){setError('Select a PDF or DOCX document.');return}if(!quote||quoting){setError('Wait for the page count and price before submitting.');return}const copyCount=validQuantity(copies,50);if(!copyCount){setError('Enter 1–50 copies.');return}setSubmitting(true);setError('');setSuccess('');try{const form=new FormData();form.set('document',file);form.set('number_of_copies',String(copyCount));form.set('page_count',String(quote.page_count));form.set('document_sha256',quote.document_sha256);form.set('quoted_cost',String(quote.calculated_cost));form.set('print_type',type);form.set('paper_size',paper);form.set('optional_notes',notes);await printingApi.submit(form);setFile(null);setQuoteState(null);setNotes('');setSuccess('Request submitted. Pay cash at the library counter before printing starts.');await load()}catch(e){setError(e instanceof Error?e.message:'Unable to submit print request.')}finally{setSubmitting(false)}}
  const cancel=async(id:number)=>{setError('');try{await printingApi.cancel(id);await load()}catch(e){setError(e instanceof Error?e.message:'Unable to cancel request.')}}
  const downloadReceipt=async(receipt:PrintingReceipt)=>{setDownloading(true);setError('');try{await printingApi.downloadReceipt(receipt)}catch(e){setError(e instanceof Error?e.message:'Unable to download the printing receipt.')}finally{setDownloading(false)}}

  return <>
    <PageHeader eyebrow="Online service" title="Printing service" action={<Button variant="secondary" onClick={()=>void load()}><RefreshCw size={15}/>Refresh</Button>}/>
    {error&&<div className="mb-4 rounded-xl bg-[#FFF200] p-3 text-sm font-bold text-[#003399]">{error}</div>}
    {success&&<div className="mb-4 flex gap-2 rounded-xl border border-[#003399] p-3 text-sm font-bold text-[#003399]"><CheckCircle2 size={17}/>{success}</div>}
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <SectionCard className="p-5">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-bold text-[#003399]">New print request</h2><span className={`rounded-full px-3 py-1 text-xs font-bold ${accepting?'bg-[#003399] text-[#FFFFFF]':'bg-[#FFF200] text-[#003399]'}`}>{accepting?'Accepting requests':'Printing unavailable'}</span></div>
        {!accepting&&service?.unavailable_reason&&<p className="mb-4 rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#003399]">{service.unavailable_reason}</p>}
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-xs font-bold text-[#003399]">Document<input aria-label="Print document" type="file" accept={service?.docx_auto_count_available?'.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document':'.pdf,application/pdf'} onChange={e=>setFile(e.target.files?.[0]??null)} className="mt-1.5 block w-full rounded-xl border border-dashed border-[#003399]/25 p-4 text-sm font-normal"/><span className="mt-1 block font-normal text-[#003399]/65">{service?.docx_auto_count_available?'PDF or DOCX':'PDF only while automatic DOCX counting is unavailable'}, maximum 4 MB</span></label>
          <div className="grid grid-cols-2 gap-3"><div className="text-xs font-bold text-[#003399]">Pages in document<div aria-label="Pages in document" className={`${field} flex items-center`}>{quote?.page_count??'—'}</div></div><label className="text-xs font-bold text-[#003399]">Copies<input className={field} type="number" min="1" max="50" value={copies} onChange={e=>setCopies(e.target.value)} onBlur={()=>{if(copies==='')setCopies('1')}}/></label><label className="text-xs font-bold text-[#003399]">Print type<select className={field} value={type} onChange={e=>setType(e.target.value as typeof type)}><option>Monochrome</option><option>Colored</option></select></label><label className="text-xs font-bold text-[#003399]">Paper size<select className={field} value={paper} onChange={e=>setPaper(e.target.value as typeof paper)}><option>Short</option><option>A4</option><option>Long</option></select></label></div>
          {quoting&&<p role="status" className="text-sm text-[#003399]">Reading document and calculating price…</p>}
          {quoteError&&<p role="alert" className="rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#003399]">{quoteError}</p>}
          {quote?.printable_file_name!==file?.name&&quote&&<p className="text-xs text-[#003399]/70">The DOCX will be converted to {quote.printable_file_name} for printing.</p>}
          <label className="block text-xs font-bold text-[#003399]">Notes<textarea className="mt-1.5 min-h-20 w-full rounded-xl border border-[#003399]/20 p-3 text-sm font-normal outline-none" value={notes} onChange={e=>setNotes(e.target.value)} maxLength={1000}/></label>
          <div className="rounded-xl bg-[#003399]/5 p-4"><p className="text-xs font-bold text-[#003399]/65">Calculated cost</p><p className="mt-1 text-2xl font-bold text-[#003399]">{quote?`₱${Number(quote.calculated_cost).toFixed(2)}`:'—'}</p><p className="text-xs text-[#003399]/65">{quote?`${quote.total_sheets} total printed sheets · `:''}Cash payment at the library counter</p></div>
          <Button className="w-full" type="submit" disabled={submitting||!accepting||!quote||quoting}><Upload size={16}/>{submitting?'Submitting…':'Submit print request'}</Button>
        </form>
      </SectionCard>
      <SectionCard className="overflow-hidden"><div className="border-b border-[#003399]/15 p-5"><h2 className="font-bold text-[#003399]">My print requests</h2></div><div className="divide-y divide-[#003399]/10">{loading?<p className="p-10 text-center text-[#003399]">Loading requests…</p>:requests.length===0?<p className="p-10 text-center font-semibold text-[#003399]">No print requests yet.</p>:requests.map(r=><div key={r.request_id} className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><span className="rounded-xl bg-[#003399]/5 p-3 text-[#003399]"><FileText size={20}/></span><div className="min-w-0 flex-1"><p className="truncate font-bold text-[#003399]">{r.file_name}</p><p className="mt-1 text-xs text-[#003399]/65">{r.page_count} pages · {r.number_of_copies} copies · {r.print_type} · {r.paper_size}</p></div><div className="flex items-center gap-2"><StatusBadge status={r.payment_status}/><StatusBadge status={r.job_status}/></div></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="font-bold text-[#003399]">₱{Number(r.calculated_cost).toFixed(2)}</p><div className="flex gap-2">{r.print_receipt_id&&<Button variant="secondary" onClick={()=>{const receipt=receipts.find(item=>item.print_receipt_id===Number(r.print_receipt_id));if(receipt)setSelectedReceipt(receipt)}}><Eye size={14}/>View receipt</Button>}{r.job_status==='Pending'&&r.payment_status==='Unpaid'&&<Button variant="secondary" onClick={()=>void cancel(r.request_id)}>Cancel</Button>}</div></div></div>)}</div></SectionCard>
    </div>
    <SectionCard className="mt-5 overflow-hidden"><div className="flex items-center gap-3 border-b border-[#003399]/15 p-5"><span className="rounded-xl bg-[#FFF200] p-2 text-[#003399]"><ReceiptText size={20}/></span><div><h2 className="font-bold text-[#003399]">Digital receipts</h2><p className="text-xs text-[#003399]/65">Printing payments only. Fine receipts are kept separately in Fines.</p></div></div><div className="divide-y divide-[#003399]/10">{loading?<p className="p-8 text-center text-[#003399]">Loading receipts…</p>:receipts.length===0?<p className="p-8 text-center font-semibold text-[#003399]">No printing receipts yet. A receipt appears here after the library records your cash payment.</p>:receipts.map(receipt=><div key={receipt.print_receipt_id} className="flex flex-col gap-3 p-5 md:flex-row md:items-center"><span className="rounded-xl bg-[#003399]/5 p-3 text-[#003399]"><ReceiptText size={20}/></span><div className="min-w-0 flex-1"><p className="font-bold text-[#003399]">{receipt.receipt_number}</p><p className="truncate text-sm text-[#003399]/70">{receipt.file_name}</p><p className="mt-1 text-xs text-[#003399]/55">Paid {new Date(receipt.received_at).toLocaleString()} · Verification {receipt.verification_code}</p></div><strong className="text-lg text-[#003399]">₱{Number(receipt.amount_received).toFixed(2)}</strong><div className="flex gap-2"><Button variant="secondary" onClick={()=>setSelectedReceipt(receipt)}><Eye size={14}/>View receipt</Button><Button onClick={()=>void downloadReceipt(receipt)} disabled={downloading}><Download size={14}/>Download</Button></div></div>)}</div></SectionCard>
    <PrintingReceiptModal receipt={selectedReceipt} onClose={()=>setSelectedReceipt(null)} onDownload={()=>selectedReceipt&&void downloadReceipt(selectedReceipt)} downloading={downloading}/>
  </>
}
