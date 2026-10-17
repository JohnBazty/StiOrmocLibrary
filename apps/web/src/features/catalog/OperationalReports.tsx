import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, SectionCard } from '../../components/ui'
import { getAccessToken } from '../auth/auth-storage'
import { Download, RefreshCw } from 'lucide-react'

export const reportChoices = [
  ['holdings','Book and research holdings'],['circulation','Take-home borrowing'],['returns','Returned books'],['requests','Book requests and pickups'],
  ['inlibrary','In-library use'],['attendance','Attendance and usage'],['fines','Fines and replacement obligations'],['payments','Fine payment records'],
  ['printing','Printing requests'],['printRevenue','Printing cash revenue'],['stockExpenses','Supply restock expenses'],['supplies','Current print supplies'],['clearance','Student clearance'],
] as const
type Filters={kind:string;period:string;from:string;to:string;termId:string;q:string;status:string;page:string}
type ReportData={title:string;label:string;timezone:string;generatedAt:string;columns:string[];rows:Record<string,unknown>[];total:number;note:string;
  metrics:Record<string,unknown>;terms:Array<{id:number;academic_year:string;term_name:string}>}
const field='min-h-11 w-full rounded-xl border border-[#0b5ea2]/20 bg-white px-3 text-sm text-[#0b5ea2] focus:outline-2 focus:outline-[#0b5ea2] dark:border-white/25 dark:bg-white/10 dark:text-white'
const display=(v:unknown)=>v==null?'—':typeof v==='number'?v.toLocaleString('en-PH',{maximumFractionDigits:2}):String(v)
const label=(s:string)=>s.replaceAll('_',' ')
function headers(){const token=getAccessToken();return token?{Authorization:`Bearer ${token}`}:undefined}
export async function loadLiveReport(filters:Filters):Promise<ReportData>{
  const response=await fetch(`/api/v1/admin/reports?${new URLSearchParams(filters)}`,{headers:headers(),credentials:'include'})
  const body=await response.json().catch(()=>null)
  if(!response.ok||!body?.success)throw new Error(body?.message??'The report is unavailable.')
  return body.data
}
export function OperationalReports(){
  const[params,setParams]=useSearchParams(), today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
  const initial:Filters={kind:params.get('kind')??'circulation',period:params.get('period')??'all',from:params.get('from')??today,to:params.get('to')??today,termId:params.get('termId')??'',q:params.get('q')??'',status:params.get('status')??'',page:params.get('page')??'1'}
  const[draft,setDraft]=useState(initial),[active,setActive]=useState(initial),[data,setData]=useState<ReportData|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[exporting,setExporting]=useState(false),sequence=useRef(0)
  const [terms,setTerms]=useState<ReportData['terms']>([]),current=JSON.stringify(active)
  useEffect(()=>{const n=++sequence.current;setLoading(true);setError('');setData(null);void loadLiveReport(active).then(d=>{if(n===sequence.current){setData(d);setTerms(d.terms)}}).catch(e=>{if(n===sequence.current)setError(e instanceof Error?e.message:'Report unavailable.')}).finally(()=>{if(n===sequence.current)setLoading(false)});return()=>{sequence.current++}},[current])
  function apply(e:FormEvent){e.preventDefault();const next={...draft,period:['holdings','supplies','clearance'].includes(draft.kind)?'all':draft.period,page:'1'};setActive(next);setParams(next,{replace:true})}
  function page(value:number){const next={...active,page:String(value)};setActive(next);setParams(next,{replace:true})}
  async function download(format:'csv'|'pdf'){
    setExporting(true);setError('')
    try{const response=await fetch(`/api/v1/admin/reports/export?${new URLSearchParams({...active,format})}`,{headers:headers(),credentials:'include'}),expected=format==='pdf'?'application/pdf':'text/csv'
      if(!response.ok||!response.headers.get('content-type')?.includes(expected)){const body=await response.json().catch(()=>null);throw new Error(body?.message??'The report could not be exported.')}
      const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=`sti-${active.kind}.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
    }catch(e){setError(e instanceof Error?e.message:'Export failed.')}finally{setExporting(false)}
  }
  const snapshot=['holdings','supplies','clearance'].includes(draft.kind)
  return <SectionCard className="space-y-5 p-4 sm:p-6">
    <div><h2 className="text-xl font-bold">Live records and exports</h2><p className="mt-2 text-sm opacity-70">Choose a report and apply filters. Exports include every matching row, not just the preview page. Dates and attendance use Asia/Manila.</p></div>
    <form onSubmit={apply} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="space-y-1 text-sm font-semibold">Report<select aria-label="Report type" className={field} value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value,status:''})}>{reportChoices.map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label>
      <label className="space-y-1 text-sm font-semibold">Reporting period<select aria-label="Reporting period" disabled={snapshot} className={field} value={snapshot?'all':draft.period} onChange={e=>setDraft({...draft,period:e.target.value})}><option value="all">All recorded dates</option><option value="custom">Date range</option><option value="semester">Semester</option></select></label>
      <label className="space-y-1 text-sm font-semibold">Search<input aria-label="Search report" className={field} value={draft.q} placeholder="Name, school ID, title or record" onChange={e=>setDraft({...draft,q:e.target.value})}/></label>
      {!snapshot&&draft.period==='custom'&&<><label className="space-y-1 text-sm font-semibold">From<input aria-label="From date" required type="date" className={field} value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label><label className="space-y-1 text-sm font-semibold">To<input aria-label="To date" required type="date" className={field} value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label></>}
      {!snapshot&&draft.period==='semester'&&<label className="space-y-1 text-sm font-semibold">Semester<select aria-label="Semester" required className={field} value={draft.termId} onChange={e=>setDraft({...draft,termId:e.target.value})}><option value="">Choose a semester</option>{terms.map(t=><option key={t.id} value={t.id}>{t.term_name} · {t.academic_year}</option>)}</select></label>}
      <label className="space-y-1 text-sm font-semibold">Exact status (optional)<input aria-label="Report status" className={field} value={draft.status} placeholder="For example: Borrowed or Cleared" onChange={e=>setDraft({...draft,status:e.target.value})}/></label>
      <Button type="submit" disabled={loading}><RefreshCw size={16}/>Apply filters</Button>
    </form>
    {snapshot&&<p className="text-sm opacity-70">This report is a current snapshot. A historical date range does not apply.</p>}
    {error&&<p role="alert" className="rounded-xl bg-[#b42318] p-4 text-white">{error}</p>}
    {loading&&<p role="status">Loading source records…</p>}
    {data&&!loading&&<>
      <div className="flex flex-wrap justify-between gap-4 border-t border-[#0b5ea2]/15 pt-4 dark:border-white/20"><div><h3 className="font-bold">{data.title}</h3><p className="mt-1 text-sm opacity-70">{data.label} · {data.total.toLocaleString()} matching records</p><p className="mt-1 text-xs opacity-70">{data.note}</p></div><div className="flex flex-wrap gap-2"><Button disabled={exporting} onClick={()=>void download('csv')}><Download size={16}/>CSV</Button><Button variant="secondary" disabled={exporting} onClick={()=>void download('pdf')}><Download size={16}/>PDF</Button></div></div>
      {active.kind==='attendance'&&<div className="grid gap-3 sm:grid-cols-3">{[['Visits',data.metrics.total_visits],['Peak occupied seats',data.metrics.peak_occupancy],['Average visit',data.metrics.average_visit]].map(([title,value])=><div key={String(title)} className="rounded-xl bg-[#0b5ea2]/5 p-3 dark:bg-white/10"><p className="text-sm">{String(title)}</p><p className="mt-1 text-xl font-bold">{display(value)}</p></div>)}</div>}
      {data.rows.length?<div className="max-w-full overflow-x-auto rounded-xl border border-[#0b5ea2]/15 dark:border-white/20" tabIndex={0} aria-label="Scrollable report preview"><table className="w-full text-left text-sm"><thead className="bg-[#0b5ea2] text-white"><tr>{data.columns.map(c=><th scope="col" className="whitespace-nowrap px-4 py-3 capitalize" key={c}>{label(c)}</th>)}</tr></thead><tbody>{data.rows.map((r,i)=><tr key={i} className="border-t border-[#0b5ea2]/10 dark:border-white/15">{data.columns.map(c=><td key={c} className="min-w-28 max-w-80 break-words px-4 py-3">{display(r[c])}</td>)}</tr>)}</tbody></table></div>:<p className="rounded-xl bg-[#0b5ea2]/5 p-6 text-center dark:bg-white/10">No records match these filters.</p>}
      {data.total>20&&<div className="flex items-center justify-between gap-3"><Button variant="secondary" disabled={Number(active.page)<=1} onClick={()=>page(Number(active.page)-1)}>Previous</Button><span className="text-sm">Page {active.page} of {Math.ceil(data.total/20)}</span><Button variant="secondary" disabled={Number(active.page)*20>=data.total} onClick={()=>page(Number(active.page)+1)}>Next</Button></div>}
      <p className="text-xs opacity-60">Source records checked {new Date(data.generatedAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}. A later export reads the latest committed records.</p>
    </>}
  </SectionCard>
}
