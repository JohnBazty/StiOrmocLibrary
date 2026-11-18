import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, SectionCard } from '../../components/ui'
import { getAccessToken } from '../auth/auth-storage'
import { Download, RefreshCw } from 'lucide-react'
import { useLiveQuery } from '../../hooks/useLiveQuery'

type ReportDefinition={key:string;title:string;snapshot:boolean;searchHint:string;dateBasis:string;statuses:string[];columns:string[];columnLabels:Record<string,string>}
type Filters={kind:string;period:string;from:string;to:string;termId:string;q:string;status:string;page:string}
type ReportData={title:string;label:string;timezone:string;generatedAt:string;columns:string[];columnLabels?:Record<string,string>;rows:Record<string,unknown>[];total:number;note:string;
  metrics:Record<string,unknown>;terms:Array<{id:number;academic_year:string;term_name:string;starts_on?:string;ends_on?:string}>}
const field='min-h-11 w-full rounded-xl border border-[#0b5ea2]/20 bg-white px-3 text-sm text-[#0b5ea2] focus:outline-2 focus:outline-[#0b5ea2] dark:border-white/25 dark:bg-white/10 dark:text-white'
const display=(v:unknown)=>v==null?'—':typeof v==='number'?v.toLocaleString('en-PH',{maximumFractionDigits:2}):String(v)
function headers(){const token=getAccessToken();return token?{Authorization:`Bearer ${token}`}:undefined}
async function loadReportDefinitions(signal:AbortSignal):Promise<ReportDefinition[]>{
  const response=await fetch('/api/v1/admin/reports/options',{headers:headers(),credentials:'include',signal})
  const payload=await response.json().catch(()=>null)
  if(!response.ok||!payload?.success||!Array.isArray(payload.data))throw new Error(payload?.message??'Report choices could not be loaded. Refresh to try again.')
  return payload.data
}
export async function loadLiveReport(filters:Filters,signal?:AbortSignal):Promise<ReportData>{
  const response=await fetch(`/api/v1/admin/reports?${new URLSearchParams(filters)}`,{headers:headers(),credentials:'include',signal})
  const body=await response.json().catch(()=>null)
  if(!response.ok||!body?.success)throw new Error(body?.message??'The report is unavailable.')
  return body.data
}
export function OperationalReports(){
  const definitions=useLiveQuery('report-definitions',loadReportDefinitions,{poll:false})
  const[params,setParams]=useSearchParams(), today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
  const initial:Filters={kind:params.get('kind')??'circulation',period:params.get('period')??'all',from:params.get('from')??today,to:params.get('to')??today,termId:params.get('termId')??'',q:params.get('q')??'',status:params.get('status')??'',page:params.get('page')??'1'}
  const[draft,setDraft]=useState(initial),[active,setActive]=useState(initial),[data,setData]=useState<ReportData|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[exporting,setExporting]=useState(false),[revision,setRevision]=useState(0),sequence=useRef(0)
  const [terms,setTerms]=useState<ReportData['terms']>([]),current=JSON.stringify(active)
  useEffect(()=>{const n=++sequence.current,controller=new AbortController();setLoading(true);setError('');setData(null);void loadLiveReport(active,controller.signal).then(d=>{if(n===sequence.current){setData(d);setTerms(d.terms)}}).catch(e=>{if(n===sequence.current)setError(e instanceof Error?e.message:'Report unavailable.')}).finally(()=>{if(n===sequence.current)setLoading(false)});return()=>{sequence.current++;controller.abort()}},[current,revision])
  function apply(e:FormEvent){e.preventDefault();const next={...draft,period:definition?.snapshot?'all':draft.period,page:'1',q:draft.q.trim(),status:draft.status.trim()};setDraft(next);setActive(next);setParams(next,{replace:true});setRevision(r=>r+1)}
  function page(value:number){const next={...active,page:String(value)};setActive(next);setParams(next,{replace:true})}
  async function download(format:'csv'|'pdf'){
    if(dirty||loading||!data||exporting)return
    setExporting(true);setError('')
    try{const response=await fetch(`/api/v1/admin/reports/export?${new URLSearchParams({...active,format})}`,{headers:headers(),credentials:'include'}),expected=format==='pdf'?'application/pdf':'text/csv'
      if(!response.ok||!response.headers.get('content-type')?.includes(expected)){const body=await response.json().catch(()=>null);throw new Error(body?.message??'The report could not be exported.')}
      const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=`sti-${active.kind}.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
    }catch(e){setError(e instanceof Error?e.message:'Export failed.')}finally{setExporting(false)}
  }
  const choices=definitions.data??[],definition=choices.find(item=>item.key===draft.kind),snapshot=Boolean(definition?.snapshot)
  const normalize=(f:Filters)=>JSON.stringify({kind:f.kind,period:choices.find(item=>item.key===f.kind)?.snapshot?'all':f.period,q:f.q.trim(),status:f.status.trim(),...(f.period==='custom'&&!choices.find(item=>item.key===f.kind)?.snapshot?{from:f.from,to:f.to}:{}),...(f.period==='semester'&&!choices.find(item=>item.key===f.kind)?.snapshot?{termId:f.termId}:{})})
  const dirty=normalize(draft)!==normalize(active)
  const columnLabels=data?.columnLabels??choices.find(item=>item.key===active.kind)?.columnLabels??{}
  return <SectionCard className="space-y-5 p-4 sm:p-6">
    <div><h2 className="text-xl font-bold">Choose your report</h2><p className="mt-2 text-sm opacity-70">Choose a report, set your filters, then select Apply filters. PDF and CSV include all matching pages.</p></div>
    {definitions.error?<p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{definitions.error.message} <button className="min-h-11 font-bold underline" onClick={()=>void definitions.refresh()}>Reload report choices</button></p>:null}
    <form onSubmit={apply} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="space-y-1 text-sm font-semibold">Report<select aria-label="Report type" disabled={!choices.length} className={field} value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value,status:''})}>{choices.length?choices.map(item=><option key={item.key} value={item.key}>{item.title}</option>):<option value={draft.kind}>Loading report choices…</option>}</select></label>
      <label className="space-y-1 text-sm font-semibold">Reporting period<select aria-label="Reporting period" disabled={snapshot} className={field} value={snapshot?'all':draft.period} onChange={e=>setDraft({...draft,period:e.target.value})}><option value="all">All recorded dates</option><option value="custom">Date range</option><option value="semester">Semester</option></select></label>
      <label className="space-y-1 text-sm font-semibold">Search<input aria-label="Search report" maxLength={150} className={field} value={draft.q} placeholder={definition?.searchHint??'Search this report'} onChange={e=>setDraft({...draft,q:e.target.value})}/></label>
      {!snapshot&&draft.period==='custom'&&<><label className="space-y-1 text-sm font-semibold">From<input aria-label="From date" required type="date" className={field} value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label><label className="space-y-1 text-sm font-semibold">To<input aria-label="To date" required type="date" className={field} value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label></>}
      {!snapshot&&draft.period==='semester'&&<label className="space-y-1 text-sm font-semibold">Semester<select aria-label="Semester" required className={field} value={draft.termId} onChange={e=>setDraft({...draft,termId:e.target.value})}><option value="">Choose a semester</option>{terms.map(t=><option disabled={!t.starts_on||!t.ends_on} key={t.id} value={t.id}>{t.term_name} · {t.academic_year}{!t.starts_on||!t.ends_on?' — dates not confirmed':''}</option>)}</select></label>}
      <label className="space-y-1 text-sm font-semibold">Status<select aria-label="Report status" disabled={!definition?.statuses.length&&!draft.status} className={field} value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}><option value="">All statuses</option>{draft.status&&!definition?.statuses.includes(draft.status)?<option value={draft.status}>{draft.status}</option>:null}{definition?.statuses.map(status=><option key={status}>{status}</option>)}</select></label>
      <Button type="submit" disabled={loading||!choices.length}><RefreshCw size={16}/>Apply filters</Button>
    </form>
    {snapshot&&<p className="text-sm opacity-70">This report is a current snapshot. A historical date range does not apply.</p>}
    {definition?<p className="text-sm opacity-70">{definition.dateBasis}</p>:null}
    {dirty?<p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Filters changed. Select Apply filters to update the preview and downloads.</p>:null}
    {error&&<p role="alert" className="rounded-xl bg-[#b42318] p-4 text-white">{error}</p>}
    {loading&&<p role="status">Loading source records…</p>}
    {data&&!loading&&<>
      <div className="flex flex-wrap justify-between gap-4 border-t border-[#0b5ea2]/15 pt-4 dark:border-white/20"><div><h3 className="font-bold">{data.title}</h3><p className="mt-1 text-sm opacity-70">{data.label} · {data.total.toLocaleString()} matching records</p><p className="mt-1 text-xs opacity-70">Applied search: {active.q||'All'} · Status: {active.status||'All'} · Philippine time</p><p className="mt-1 text-xs opacity-70">{data.note}</p></div><div className="flex flex-wrap gap-2"><Button disabled={exporting||dirty} onClick={()=>void download('csv')}><Download size={16}/>CSV</Button><Button variant="secondary" disabled={exporting||dirty} onClick={()=>void download('pdf')}><Download size={16}/>PDF</Button></div></div>
      <p className="text-sm font-semibold">Downloads include all {data.total.toLocaleString()} matching records, across every preview page.</p>
      {active.kind==='attendance'&&<div className="grid gap-3 sm:grid-cols-3">{[['Visits',data.metrics.total_visits],['Peak occupied seats',data.metrics.peak_occupancy],['Average visit',data.metrics.average_visit]].map(([title,value])=><div key={String(title)} className="rounded-xl bg-[#0b5ea2]/5 p-3 dark:bg-white/10"><p className="text-sm">{String(title)}</p><p className="mt-1 text-xl font-bold">{display(value)}</p></div>)}</div>}
      {data.rows.length?<div className="max-w-full overflow-x-auto rounded-xl border border-[#0b5ea2]/15 dark:border-white/20" tabIndex={0} aria-label="Scrollable report preview"><table className="w-full text-left text-sm"><thead className="bg-[#0b5ea2] text-white"><tr>{data.columns.map(c=><th scope="col" className="whitespace-nowrap px-4 py-3" key={c}>{columnLabels[c]??c.replaceAll('_',' ')}</th>)}</tr></thead><tbody>{data.rows.map((r,i)=><tr key={i} className="border-t border-[#0b5ea2]/10 dark:border-white/15">{data.columns.map(c=><td key={c} className="min-w-28 max-w-80 break-words px-4 py-3">{display(r[c])}</td>)}</tr>)}</tbody></table></div>:<p className="rounded-xl bg-[#0b5ea2]/5 p-6 text-center dark:bg-white/10">No records match these filters.</p>}
      {data.total>20&&<div className="flex items-center justify-between gap-3"><Button variant="secondary" disabled={Number(active.page)<=1} onClick={()=>page(Number(active.page)-1)}>Previous</Button><span className="text-sm">Page {active.page} of {Math.ceil(data.total/20)}</span><Button variant="secondary" disabled={Number(active.page)*20>=data.total} onClick={()=>page(Number(active.page)+1)}>Next</Button></div>}
      <p className="text-xs opacity-60">Source records checked {new Date(data.generatedAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}. A later export reads the latest committed records.</p>
    </>}
  </SectionCard>
}
