import { useCallback,useEffect,useRef,useState } from 'react'
import { Button,SectionCard,StatusBadge } from '../../components/ui'
import { borrowingScheduleApi,pickupDateLabel,type BorrowingSchedule } from './borrowing-schedule-api'

export function BorrowingSchedules() {
 const [items,setItems]=useState<BorrowingSchedule[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState<number|null>(null),[cancel,setCancel]=useState<BorrowingSchedule|null>(null)
 const running=useRef(false),mounted=useRef(false),acting=useRef(false),revision=useRef(0)
 const load=useCallback(async()=>{if(running.current)return;running.current=true;const started=revision.current;try{const rows=await borrowingScheduleApi.mine();if(mounted.current&&started===revision.current){setItems(rows);setError('')}}catch(e){if(mounted.current&&started===revision.current)setError(e instanceof Error?e.message:'Scheduled requests could not be loaded.')}finally{running.current=false}},[])
 useEffect(()=>{mounted.current=true;void load();const timer=setInterval(()=>void load(),30000);const refresh=()=>void load();window.addEventListener('smartlib:circulation-updated',refresh);return()=>{mounted.current=false;clearInterval(timer);window.removeEventListener('smartlib:circulation-updated',refresh)}},[load])
 async function confirmCancel(){if(!cancel||acting.current)return;acting.current=true;setBusy(cancel.scheduleId);try{const saved=await borrowingScheduleApi.cancel(cancel.scheduleId);revision.current++;setItems(rows=>rows.map(row=>row.scheduleId===saved.scheduleId?{...row,...saved}:row));setCancel(null);await load();window.dispatchEvent(new Event('smartlib:circulation-updated'))}catch(e){setError(e instanceof Error?e.message:'The schedule could not be cancelled.')}finally{setBusy(null);acting.current=false}}
 const visible=items.filter(r=>r.status!=='prepared')
 if(!visible.length&&!error)return null
 return <section aria-label="Scheduled borrowing" className="mb-6">
  <h2 className="mb-2 text-lg font-bold">Scheduled borrowing</h2><p className="mb-4 text-sm">Pending schedules do not hold a copy. Preparation starts one open library day before pickup, subject to availability and your borrowing allowance. Prepared schedules appear with your book requests below.</p>
  {error?<p role="alert" className="auth-error mb-3 rounded-xl p-3">{error}</p>:null}
  <div className="grid gap-4 lg:grid-cols-2">{visible.map(r=><SectionCard key={r.scheduleId} className="p-5"><h3 className="font-bold">{r.title}</h3><p className="my-2">Preferred pickup: {pickupDateLabel(r.pickupDate)}</p><StatusBadge status={r.status==='scheduled'?'Scheduled':r.status==='unfulfilled'?'Unfulfilled':'Cancelled'}/>{r.reason?<p className="mt-3 text-sm">{r.reason}</p>:null}{r.status==='scheduled'?<Button variant="secondary" disabled={busy!==null} className="mt-4" onClick={()=>setCancel(r)}>Cancel schedule</Button>:null}</SectionCard>)}</div>
  {cancel?<div className="fixed inset-0 z-[160] flex items-center justify-center bg-[#0b5ea2]/60 p-4"><section role="alertdialog" aria-modal="true" aria-labelledby="cancel-schedule-title" className="w-full max-w-md rounded-xl bg-white p-6 text-[#0b5ea2]"><h2 id="cancel-schedule-title" className="font-bold">Cancel this schedule?</h2><p className="my-4">{cancel.title} — {pickupDateLabel(cancel.pickupDate)}</p><div className="flex justify-end gap-2"><button type="button" autoFocus disabled={busy!==null} onClick={()=>setCancel(null)} className="min-h-11 rounded-xl border px-4">Keep schedule</button><Button disabled={busy!==null} onClick={()=>void confirmCancel()}>{busy!==null?'Cancelling…':'Confirm cancellation'}</Button></div></section></div>:null}
 </section>
}
