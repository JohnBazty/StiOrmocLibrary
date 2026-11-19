import { formatLoanDate, loanOverdueLabel } from '../circulation/loan-time'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { Button, SectionCard } from '../../components/ui'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { RowActions } from '../../components/RowActions'
import { CirculationReturnDialog } from '../circulation/CirculationReturnDialog'
import { circulationApi } from '../circulation/circulation-api'
import { reservationApi } from '../reservations/reservation-api'
import { deskDashboardApi, type DeskOverview, type DeskTask, type DeskTaskFilters } from './desk-dashboard-api'
import { useDashboardResource } from './useDashboardResource'
import { DeskDialog } from './DeskDialog'

export const deskField='min-h-11 w-full rounded-xl border border-[#0b5ea2]/20 bg-white px-3 text-sm text-[#0b5ea2] dark:border-white/20 dark:bg-[#20212b] dark:text-white'
export const deskDate=(value:string)=>formatLoanDate(value)
export function academicLabel(row:DeskTask){if(row.role!=='Student')return row.role;const grade=row.department==='SHS'&&row.level?`Grade ${row.level}`:row.department==='College'&&row.level?`${row.level}${({1:'st',2:'nd',3:'rd'} as Record<string,string>)[row.level]??'th'} Year`:'';return [grade,row.program].filter(Boolean).join(' — ')||'Not recorded'}

