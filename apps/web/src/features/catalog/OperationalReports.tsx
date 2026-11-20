import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, SectionCard } from '../../components/ui'
import { getCsrfToken } from '../auth/auth-storage'
import { RefreshCw } from 'lucide-react'
import { ExportMenu } from '../../components/ExportMenu'
import { RefreshButton } from '../../components/RefreshButton'

export const reportChoices = [
  ['holdings','Book and research holdings'],['circulation','Take-home borrowing'],['returns','Returned books'],['requests','Book requests and pickups'],
  ['inlibrary','In-library use'],['attendance','Attendance and usage'],['fines','Fines and replacement obligations'],['payments','Fine payment records'],
  ['onlinePayments','Online payment reconciliation'],['printing','Printing requests'],['printRevenue','Printing payment records'],['stockExpenses','Supply restock expenses'],['supplies','Current print supplies'],['clearance','Student clearance'],
] as const
type Filters={kind:string;period:string;from:string;to:string;termId:string;q:string;status:string;page:string;dateBasis:string;borrower:string;service:string;program:string;department:string}
type ReportData={title:string;label:string;timezone:string;generatedAt:string;columns:string[];rows:Record<string,unknown>[];total:number;note:string;
  metrics:Record<string,unknown>;terms:Array<{id:number;academic_year:string;term_name:string}>}
