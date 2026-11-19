import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Eye, Upload } from 'lucide-react'
import { Button, SectionCard } from '../../components/ui'
import { SelectedFilePreview } from '../../components/SelectedFilePreview'
import { printingApi, type OutputMode, type PricingRule, type PrintQuote, type ServiceStatus } from './printing-api'
import { paperSizeLabel } from './paper-size-presets'
import { DocumentPreview } from './DocumentPreview'
import { PrintAnalysisSummary } from './PrintAnalysisSummary'

export const printField='mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-[#0b5ea2] dark:border-white/20 dark:bg-[#001633] dark:text-white'
const quantity=(value:string,max:number)=>Number.isInteger(Number(value))&&Number(value)>0&&Number(value)<=max
type QuoteState={file:File|null;kind:string;paper:string;copies:string;mode:string;originals:string;quote:PrintQuote;requestKey:string}

export function PrintRequestForm({service,pricing,onSubmitted,refreshKey=0}:{refreshKey?:number;service:ServiceStatus|null;pricing:PricingRule[];onSubmitted:()=>Promise<void>}) {
  const [kind,setKind]=useState<'Print'|'Photocopy'>('Print'),[file,setFile]=useState<File|null>(null)
  const [copies,setCopies]=useState('1'),[originals,setOriginals]=useState('1'),[mode,setMode]=useState<OutputMode>('Monochrome')
  const [paper,setPaper]=useState('A4'),[notes,setNotes]=useState(''),[result,setResult]=useState<QuoteState|null>(null)
  const [busy,setBusy]=useState(false),[quoting,setQuoting]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState(''),[attempt,setAttempt]=useState(0),[preview,setPreview]=useState<string|null>(null)
  const input=useRef<HTMLInputElement>(null),analysis=useRef<{file:File;paper:string;id:string}|null>(null)
  const choices=pricing.filter(row=>row.print_type==='Monochrome'&&pricing.some(other=>other.paper_size===row.paper_size&&other.print_type==='Colored'))
  const selected=choices.find(row=>row.paper_size===paper),accepting=Boolean(Number(service?.accepting_requests)),maxMb=service?.max_document_mb??4
  const quote=selected&&quantity(copies,100)&&quantity(originals,500)&&result&&result.file===file&&result.kind===kind&&result.paper===paper&&result.copies===copies&&result.mode===mode&&result.originals===originals?result.quote:null
  const brand=Number(selected?.price_brand_stock_id??0)
  const mono=Number(selected?.price_per_page),color=Number(pricing.find(row=>row.paper_size===paper&&row.print_type==='Colored')?.price_per_page)
  useEffect(()=>{
    let active=true
    setError('');setQuoting(false)
    if(!selected||kind==='Photocopy'&&!quantity(originals,500)||kind==='Print'&&!file)return
    if(file&&kind==='Print'&&file.size>maxMb*1024*1024){setError(`The document must not exceed ${maxMb} MB.`);return}
    const timer=setTimeout(()=>{
      setQuoting(true)
      const form=new FormData();form.set('service_kind',kind);form.set('number_of_copies',quantity(copies,100)?copies:'1');form.set('print_type',mode);form.set('paper_size',paper);form.set('page_count',originals)
      if(kind==='Print'&&file){const saved=analysis.current;if(saved?.file===file&&saved.paper===paper)form.set('analysis_id',saved.id);else form.set('document',file)}
      void printingApi.quote(form).then(value=>{
        if(!active)return
        if(file&&value.analysis_id)analysis.current={file,paper,id:value.analysis_id}
        setResult({file,kind,paper,copies,mode,originals,quote:value,requestKey:crypto.randomUUID()})
      }).catch(e=>{if(active){setResult(null);setError(e.message);if(e.code==='PRINT_REVIEW_REQUIRED')analysis.current=null}}).finally(()=>{if(active)setQuoting(false)})
    },500)
    return()=>{active=false;clearTimeout(timer)}
  },[file,kind,paper,copies,mode,originals,mono,color,brand,accepting,maxMb,attempt,refreshKey])

  async function submit(event:FormEvent) {
    event.preventDefault();if(!quote||!result||quoting||busy)return
    setBusy(true);setError('');setSuccess('')
    const body=new FormData()
    Object.entries({service_kind:kind,number_of_copies:copies,print_type:mode,paper_size:paper,page_count:String(quote.page_count),analysis_id:quote.analysis_id??'',document_sha256:quote.document_sha256??'',settings_version:String(quote.settings_version),request_key:result.requestKey,quoted_cost:String(quote.calculated_cost),paper_brand_stock_id:String(quote.paper_brand_stock_id??0),quoted_mono_rate:String(quote.pricing?.monoRate),quoted_color_rate:String(quote.pricing?.colorRate),optional_notes:notes}).forEach(([key,value])=>body.set(key,value))
    try {
      await printingApi.submit(body)
      setFile(null);analysis.current=null;setResult(null);setNotes('');if(input.current)input.current.value=''
      setSuccess(quote.needs_review?'Request submitted for page review. The final price will appear in your requests.':'Request submitted. Payment options are available in your requests.')
      await onSubmitted()
    }catch(e){setError(e instanceof Error?e.message:'Unable to submit request.');await onSubmitted();if((e as {code?:string}).code==='PRINT_REVIEW_REQUIRED'){analysis.current=null;setAttempt(value=>value+1)}}finally{setBusy(false)}
  }
  return <SectionCard className="h-fit p-4 sm:p-5">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">New request</h2><span className="rounded-full border px-2 py-1 text-xs">{service?(accepting?'Accepting requests':'Closed for new requests'):'Checking availability…'}</span></div>
    {!accepting&&service&&<div role="status" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-950"><p>{service.unavailable_reason||'New requests are temporarily paused.'}</p>{service.next_opening&&<p className="mt-1">Next opening: {new Date(service.next_opening).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</p>}<p className="mt-1">Existing requests and payments remain available.</p></div>}
    {success&&<p role="status" data-tone="success" className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p>}
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={busy} className="space-y-4 disabled:opacity-70">
        <legend className="sr-only">Request details</legend>
        <div className="grid grid-cols-2 gap-2" aria-label="Service"><Button type="button" variant={kind==='Print'?'primary':'secondary'} aria-pressed={kind==='Print'} onClick={()=>setKind('Print')}>Print</Button><Button type="button" variant={kind==='Photocopy'?'primary':'secondary'} aria-pressed={kind==='Photocopy'} onClick={()=>setKind('Photocopy')}>Photocopy</Button></div>
        {kind==='Print'?<><label className="block text-sm font-semibold">Document<input ref={input} type="file" aria-label="Print document" accept=".pdf,.docx" onChange={event=>{setFile(event.target.files?.[0]??null);analysis.current=null;setResult(null)}} className="mt-2 block w-full rounded-xl border border-dashed border-slate-300 p-3 text-sm"/><span className="mt-1 block text-xs font-normal opacity-75">PDF or DOCX, maximum {maxMb} MB</span></label><SelectedFilePreview file={file} display="icon" onRemove={()=>{setFile(null);analysis.current=null;setResult(null);if(input.current)input.current.value=''}} disabled={busy}/></>:<><p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Bring the physical originals to the library. Staff verifies the pages before you confirm the final price.</p><label className="block text-sm font-semibold">Original pages<input className={printField} type="number" min={1} max={500} value={originals} onChange={e=>setOriginals(e.target.value)}/></label></>}
        <div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold">Copies<input className={printField} type="number" min={1} max={100} value={copies} onChange={e=>setCopies(e.target.value)}/></label><div className="text-sm font-semibold">{kind==='Print'?'Pages in document':'Original pages'}<p aria-label="Pages in document" aria-live="polite" className={`${printField} flex items-center`}>{(result?.file===file&&result?.paper===paper?result?.quote.page_count:null)??(quoting?'Reading…':'—')}</p></div></div>
        <label className="block text-sm font-semibold">Output<select className={printField} value={mode} onChange={e=>setMode(e.target.value as OutputMode)}><option value="Monochrome">Monochrome</option><option value="Colored">Colored</option><option value="Automatic">Automatic · color only where needed</option></select></label>
        <label className="block text-sm font-semibold">Paper size<select aria-label="Paper size" className={printField} value={paper} onChange={e=>setPaper(e.target.value)}>{!selected&&<option value={paper}>{paper} · Unavailable</option>}{choices.map(row=><option key={row.paper_size} value={row.paper_size}>{paperSizeLabel(row.paper_size,row)} · ₱{Number(row.price_per_page).toFixed(2)}/page</option>)}</select></label>
        {selected&&<div aria-label="Paper printing prices" className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><p className="font-semibold">{selected.paper_brand?`Loaded paper: ${selected.paper_brand}`:'Current paper rate'}</p><p className="mt-1 flex flex-wrap gap-x-3 tabular-nums"><span>Monochrome: <strong>₱{mono.toFixed(2)}/page</strong></span><span>Colored: <strong>₱{color.toFixed(2)}/page</strong></span></p></div>}
        {quoting&&<p role="status" className="text-sm">Reading pages and calculating price…</p>}
        {error&&<div role="alert" className="rounded-xl bg-red-700 p-3 text-sm text-white"><p>{error}</p><button type="button" className="mt-2 min-h-11 underline" onClick={()=>setAttempt(value=>value+1)}>Retry quote</button></div>}
        {quote&&<>{!quote.pricing&&<p className="text-lg font-bold tabular-nums">₱{Number(quote.calculated_cost).toFixed(2)}</p>}<PrintAnalysisSummary bill={quote.pricing} pages={quote.pages} review={quote.needs_review}/>{quote.preview_url&&<Button type="button" variant="secondary" className="w-full" onClick={()=>setPreview(quote.preview_url!)}><Eye size={16}/>Preview document</Button>}<p className="text-xs opacity-75">{quote.total_sheets} sheets · {quote.printable_file_name}{kind==='Print'&&file?.name!==quote.printable_file_name?' · Converted for printing':''}</p></>}
        <label className="block text-sm font-semibold">Notes <span className="font-normal">(optional)</span><textarea className={printField} maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
      </fieldset>
      <Button type="submit" className="w-full" disabled={busy||quoting||!quote||!accepting}><Upload size={16}/>{busy?'Submitting…':quote?.needs_review?'Submit for page review':'Submit print request'}</Button>
    </form>
    <DocumentPreview url={preview} onClose={()=>setPreview(null)}/>
  </SectionCard>
}
