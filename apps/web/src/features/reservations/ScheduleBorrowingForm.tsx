import { useEffect,useRef,useState } from 'react'
import { useConfirmSave } from '../../components/ConfirmSaveDialog'
import { borrowingScheduleApi,pickupDateLabel } from './borrowing-schedule-api'

export function ScheduleBorrowingForm({titleId,title,role,onClose}:{titleId:number;title:string;role:string;onClose:()=>void}) {
 const [dates,setDates]=useState<string[]>([]),[date,setDate]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false)
 const {ask,dialog}=useConfirmSave(),key=useRef({date:'',value:''}),submitting=useRef(false)
 useEffect(()=>{
  let mounted=true,running=false
  async function refresh(){if(running)return;running=true;try{const result=await borrowingScheduleApi.dates();if(mounted){setDates(result.dates);setError(result.available?'':'Scheduled borrowing is not available yet.')}}catch(e){if(mounted)setError(e instanceof Error?e.message:'Pickup dates could not be loaded.')}finally{running=false;if(mounted)setLoading(false)}}
  void refresh();const timer=setInterval(()=>void refresh(),30000)
  return()=>{mounted=false;clearInterval(timer)}
 },[titleId])
 async function save(){
  if(submitting.current)return
  submitting.current=true;setBusy(true);setError('')
  if(key.current.date!==date)key.current={date,value:crypto.randomUUID()}
  try{await borrowingScheduleApi.create({titleId,pickupDate:date,clientRequestId:key.current.value});setSaved(true);window.dispatchEvent(new Event('smartlib:circulation-updated'))}
  catch(e){setError(e instanceof Error?e.message:'The schedule could not be saved.')}
  finally{submitting.current=false;setBusy(false)}
 }
 return <section aria-label="Schedule borrowing" className="mt-5 rounded-xl border border-[#0b5ea2]/20 p-4 text-[#0b5ea2]">
  <h3 className="font-bold">Schedule borrowing</h3>
  <p className="mt-2 text-sm">We’ll try to prepare a copy for this date. Wait for a ready-for-pickup notification before visiting.</p>
  <p className="mt-2 text-xs">Choose within the next seven days. You may have two pending schedules, separate from your borrowing limit. Existing reservations keep priority.</p>
  {error?<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>:null}
  {saved?<div role="status" data-tone="success" className="mt-3"><p>Schedule saved for {pickupDateLabel(date)}. No copy is held yet.</p><a className="mt-2 inline-block underline" href={`${role==='Faculty'?'/faculty':'/student'}/reservations`}>View requests & reservations</a></div>:loading?<p role="status" className="mt-3 text-sm">Loading open pickup dates…</p>:dates.length?<form className="mt-4 space-y-3" onSubmit={e=>{e.preventDefault();if(date&&dates.includes(date)&&!busy)ask(`Schedule ${title} for ${pickupDateLabel(date)}. Availability is not guaranteed.`,()=>{void save()})}}>
   <label className="block text-sm font-semibold" htmlFor="scheduled-pickup-date">Preferred pickup date</label>
   <select id="scheduled-pickup-date" value={date} onChange={e=>setDate(e.target.value)} disabled={busy} required className="min-h-11 w-full rounded-xl border border-[#0b5ea2]/25 bg-white px-3">
    <option value="">Choose a date</option>{date&&!dates.includes(date)?<option value={date} disabled>{pickupDateLabel(date)} — no longer available</option>:null}{dates.map(d=><option key={d} value={d}>{pickupDateLabel(d)}</option>)}
   </select>
   <button disabled={busy||!dates.includes(date)} className="min-h-11 rounded-xl bg-[#0b5ea2] px-4 text-sm font-bold text-white disabled:opacity-50">{busy?'Saving…':'Review schedule'}</button>
  </form>:<p role="status" className="mt-3 text-sm">No open pickup dates are available in the next seven days.</p>}
  <button type="button" disabled={busy} onClick={onClose} className="mt-3 min-h-11 px-2 text-sm underline">{saved?'Close schedule':'Cancel'}</button>
  {dialog}
 </section>
}
