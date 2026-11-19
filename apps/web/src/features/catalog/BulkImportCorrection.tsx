import {useEffect,useRef,useState} from 'react'
import {Button} from '../../components/ui'
import {catalogInput} from './CatalogDetailsPanel'
import type {Batch,Options} from './enhanced-catalog-api'
import {importAutomationApi,type AutomationPreview,type CorrectionPlan,type ImportAutomationRun} from './import-automation-api'
export function BulkImportCorrection({batch,options,disabled,onWorking,onDone,onReviewReady}:{batch:Batch;options:Options;disabled:boolean;onWorking:(v:boolean)=>void;onDone:()=>Promise<void>;onReviewReady?:()=>void}){
 const [preview,setPreview]=useState<AutomationPreview|null>(null),[plans,setPlans]=useState<CorrectionPlan[]>([]),[clearInvalid,setClearInvalid]=useState(true)
 const [run,setRun]=useState<ImportAutomationRun|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[pauseRequested,setPauseRequested]=useState(false)
 const alive=useRef(true),working=useRef(false),stop=useRef(false),requestKey=useRef(crypto.randomUUID()),onWorkingRef=useRef(onWorking);onWorkingRef.current=onWorking
 const pending=batch.rows.filter(row=>row.status==='Review').length
 async function refresh(){
  setLoading(true);setError('')
  try{const result=await importAutomationApi.preview(batch.id);if(!alive.current)return;setPreview(result);setRun(result.latest?.kind==='correction'?result.latest:null)
   setPlans(current=>result.groups.map(group=>{const old=current.find(p=>p.sheet===group.sheet);return old??{sheet:group.sheet,categoryId:null,location:null}}))
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'The correction review could not be loaded.')}
  finally{if(alive.current)setLoading(false)}
 }
 useEffect(()=>{alive.current=true;void refresh();return()=>{alive.current=false;stop.current=true;onWorkingRef.current(false)}},[batch.id])
 async function drive(initial:ImportAutomationRun){
  if(working.current)return
  working.current=true;stop.current=false;setPauseRequested(false);setBusy(true);setError('');onWorkingRef.current(true)
  let current=initial
  try{
   if(current.status==='paused')current=await importAutomationApi.state(current,'running')
   if(alive.current)setRun(current)
   while(alive.current&&!stop.current&&current.status==='running'){
    const next=await importAutomationApi.step(current.id)
    if(alive.current)setRun(next)
    if(next.status==='running'&&next.processed<=current.processed)throw new Error('No new progress was confirmed. Refresh progress before continuing.')
    current=next
    if(current.status==='running'&&!stop.current)await new Promise(resolve=>window.setTimeout(resolve,1100))
   }
   if(alive.current&&stop.current&&current.status==='running'){current=await importAutomationApi.state(current,'paused');if(alive.current)setRun(current)}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Processing was interrupted. Saved progress is kept; refresh and continue.')}
  finally{
   working.current=false
   if(alive.current){try{await onDone()}catch{setError('Corrections are saved, but the list could not refresh. Refresh progress before continuing.')}finally{setBusy(false);setPauseRequested(false);onWorkingRef.current(false)}}else onWorkingRef.current(false)
  }
 }
 async function start(){
  if(!preview||busy||disabled)return
  setLoading(true);setError('');onWorkingRef.current(true)
  try{const result=await importAutomationApi.start(batch.id,{requestKey:requestKey.current,revision:preview.revision,plans,clearInvalidOptional:clearInvalid});if(!alive.current)return;setRun(result);setLoading(false);await drive(result)}
  catch(e){if(alive.current)setError(e instanceof Error?e.message:'The correction run could not start. Refresh saved progress before retrying.')}
  finally{onWorkingRef.current(false);if(alive.current)setLoading(false)}
 }
 async function continueRun(){if(!run)return;setLoading(true);onWorkingRef.current(true);try{const fresh=await importAutomationApi.status(run.id);if(alive.current){setRun(fresh);await drive(fresh)}}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Progress could not be refreshed.')}finally{onWorkingRef.current(false);if(alive.current)setLoading(false)}}
 async function cancel(){if(!run||busy)return;setLoading(true);setError('');try{const fresh=await importAutomationApi.status(run.id),next=await importAutomationApi.state(fresh,'cancelled');if(alive.current){setRun(next);requestKey.current=crypto.randomUUID();await onDone();await refresh()}}catch(e){if(alive.current)setError(e instanceof Error?e.message:'The correction run could not be cancelled.')}finally{if(alive.current)setLoading(false)}}
 function choose(sheet:string,patch:Partial<CorrectionPlan>){requestKey.current=crypto.randomUUID();setPlans(current=>current.map(plan=>plan.sheet===sheet?{...plan,...patch}:plan))}
 const valid=preview&&preview.groups.every(group=>{const plan=plans.find(p=>p.sheet===group.sheet);return (!group.missingCategory||plan?.categoryId)&&(!group.missingShelf||plan?.location)})
 const openRun=run&&['running','paused'].includes(run.status)
 return <section aria-label="Whole-list automatic correction" className="space-y-4 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-4">
  {disabled&&!busy&&<p className="text-sm">Save or discard open book edits before starting whole-list correction.</p>}
  {error&&<p role="alert" className="auth-error rounded-[8px] p-3 text-sm">{error}</p>}
  {run&&<div role="status" className="space-y-2 rounded-[8px] bg-[#0b5ea2]/5 p-3 text-sm dark:bg-white/5"><p className="font-semibold">{run.status==='completed'?'Correction complete':run.status==='cancelled'?'Correction stopped':busy?'Correcting books…':run.status==='paused'?'Correction paused':'Saved correction progress'}: {run.processed} of {run.total} checked</p><progress aria-label="Whole-list correction progress" value={run.processed} max={run.total} className="w-full"/><p>{run.counters.changed} updated · {run.counters.unresolved} need review · {run.counters.conflicts} changed elsewhere</p>{run.error&&<p>{run.error}</p>}<p className="text-xs">Corrections update this saved draft. Nothing is added to the library until you review the list and press Add copies.</p></div>}
  {run?.status==='completed'&&onReviewReady&&<Button disabled={disabled||busy||loading} onClick={onReviewReady}>Review and add corrected books</Button>}
  {(busy||openRun)&&<div className="flex flex-wrap gap-2">{busy?<Button variant="secondary" disabled={pauseRequested} onClick={()=>{stop.current=true;setPauseRequested(true)}}>{pauseRequested?'Pausing after this group…':'Pause after this group'}</Button>:openRun?<><Button disabled={disabled||loading} onClick={()=>void continueRun()}>Continue correcting all books</Button><Button variant="secondary" disabled={disabled||loading} onClick={()=>void cancel()}>Stop this run and review new choices</Button></>:null}</div>}
  {preview&&!openRun&&<div className="space-y-4"><p className="font-semibold">Review choices for {preview.total} pending books. {preview.imported} already imported books will be kept.</p>
   {preview.groups.map(group=>{const plan=plans.find(p=>p.sheet===group.sheet);return <fieldset key={group.sheet} disabled={busy||loading||disabled} className="grid gap-3 rounded-[8px] border border-[var(--sl-border)] p-3 sm:grid-cols-2"><legend className="px-1 text-sm font-bold">{group.sheet} · {group.total} books</legend><label className="text-sm">Category for {group.missingCategory} missing entries<select aria-label={`Category for ${group.sheet}`} disabled={!group.missingCategory} className={catalogInput} value={plan?.categoryId??''} onChange={e=>{const category=options.categories.find(c=>Number(c.id)===Number(e.target.value)),shelf=category?.shelfLocation;choose(group.sheet,{categoryId:Number(e.target.value)||null,...(shelf&&options.locations.some(l=>l.status==='Active'&&l.name===shelf)?{location:shelf}:{})})}}><option value="">Choose category</option>{options.categories.filter(c=>c.status==='Active'||!c.status).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="text-sm">Shelf for {group.missingShelf} missing entries<select aria-label={`Shelf for ${group.sheet}`} disabled={!group.missingShelf} className={catalogInput} value={plan?.location??''} onChange={e=>choose(group.sheet,{location:e.target.value||null})}><option value="">Choose managed shelf</option>{options.locations.filter(l=>l.status==='Active').map(l=><option key={l.id}>{l.name}</option>)}</select></label></fieldset>})}
   <p className="text-xs">Only missing category and shelf values receive these choices. Verify each section's actual location. Add any needed categories or shelves through Maintenance first.</p>
   {(preview.invalidIsbns>0||preview.invalidYears>0)&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={clearInvalid} disabled={loading||disabled} onChange={e=>{requestKey.current=crypto.randomUUID();setClearInvalid(e.target.checked)}}/><span>Leave invalid optional ISBNs ({preview.invalidIsbns}) and invalid years ({preview.invalidYears} entries) blank. Original values remain in the source and correction history; no replacement identifiers or dates are invented.</span></label>}
   <p className="text-xs">Unknown placeholders are cleaned to blanks. Uncertain matches, duplicate books and unresolved required information stay flagged for review.</p>
   <div className="flex flex-wrap gap-2"><Button disabled={disabled||loading||!valid||!preview.total||!pending} onClick={()=>void start()}>Start correction for {preview.total} books</Button></div>
  </div>}
 </section>
}
