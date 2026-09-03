import { CheckCircle2, FileText, RefreshCw, Upload } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button, PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { printingApi, type PricingRule, type PrintRequest, type ServiceStatus } from './printing-api'

const field='mt-1.5 h-14 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-4 text-sm font-normal text-[#003399] outline-none focus:border-[#003399]'

export function StudentPrintingPage(){
  const [service,setService]=useState<ServiceStatus|null>(null)
  const [pricing,setPricing]=useState<PricingRule[]>([])
  const [requests,setRequests]=useState<PrintRequest[]>([])
  const [file,setFile]=useState<File|null>(null)
  const [copies,setCopies]=useState(1),[pages,setPages]=useState(1)
  const [type,setType]=useState<'Monochrome'|'Colored'>('Monochrome')
  const [paper,setPaper]=useState<'Short'|'A4'|'Long'>('A4')
  const [notes,setNotes]=useState('')
  const [loading,setLoading]=useState(true),[submitting,setSubmitting]=useState(false)
  const [error,setError]=useState(''),[success,setSuccess]=useState('')
  const accepting=Boolean(service&&Number(service.accepting_requests))
  const cost=useMemo(()=>Number(pricing.find(r=>r.print_type===type&&r.paper_size===paper)?.price_per_page??0)*copies*pages,[pricing,type,paper,copies,pages])

  const load=async()=>{setLoading(true);setError('');try{const[s,p,r]=await Promise.all([printingApi.serviceStatus(),printingApi.pricing(),printingApi.mine()]);setService(s);setPricing(p);setRequests(r)}catch(e){setError(e instanceof Error?e.message:'Unable to load printing service.')}finally{setLoading(false)}}
  useEffect(()=>{void load()},[])
  const submit=async(event:FormEvent)=>{event.preventDefault();if(!file){setError('Select a PDF or DOCX document.');return}setSubmitting(true);setError('');setSuccess('');try{const form=new FormData();form.set('document',file);form.set('number_of_copies',String(copies));form.set('page_count',String(pages));form.set('print_type',type);form.set('paper_size',paper);form.set('optional_notes',notes);await printingApi.submit(form);setFile(null);setNotes('');setSuccess('Request submitted. Pay cash at the library counter before printing starts.');await load()}catch(e){setError(e instanceof Error?e.message:'Unable to submit print request.')}finally{setSubmitting(false)}}
  const cancel=async(id:number)=>{setError('');try{await printingApi.cancel(id);await load()}catch(e){setError(e instanceof Error?e.message:'Unable to cancel request.')}}

  return <>
    <PageHeader eyebrow="Online service" title="Printing service" action={<Button variant="secondary" onClick={()=>void load()}><RefreshCw size={15}/>Refresh</Button>}/>
    {error&&<div className="mb-4 rounded-xl bg-[#FFF200] p-3 text-sm font-bold text-[#003399]">{error}</div>}
    {success&&<div className="mb-4 flex gap-2 rounded-xl border border-[#003399] p-3 text-sm font-bold text-[#003399]"><CheckCircle2 size={17}/>{success}</div>}
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <SectionCard className="p-5">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-bold text-[#003399]">New print request</h2><span className={`rounded-full px-3 py-1 text-xs font-bold ${accepting?'bg-[#003399] text-[#FFFFFF]':'bg-[#FFF200] text-[#003399]'}`}>{accepting?'Accepting requests':'Printing unavailable'}</span></div>
        {!accepting&&service?.unavailable_reason&&<p className="mb-4 rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#003399]">{service.unavailable_reason}</p>}
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-xs font-bold text-[#003399]">Document<input aria-label="Print document" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e=>setFile(e.target.files?.[0]??null)} className="mt-1.5 block w-full rounded-xl border border-dashed border-[#003399]/25 p-4 text-sm font-normal"/><span className="mt-1 block font-normal text-[#003399]/65">PDF or DOCX, maximum 10 MB</span></label>
          <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold text-[#003399]">Pages<input className={field} type="number" min="1" max="500" value={pages} onChange={e=>setPages(Math.max(1,Number(e.target.value)))}/></label><label className="text-xs font-bold text-[#003399]">Copies<input className={field} type="number" min="1" max="50" value={copies} onChange={e=>setCopies(Math.max(1,Number(e.target.value)))}/></label><label className="text-xs font-bold text-[#003399]">Print type<select className={field} value={type} onChange={e=>setType(e.target.value as typeof type)}><option>Monochrome</option><option>Colored</option></select></label><label className="text-xs font-bold text-[#003399]">Paper size<select className={field} value={paper} onChange={e=>setPaper(e.target.value as typeof paper)}><option>Short</option><option>A4</option><option>Long</option></select></label></div>
          <label className="block text-xs font-bold text-[#003399]">Notes<textarea className="mt-1.5 min-h-20 w-full rounded-xl border border-[#003399]/20 p-3 text-sm font-normal outline-none" value={notes} onChange={e=>setNotes(e.target.value)} maxLength={1000}/></label>
          <div className="rounded-xl bg-[#003399]/5 p-4"><p className="text-xs font-bold text-[#003399]/65">Calculated cost</p><p className="mt-1 text-2xl font-bold text-[#003399]">₱{cost.toFixed(2)}</p><p className="text-xs text-[#003399]/65">Cash payment at the library counter</p></div>
          <Button className="w-full" type="submit" disabled={submitting||!accepting}><Upload size={16}/>{submitting?'Submitting…':'Submit print request'}</Button>
        </form>
      </SectionCard>
      <SectionCard className="overflow-hidden"><div className="border-b border-[#003399]/15 p-5"><h2 className="font-bold text-[#003399]">My print requests</h2></div><div className="divide-y divide-[#003399]/10">{loading?<p className="p-10 text-center text-[#003399]">Loading requests…</p>:requests.length===0?<p className="p-10 text-center font-semibold text-[#003399]">No print requests yet.</p>:requests.map(r=><div key={r.request_id} className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><span className="rounded-xl bg-[#003399]/5 p-3 text-[#003399]"><FileText size={20}/></span><div className="min-w-0 flex-1"><p className="truncate font-bold text-[#003399]">{r.file_name}</p><p className="mt-1 text-xs text-[#003399]/65">{r.page_count} pages · {r.number_of_copies} copies · {r.print_type} · {r.paper_size}</p></div><div className="flex items-center gap-2"><StatusBadge status={r.payment_status}/><StatusBadge status={r.job_status}/></div></div><div className="mt-3 flex items-center justify-between"><p className="font-bold text-[#003399]">₱{Number(r.calculated_cost).toFixed(2)}</p>{r.job_status==='Pending'&&<Button variant="secondary" onClick={()=>void cancel(r.request_id)}>Cancel</Button>}</div></div>)}</div></SectionCard>
    </div>
  </>
}