const field='min-h-11 w-full rounded-xl border border-[#0b5ea2]/20 bg-white px-3 text-sm text-[#0b5ea2] focus:outline-2 focus:outline-[#0b5ea2] dark:border-white/25 dark:bg-white/10 dark:text-white'
const display=(v:unknown)=>v==null?'—':typeof v==='number'?v.toLocaleString('en-PH',{maximumFractionDigits:2}):String(v)
const columnLabels: Record<string, string> = { id: 'Record number', school_id: 'School ID', borrowed: 'Date borrowed', due: 'Due date', returned: 'Date returned', created_at: 'Date recorded', updated_at: 'Last updated', user_id: 'User number', account_id: 'Account number', payment_id: 'Payment number', request_id: 'Request number' }
const label=(s:string)=>columnLabels[s]??s.replaceAll('_',' ').replace(/^./,value=>value.toUpperCase())
function headers(){const token=getCsrfToken();return token?{'X-CSRF-Token': token}:undefined}
export async function loadLiveReport(filters:Filters):Promise<ReportData>{
  const response=await fetch(`/api/v1/admin/reports?${new URLSearchParams(filters)}`,{headers:headers(),credentials:'include'})
  const body=await response.json().catch(()=>null)
  if(!response.ok||!body?.success)throw new Error(body?.message??'The report is unavailable.')
  return body.data
}
export function OperationalReports(){
  const[params,setParams]=useSearchParams(), today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
  const initial:Filters={kind:params.get('kind')??'circulation',period:params.get('period')??'all',from:params.get('from')??today,to:params.get('to')??today,termId:params.get('termId')??'',q:params.get('q')??'',status:params.get('status')??'',page:params.get('page')??'1',dateBasis:params.get('dateBasis')??'recorded',borrower:params.get('borrower')??'',service:params.get('service')??'',program:params.get('program')??'',department:params.get('department')??''}
  const[draft,setDraft]=useState(initial),[active,setActive]=useState(initial),[data,setData]=useState<ReportData|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[exporting,setExporting]=useState(false),sequence=useRef(0),[revision,setRevision]=useState(0)
  const [terms,setTerms]=useState<ReportData['terms']>([]),current=JSON.stringify(active)
  useEffect(()=>{const n=++sequence.current;setLoading(true);setError('');setData(null);void loadLiveReport(active).then(d=>{if(n===sequence.current){setData(d);setTerms(d.terms)}}).catch(e=>{if(n===sequence.current)setError(e instanceof Error?e.message:'Report unavailable.')}).finally(()=>{if(n===sequence.current)setLoading(false)});return()=>{sequence.current++}},[current,revision])
  function apply(e:FormEvent){e.preventDefault();const next={...draft,period:['holdings','supplies','clearance'].includes(draft.kind)?'all':draft.period,page:'1'};setActive(next);setParams({...Object.fromEntries(params),...next},{replace:true})}
  function page(value:number){const next={...active,page:String(value)};setActive(next);setParams({...Object.fromEntries(params),...next},{replace:true})}
  async function download(format:'csv'|'pdf'){
    setExporting(true);setError('')
    try{const response=await fetch(`/api/v1/admin/reports/export?${new URLSearchParams({...active,format})}`,{headers:headers(),credentials:'include'}),expected=format==='pdf'?'application/pdf':'text/csv'
      if(!response.ok||!response.headers.get('content-type')?.includes(expected)){const body=await response.json().catch(()=>null);throw new Error(body?.message??'The report could not be exported.')}
      const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=`sti-${active.kind}.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
    }catch(e){setError(e instanceof Error?e.message:'Export failed.')}finally{setExporting(false)}
  }
  const snapshot=['holdings','supplies','clearance'].includes(draft.kind)
  return <SectionCard className="space-y-5 p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">Live records and exports</h2><p className="mt-2 text-sm opacity-70">Choose a report and apply filters. Exports include every matching row, not just the preview page. Dates and attendance use Asia/Manila.</p></div><RefreshButton onRefresh={()=>setRevision(value=>value+1)} variant="secondary" disabled={loading} /></div>
    <form onSubmit={apply} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="space-y-1 text-sm font-semibold">Report<select aria-label="Report type" className={field} value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value,status:'',dateBasis:'recorded',borrower:'',service:'',program:'',department:''})}>{reportChoices.map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label>
      <label className="space-y-1 text-sm font-semibold">Reporting period<select aria-label="Reporting period" disabled={snapshot} className={field} value={snapshot?'all':draft.period} onChange={e=>setDraft({...draft,period:e.target.value})}><option value="all">All recorded dates</option><option value="custom">Date range</option><option value="semester">Semester</option></select></label>
      <label className="space-y-1 text-sm font-semibold">Search<input aria-label="Search report" className={field} value={draft.q} placeholder="Name, school ID, title or record" onChange={e=>setDraft({...draft,q:e.target.value})}/></label>
      {!snapshot&&draft.period==='custom'&&<><label className="space-y-1 text-sm font-semibold">From<input aria-label="From date" required type="date" className={field} value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label><label className="space-y-1 text-sm font-semibold">To<input aria-label="To date" required type="date" className={field} value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label></>}
      {!snapshot&&draft.period==='semester'&&<label className="space-y-1 text-sm font-semibold">Semester<select aria-label="Semester" required className={field} value={draft.termId} onChange={e=>setDraft({...draft,termId:e.target.value})}><option value="">Choose a semester</option>{terms.map(t=><option key={t.id} value={t.id}>{t.term_name} · {t.academic_year}</option>)}</select></label>}
      <label className="space-y-1 text-sm font-semibold">Exact status (optional)<input aria-label="Report status" className={field} value={draft.status} placeholder="For example: Borrowed or Cleared" onChange={e=>setDraft({...draft,status:e.target.value})}/></label>
      {['circulation','returns'].includes(draft.kind)&&<label className="space-y-1 text-sm font-semibold">Date basis<select aria-label="Date basis" className={field} value={draft.dateBasis} onChange={e=>setDraft({...draft,dateBasis:e.target.value})}><option value="recorded">Default recorded date</option><option value="borrowed">Borrowed date</option><option value="due">Due date</option><option value="returned">Returned date</option></select></label>}
      {!['holdings','supplies','stockExpenses','attendance'].includes(draft.kind)&&<label className="space-y-1 text-sm font-semibold">Borrower school ID<input aria-label="Borrower school ID" className={field} value={draft.borrower} onChange={e=>setDraft({...draft,borrower:e.target.value})}/></label>}
      {draft.kind==='printing'&&<label className="space-y-1 text-sm font-semibold">Service<select aria-label="Service" className={field} value={draft.service} onChange={e=>setDraft({...draft,service:e.target.value})}><option value="">All services</option><option>Print</option><option>Photocopy</option></select></label>}
      {!['holdings','supplies','stockExpenses','attendance'].includes(draft.kind)&&<label className="space-y-1 text-sm font-semibold">Student program / strand<input aria-label="Student program / strand" className={field} value={draft.program} placeholder="Exact program, for example BSIT" onChange={e=>setDraft({...draft,program:e.target.value,department:''})}/></label>}
      {!['holdings','supplies','stockExpenses','attendance','clearance'].includes(draft.kind)&&<label className="space-y-1 text-sm font-semibold">Faculty department<input aria-label="Faculty department" className={field} value={draft.department} placeholder="Exact reviewed department" onChange={e=>setDraft({...draft,department:e.target.value,program:''})}/></label>}
      <Button type="submit" disabled={loading}><RefreshCw size={16}/>Apply filters</Button>
    </form>
    {snapshot&&<p className="text-sm opacity-70">This report is a current snapshot. A historical date range does not apply.</p>}
    {error&&<p role="alert" className="rounded-xl bg-[#b42318] p-4 text-white">{error}</p>}
    {loading&&<p role="status">Loading source records…</p>}
    {data&&!loading&&<>
      <div className="flex flex-wrap justify-between gap-4 border-t border-[#0b5ea2]/15 pt-4 dark:border-white/20"><div><h3 className="font-bold">{data.title}</h3><p className="mt-1 text-sm opacity-70">{data.label} · {data.total.toLocaleString()} matching records</p><p className="mt-1 text-xs opacity-70">{data.note}</p></div><ExportMenu disabled={exporting} exports={[{label:"CSV",onSelect:()=>void download("csv")},{label:"PDF",onSelect:()=>void download("pdf")}]} /></div>
      {active.kind==='fines'&&<p className="text-sm font-semibold">Assessed (PHP): {display(data.metrics.assessed)} · Outstanding debt (PHP): {display(data.metrics.outstanding)}. Debt is not collected revenue.</p>}
      {active.kind==='attendance'&&<div className="grid gap-3 sm:grid-cols-3">{[['Visits',data.metrics.total_visits],['Peak occupied seats',data.metrics.peak_occupancy],['Average visit',data.metrics.average_visit]].map(([title,value])=><div key={String(title)} className="rounded-xl bg-[#0b5ea2]/5 p-3 dark:bg-white/10"><p className="text-sm">{String(title)}</p><p className="mt-1 text-xl font-bold">{display(value)}</p></div>)}</div>}
      {['payments','printRevenue','onlinePayments'].includes(active.kind)&&<div className="grid gap-3 sm:grid-cols-3">{[['Principal (PHP)',data.metrics.principal],['User fees (PHP)',data.metrics.transaction_fees],['Gross paid (PHP)',data.metrics.gross],['Known provider costs (PHP)',data.metrics.processing_cost],['Recorded net settlement (PHP)',data.metrics.net_settled],['Settlements recorded',data.metrics.settlements_recorded]].map(([title,value])=><div key={String(title)} className="rounded-xl bg-[#0b5ea2]/5 p-3 dark:bg-white/10"><p className="text-sm">{String(title)}</p><p className="mt-1 text-xl font-bold tabular-nums">{display(value)}</p></div>)}</div>}
      {active.kind==='onlinePayments'?<p className="rounded-xl border border-slate-300 p-4 font-semibold">Captured payments needing review (PHP): {display(data.metrics.captured_needing_review)}. These are excluded from successful principal totals.</p>:null}
      {data.rows.length?<div className="max-w-full overflow-x-auto rounded-xl border border-[#0b5ea2]/15 dark:border-white/20" tabIndex={0} aria-label="Scrollable report preview"><table className="w-full text-left text-sm"><thead className="bg-[#0b5ea2] text-white"><tr>{data.columns.map(c=><th scope="col" className="whitespace-nowrap px-4 py-3 capitalize" key={c}>{label(c)}</th>)}</tr></thead><tbody>{data.rows.map((r,i)=><tr key={i} className="border-t border-[#0b5ea2]/10 dark:border-white/15">{data.columns.map(c=><td key={c} className="min-w-28 max-w-80 break-words px-4 py-3">{display(r[c])}</td>)}</tr>)}</tbody></table></div>:<p className="rounded-xl bg-[#0b5ea2]/5 p-6 text-center dark:bg-white/10">No records match these filters.</p>}
      {data.total>20&&<div className="flex items-center justify-between gap-3"><Button variant="secondary" disabled={Number(active.page)<=1} onClick={()=>page(Number(active.page)-1)}>Previous</Button><span className="text-sm">Page {active.page} of {Math.ceil(data.total/20)}</span><Button variant="secondary" disabled={Number(active.page)*20>=data.total} onClick={()=>page(Number(active.page)+1)}>Next</Button></div>}
      <p className="text-xs opacity-60">Source records checked {new Date(data.generatedAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}. A later export reads the latest committed records.</p>
    </>}
  </SectionCard>
}