export function DashboardTaskTable({filters,setFilters,overview,refreshKey,onChanged,reminderRequest,onReminderBusy}:{filters:DeskTaskFilters;setFilters:(value:DeskTaskFilters)=>void;overview:DeskOverview|null;refreshKey:number;onChanged:()=>void;reminderRequest:number;onReminderBusy?:(busy:boolean)=>void}){
 const loader=useCallback((signal:AbortSignal)=>deskDashboardApi.tasks(filters,signal),[filters])
 const {data,error,loading}=useDashboardResource(loader,refreshKey)
 const [action,setAction]=useState<{type:'lost'|'ready';row:DeskTask}|null>(null),[returnRow,setReturnRow]=useState<DeskTask|null>(null)
 const [actionError,setActionError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
 const [exporting,setExporting]=useState(false)
 const running=useRef(false)
 const update=(change:Partial<DeskTaskFilters>)=>setFilters({...filters,...change,page:change.page??1})
 const sendReminders=useCallback(async(id?:number)=>{
  if(running.current)return;running.current=true;setBusy(true);onReminderBusy?.(true);setActionError('');setNotice('')
  try{
   const eligible=await deskDashboardApi.reminders(filters,id)
   if(!eligible.items.length){setNotice('No new email reminders are needed. These loans already have an email request, are no longer overdue, or need a school email.');return}
   const result=await deskDashboardApi.queue(eligible.items.map(row=>row.id))
   setNotice(`${result.queued} email reminders queued. They will be sent automatically to registered school email addresses. ${result.skipped} were already queued or are no longer eligible.`)
  }catch(cause){setActionError(cause instanceof Error?cause.message:'Email reminders could not be queued. Please try again.')}
  finally{running.current=false;setBusy(false);onReminderBusy?.(false);onChanged()}
 },[filters,onChanged,onReminderBusy])
 // The card sends an explicit request, not a side effect of polling/filter changes.
 const seenRequest=useRef(0)
 useEffect(()=>{if(reminderRequest!==seenRequest.current){seenRequest.current=reminderRequest;void sendReminders()}},[reminderRequest,sendReminders])
 async function perform(){
  if(running.current)return;running.current=true;setBusy(true);setActionError('')
  try{if(action){if(action.type==='lost'){await circulationApi.reportLost(action.row.id);setNotice('Lost report recorded. Replacement charges remain subject to the existing review.')}else{await reservationApi.adjustStatus(action.row.id,'ready_for_pickup');setNotice('Copy marked ready. The pickup deadline and notification have been updated.')}setAction(null)}
   onChanged()
  }catch(cause){setActionError(cause instanceof Error?cause.message:'This action could not be completed.');onChanged()}finally{running.current=false;setBusy(false)}
 }
 async function exportList(){if(exporting)return;setExporting(true);setActionError('');try{await deskDashboardApi.export(filters)}catch(cause){setActionError(cause instanceof Error?cause.message:'Export failed.')}finally{setExporting(false)}}
 const programs=overview?.programs.filter(item=>!filters.department||item.department===filters.department).map(item=>item.program)??[]
 return <section aria-labelledby="desk-tasks-heading" className="mb-6 scroll-mt-24" id="desk-task-list">
  <SectionCard className="overflow-hidden"><header className="space-y-4 border-b border-current/10 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="desk-tasks-heading" className="text-balance text-xl font-bold">Overdue & reservation tasks</h2><p className="mt-1 text-sm opacity-75">Oldest due first. Reservations keep their queue order.</p></div><Button variant="secondary" disabled={exporting} onClick={()=>void exportList()}><Download size={16}/>{exporting?'Exporting…':'Export filtered list'}</Button></div>
   <div role="group" aria-label="Dashboard task list" className="flex flex-wrap gap-2">{([['overdue','Overdue books'],['holds','Pending reservations'],['due','Due today']] as const).map(([tab,label])=><button type="button" key={tab} aria-pressed={filters.tab===tab} onClick={()=>update({tab})} className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold ${filters.tab===tab?'border-[#0b5ea2] bg-[#0b5ea2] text-white':'border-current/15 hover:bg-[#0b5ea2]/5'}`}>{label}</button>)}</div>
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><label className="text-xs font-bold">Department<select aria-label="Department" value={filters.department} onChange={event=>update({department:event.target.value,program:'',level:''})} className={'mt-2 '+deskField}><option value="">All departments</option><option value="SHS">Senior High School</option><option>College</option><option value="Other">Faculty / Other</option></select></label>
    <label className="text-xs font-bold">Strand / program<select aria-label="Strand or program" className={'mt-2 '+deskField} value={filters.program} onChange={event=>update({program:event.target.value})}><option value="">All strands / programs</option>{Array.from(new Set([...programs,...(filters.department==='SHS'?['STEM','ABM','HUMSS','TVL']:filters.department==='College'?['BSIT','BSHM','BSTM']:['STEM','ABM','HUMSS','TVL','BSIT','BSHM','BSTM'])])).sort().map(program=><option key={program}>{program}</option>)}</select></label>
    <label className="text-xs font-bold">Grade / year<select aria-label="Grade or year" className={'mt-2 '+deskField} value={filters.level} onChange={event=>update({level:event.target.value})}><option value="">All levels</option>{(filters.department==='SHS'?['11','12']:filters.department==='College'?['1','2','3','4']:['11','12','1','2','3','4']).map(level=><option key={level} value={level}>{['11','12'].includes(level)?'Grade '+level:'Year '+level}</option>)}</select></label>
    <label className="text-xs font-bold">Find in this list<input aria-label="Search dashboard tasks" placeholder="Name, ID, title or barcode" maxLength={80} className={'mt-2 '+deskField} value={filters.q} onChange={event=>update({q:event.target.value})}/></label>
   </div><p className="text-xs opacity-75">Academic groups use current profile details. Faculty and missing details remain visible under All departments.</p>
  </header>
  <div className="px-4 pt-3 sm:px-5">{loading?<p role="status" className="mb-3 text-sm">Updating task list…</p>:null}{error?<p role="alert" className="auth-error mb-3 rounded-xl p-3 text-sm">{error} {data?'Showing the last confirmed list.':''}<button onClick={onChanged} className="ml-2 min-h-11 font-bold underline">Retry list</button></p>:null}{actionError&&!action?<p role="alert" className="auth-error mb-3 rounded-xl p-3 text-sm">{actionError}</p>:null}{notice?<p role="status" data-tone="success" className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{notice}</p>:null}{busy?<p role="status" className="mb-3 text-sm">Processing your request…</p>:null}</div>
  <ResponsiveTable label="Dashboard circulation tasks"><table className="w-full text-left text-sm"><thead className="bg-[#0b5ea2]/5 dark:bg-white/5"><tr>{['Borrower','Department & level/program','Book','Due / request date','Quick actions'].map(label=><th key={label} className="px-4 py-3 font-bold">{label}</th>)}</tr></thead><tbody>{data?.items.map(row=><tr key={row.kind+row.id} className="border-t border-current/10 align-top"><td className="px-4 py-4"><p className="font-bold">{row.borrower}</p><p className="mt-1 text-xs opacity-75">{row.schoolId}</p></td><td className="px-4 py-4"><p>{academicLabel(row)}</p><p className="mt-1 text-xs opacity-75">{row.department==='Other'?row.role:row.department}</p></td><td className="px-4 py-4"><p className="font-semibold">{row.title}</p><p className="mt-1 break-all font-mono text-xs opacity-75">{row.barcode||'Copy not assigned'}</p></td><td className="px-4 py-4"><p className="text-xs">{deskDate(row.date)}</p><span className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${row.status==='Overdue'?'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-100':row.status==='Due today'?'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100':'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-100'}`}>{row.status}</span>{row.status==='Overdue'?<p className="mt-1 text-xs opacity-75">{loanOverdueLabel(row.date,data?.generatedAt) ?? 'Overdue'}</p>:null}</td><td className="px-4 py-4"><div className="flex flex-col items-start gap-2">
   {row.kind==='Loan'?<><Button variant="secondary" disabled={Boolean(error)||busy||loading||!row.barcode} onClick={()=>setReturnRow(row)}>Return book</Button>{row.status==='Overdue'?row.reminderStatus?<span className="text-xs font-semibold">Email: {row.reminderStatus}</span>:<Button variant="secondary" disabled={Boolean(error)||busy||loading} onClick={()=>void sendReminders(row.id)}>Send email reminder</Button>:null}{row.lostReported?<span className="text-xs font-semibold">Lost report recorded</span>:<RowActions label={'More actions for '+row.title}><button disabled={Boolean(error)||busy||loading} onClick={()=>{setActionError('');setAction({type:'lost',row})}}>Report lost</button></RowActions>}</>:<><Button disabled={Boolean(error)||busy||loading} onClick={()=>{setActionError('');setAction({type:'ready',row})}}>Mark ready</Button><a className="inline-flex min-h-11 items-center text-sm underline" href="/librarian/reservations">Open book queue</a></>}
  </div></td></tr>)}{data&&!data.items.length?<tr><td colSpan={5} className="p-8 text-center opacity-75">No tasks match these filters.</td></tr>:null}</tbody></table></ResponsiveTable>
  <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-current/10 p-4"><span className="text-xs opacity-75">{data?`${data.total} matching tasks · Page ${filters.page} of ${Math.max(1,Math.ceil(data.total/25))}`:'Task totals unavailable'}</span><div className="flex gap-2"><Button variant="secondary" disabled={loading||filters.page===1} onClick={()=>update({page:filters.page-1})}>Previous</Button><Button variant="secondary" disabled={loading||!data||filters.page*25>=data.total} onClick={()=>update({page:filters.page+1})}>Next</Button></div></footer>
  </SectionCard>
  {returnRow?<CirculationReturnDialog barcode={returnRow.barcode} onClose={()=>setReturnRow(null)} onReturned={message=>{setReturnRow(null);setNotice(message);onChanged()}}/>:null}
  {action?<DeskDialog title={action.type==='lost'?'Report lost book':'Mark copy ready'} busy={busy} onClose={()=>{setAction(null);setActionError('')}}><p className="font-bold">{action.row.title}</p><p className="text-sm">{action.row.borrower} · {action.row.schoolId}</p><p className="text-sm leading-6">{action.type==='lost'?'This records a lost-book report for staff review. It does not automatically confirm a replacement charge.':'Confirm that this exact copy has been pulled from the shelf and is ready for collection. This starts the existing pickup deadline and sends the normal pickup notice.'}</p>{actionError?<p role="alert" className="auth-error rounded-xl p-3 text-sm">{actionError}</p>:null}<div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={()=>void perform()}>{busy?'Saving…':action.type==='lost'?'Submit lost report':'Confirm ready'}</Button><Button variant="secondary" disabled={busy} onClick={()=>setAction(null)}>Cancel</Button></div></DeskDialog>:null}
 </section>
}
