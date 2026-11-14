import { CheckCircle2, LogIn, LogOut, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, cn } from '../../components/ui'
import { attendanceApi, type AttendanceConfirmationRequest } from './attendance-api'
import { ATTENDANCE_UPDATED, notifyAttendanceUpdated } from './attendance-updates'

const purposes=['Library Visit','Study','Research','Book Borrowing','Printing','Photocopy']
const message=(reason:unknown)=>reason instanceof Error?reason.message:'Attendance could not be updated. Try again.'

/** Mounted once in the signed-in portal; the API supplies only this account's scan. */
export function AttendanceConfirmationPrompt(){
  const [request,setRequest]=useState<AttendanceConfirmationRequest|null>(null)
  const [purpose,setPurpose]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[now,setNow]=useState(Date.now())
  const active=useRef(false),flight=useRef(false),saving=useRef(false),current=useRef<AttendanceConfirmationRequest|null>(null)
  const generation=useRef(0)
  const actionError=useRef(false)
  const dialog=useRef<HTMLDialogElement>(null)
  const apply=useCallback((next:AttendanceConfirmationRequest|null)=>{
    if(saving.current)return
    const previous=current.current
    if(next?.confirmationId!==previous?.confirmationId){setPurpose('');setError('');actionError.current=false}
    current.current=next;setRequest(next)
  },[])
  const refresh=useCallback(async()=>{
    if(!active.current||document.hidden||flight.current||saving.current||current.current?.state==='Confirmed')return
    flight.current=true
    const version=generation.current
    try{
      const result=await attendanceApi.pendingConfirmation()
      if(active.current&&!saving.current&&version===generation.current){apply(result.request);if(!actionError.current)setError('')}
    }catch(reason){if(active.current&&current.current&&!actionError.current)setError(message(reason))}
    finally{flight.current=false}
  },[apply])
  useEffect(()=>{
    active.current=true;void refresh()
    const tick=()=>{setNow(Date.now());void refresh()}
    const storage=(event:StorageEvent)=>{if(event.key===ATTENDANCE_UPDATED)void refresh()}
    const timer=window.setInterval(tick,3000)
    window.addEventListener('focus',tick);window.addEventListener('storage',storage);document.addEventListener('visibilitychange',tick)
    return()=>{active.current=false;clearInterval(timer);window.removeEventListener('focus',tick);window.removeEventListener('storage',storage);document.removeEventListener('visibilitychange',tick)}
  },[refresh])
  useEffect(()=>{
    if(!request)return
    const element=dialog.current
    if(element&&!element.open){if(element.showModal)element.showModal();else element.setAttribute('open','')}
  },[request?.confirmationId])
  useEffect(()=>{if(dialog.current)dialog.current.scrollTop=0},[request?.confirmationId,request?.state])
  const expired=Boolean(request&&request.state==='Pending'&&new Date(request.expiresAt).getTime()<=now)
  const entry=request?.action==='Entry'
  async function action(cancel=false){
    if(!request||saving.current)return
    generation.current++
    saving.current=true;setBusy(true);setError('');actionError.current=false
    try{
      const next=await(cancel?attendanceApi.cancelAttendance(request.confirmationId):attendanceApi.confirmAttendance(request.confirmationId,entry?purpose:''))
      if(!active.current)return
      current.current=next;setRequest(next)
      if(next.state==='Confirmed')notifyAttendanceUpdated()
      else{current.current=null;setRequest(null);setPurpose('')}
    }catch(reason){if(active.current){actionError.current=true;setError(message(reason))}}
    finally{saving.current=false;if(active.current)setBusy(false)}
  }
  function dismiss(){if(busy)return;generation.current++;current.current=null;setRequest(null);setPurpose('');setError('');void refresh()}
  if(!request)return null
  const done=request.state==='Confirmed'
  const state=request.occupancy
  const restricted=entry&&(!state.entryOpen||(purpose==='Book Borrowing'?!state.allowBorrowing:['Printing','Photocopy'].includes(purpose)?!state.allowPrinting:!state.allowWalkIns))
  const seatNeeded=!state.policy.servicePurposes.includes(purpose)
  const full=entry&&seatNeeded&&state.available<=0
  return <dialog ref={dialog} aria-labelledby="attendance-user-heading" aria-describedby="attendance-user-help" onCancel={event=>{event.preventDefault();if(done||expired)dismiss();else void action(true)}} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border border-[#0b5ea2]/15 bg-white p-0 text-[#0b5ea2] shadow-2xl backdrop:bg-black/50 dark:border-white/15 dark:bg-[#20212b] dark:text-white">
    <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[#0b5ea2]/10 bg-white p-5 dark:border-white/10 dark:bg-[#20212b]"><div><p className="text-xs font-semibold opacity-60">Library attendance</p><h2 id="attendance-user-heading" className="mt-1 text-balance text-xl font-bold">{done?entry?'You’re checked in':'You’re checked out':entry?'Welcome to the library':'Ready to leave?'}</h2></div>{done||expired?<button aria-label="Close attendance confirmation" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border" onClick={dismiss}><X size={20}/></button>:null}</header>
    <div className="space-y-5 p-5 sm:p-6">
      <p id="attendance-user-help" className="text-pretty text-sm leading-6 opacity-75">{done?'Your attendance and library occupancy have been updated.':expired?'This scan expired. Ask entrance staff to scan your QR again.':entry?'Your QR was scanned at the entrance. Choose why you’re visiting, then confirm entry.':'Your QR was scanned again. Confirm exit to end your current library visit.'}</p>
      <div className="flex items-center gap-3 rounded-2xl border border-[#0b5ea2]/15 p-4 dark:border-white/15">{done?<CheckCircle2 size={23}/>:entry?<LogIn size={23}/>:<LogOut size={23}/>}<div className="min-w-0"><p className="break-words font-bold">{request.visitor.name}</p><p className="mt-1 text-sm opacity-65">{request.visitor.schoolId} · {request.visitor.role}</p></div></div>
      {!done&&!expired&&entry?<fieldset disabled={busy}><legend className="mb-3 text-sm font-bold">What is the purpose of your visit?</legend><div className="grid grid-cols-2 gap-2">{purposes.map(value=><label key={value} className={cn('flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-semibold',purpose===value?'border-[#0b5ea2] bg-[#0b5ea2] text-white':'border-[#0b5ea2]/20 dark:border-white/20')}><input className="size-4 shrink-0" type="radio" name="attendance-visit-purpose" value={value} checked={purpose===value} onChange={()=>setPurpose(value)}/>{value==='Book Borrowing'?'Borrow books':value}</label>)}</div></fieldset>:null}
      <p className="text-sm opacity-70">Occupied seats: <strong className="tabular-nums">{state.current} / {state.capacity}</strong></p>
      {!done&&!expired&&(restricted||full)?<p role="status" className="rounded-xl border p-3 text-sm">{!state.entryOpen?'Entry is closed for the current operating hours or closing cutoff.':full?'All available library seats are occupied.':'This service is unavailable during the current scheduled event.'}</p>:null}
      {error?<p role="alert" className="auth-error rounded-xl p-3 text-sm">{error}</p>:null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{done||expired?<Button onClick={dismiss}>Done</Button>:<><Button variant="secondary" disabled={busy} onClick={()=>void action(true)}>Cancel</Button><Button disabled={busy||(entry&&!purpose)||expired||restricted||full} onClick={()=>void action()}>{busy?'Saving…':entry?'Confirm entry':'Confirm exit'}</Button></>}</div>
    </div>
  </dialog>
}
