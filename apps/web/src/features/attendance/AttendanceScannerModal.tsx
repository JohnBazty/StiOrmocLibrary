import { SelectedFilePreview } from '../../components/SelectedFilePreview'
import { Camera, CheckCircle2, Clock3, QrCode, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Html5Qrcode as Html5QrcodeInstance } from 'html5-qrcode'
import { Button } from '../../components/ui'
import { attendanceApi, type AttendanceConfirmationRequest } from './attendance-api'
import { notifyAttendanceUpdated } from './attendance-updates'

const readerId='smartlib-attendance-qr-reader'
const message=(reason:unknown)=>reason instanceof Error?reason.message:'Attendance could not be checked. Try again.'

export function AttendanceScannerModal({open,onClose,onRecorded}:{open:boolean;onClose:()=>void;onRecorded?:()=>void}){
  const scanner=useRef<Html5QrcodeInstance|null>(null),handling=useRef(false),saving=useRef(false)
  const openRef=useRef(open),generation=useRef(0)
  openRef.current=open
  const requestKey=useRef({payload:'',id:''}),recorded=useRef(''),mounted=useRef(false),callback=useRef(onRecorded)
  callback.current=onRecorded
  const [imageFile,setImageFile]=useState<File|null>(null),[scanning,setScanning]=useState(false)
  const [typed,setTyped]=useState(''),[scan,setScan]=useState<AttendanceConfirmationRequest|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const stop=useCallback(async()=>{const instance=scanner.current;if(!instance)return;try{if(instance.isScanning)await instance.stop();await instance.clear()}catch{/* The camera may already have been released. */}finally{scanner.current=null;if(mounted.current)setScanning(false)}},[])
  const reset=useCallback(async()=>{generation.current++;await stop();handling.current=false;requestKey.current={payload:'',id:''};setImageFile(null);setTyped('');setScan(null);setError('');setBusy(false)},[stop])
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;void stop()}},[stop])
  useEffect(()=>{if(!open)void reset();return()=>{void stop()}},[open,reset,stop])
  function apply(next:AttendanceConfirmationRequest){
    setScan(next)
    if(next.state==='Confirmed'&&recorded.current!==next.confirmationId){recorded.current=next.confirmationId;callback.current?.();notifyAttendanceUpdated()}
  }
  const resolve=async(value:string)=>{
    const payload=value.trim()
    if(!payload||handling.current||saving.current)return
    const version=generation.current
    handling.current=true;setBusy(true);setError('')
    if(requestKey.current.payload!==payload)requestKey.current={payload,id:crypto.randomUUID()}
    try{await stop();const next=await attendanceApi.sendConfirmation(payload,requestKey.current.id);if(mounted.current&&openRef.current&&version===generation.current)apply(next)}
    catch(reason){if(mounted.current)setError(message(reason));handling.current=false}
    finally{if(mounted.current)setBusy(false)}
  }
  useEffect(()=>{
    if(!open||scan?.state!=='Pending')return
    let active=true,running=false
    const refresh=async()=>{
      if(!active||running||saving.current||document.hidden)return
      running=true
      try{const next=await attendanceApi.scanConfirmation(scan.confirmationId);if(active){apply(next);setError('')}}
      catch(reason){if(active)setError(message(reason))}
      finally{running=false}
    }
    const timer=setInterval(()=>void refresh(),2000)
    const returned=()=>void refresh()
    window.addEventListener('focus',returned);document.addEventListener('visibilitychange',returned)
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',returned);document.removeEventListener('visibilitychange',returned)}
  },[open,scan?.confirmationId,scan?.state])
  const start=async()=>{await reset();try{const{Html5Qrcode,Html5QrcodeSupportedFormats}=await import('html5-qrcode');const cameras=await Html5Qrcode.getCameras();if(!openRef.current||!mounted.current)return;if(!cameras.length)throw new Error('No camera was found. Use a USB scanner or a saved QR image.');const instance=new Html5Qrcode(readerId,{formatsToSupport:[Html5QrcodeSupportedFormats.QR_CODE],verbose:false});scanner.current=instance;setScanning(true);const preferred=cameras.find(camera=>/back|rear|environment/i.test(camera.label))??cameras[0];await instance.start(preferred.id,{fps:10,qrbox:{width:240,height:240}},decoded=>void resolve(decoded),()=>undefined);if(!openRef.current)await stop()}catch(reason){await stop();if(mounted.current)setError(message(reason))}}
  const readImage=async()=>{if(!imageFile||busy)return;setBusy(true);setError('');try{const{Html5Qrcode,Html5QrcodeSupportedFormats}=await import('html5-qrcode');const instance=new Html5Qrcode(readerId,{formatsToSupport:[Html5QrcodeSupportedFormats.QR_CODE],verbose:false});scanner.current=instance;const decoded=await instance.scanFile(imageFile,true);await resolve(decoded)}catch(reason){setError(message(reason));handling.current=false}finally{setBusy(false);await stop()}}
  async function cancel(){if(!scan||saving.current)return;saving.current=true;setBusy(true);setError('');try{apply(await attendanceApi.cancelScanConfirmation(scan.confirmationId))}catch(reason){setError(message(reason))}finally{saving.current=false;setBusy(false)}}
  if(!open)return null
  const done=scan?.state==='Confirmed'
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="attendance-scanner-heading"><div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-3xl border border-[#0b5ea2]/15 bg-white text-[#0b5ea2] shadow-2xl dark:border-white/15 dark:bg-[#20212b] dark:text-white">
    <header className="flex items-center justify-between gap-4 border-b border-[#0b5ea2]/15 p-5 dark:border-white/15"><div><p className="text-xs font-semibold opacity-60">Library entrance</p><h2 id="attendance-scanner-heading" className="mt-1 text-balance text-xl font-bold">Scan attendance QR</h2></div><button type="button" onClick={onClose} disabled={busy} aria-label="Close attendance scanner" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl hover:bg-[#0b5ea2]/5 dark:hover:bg-white/10"><X/></button></header>
    <div className="space-y-4 p-5 sm:p-6">
      <p className="text-pretty text-sm leading-6 opacity-75">Scan the visitor’s QR. They choose their purpose and confirm entry or exit on their own signed-in account.</p>
      {scan?<section aria-live="polite" className="space-y-4 rounded-2xl border border-[#0b5ea2]/15 p-4 dark:border-white/15"><div className="flex items-start gap-3">{done?<CheckCircle2 size={24}/>:scan.state==='Pending'?<Clock3 size={24}/>:<QrCode size={24}/>}<div><h3 className="font-bold">{scan.visitor.name}</h3><p className="text-sm opacity-70">{scan.visitor.schoolId} · {scan.visitor.role}</p></div></div>
        <h3 className="text-lg font-bold">{done?scan.result?.message:scan.state==='Pending'?scan.action==='Exit'?'Waiting for user to confirm exit':'Waiting for user to choose a purpose':scan.state==='Expired'?'Scan expired':scan.state==='Cancelled'?'Request cancelled':'Scan again'}</h3>
        {scan.state==='Pending'?<><p className="text-sm leading-6 opacity-75">Ask the visitor to open their library account. The confirmation appears automatically. Attendance is recorded after they confirm.</p><p className="text-xs opacity-60">Expires at {new Date(scan.expiresAt).toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit'})}</p></>:null}
        {done?<p className="text-sm tabular-nums">Occupied seats: {scan.occupancy.current} / {scan.occupancy.capacity}</p>:null}
        <div className="flex flex-wrap gap-2">{scan.state==='Pending'?<Button variant="secondary" disabled={busy} onClick={()=>void cancel()}>Cancel request</Button>:null}<Button disabled={busy} onClick={()=>void reset()}>Scan another visitor</Button></div>
      </section>:<>
        <div id={readerId} className="min-h-16 overflow-hidden rounded-2xl border border-[#0b5ea2]/15 bg-[#0b5ea2]/5"/>
        <form onSubmit={event=>{event.preventDefault();void resolve(typed)}} className="space-y-2"><label className="block text-sm font-semibold" htmlFor="attendance-qr-input">Visitor QR</label><input id="attendance-qr-input" autoComplete="off" autoCapitalize="none" spellCheck={false} value={typed} disabled={busy||scanning} onChange={event=>setTyped(event.target.value)} onPaste={event=>{const text=event.clipboardData.getData('text').trim();if(!text)return;event.preventDefault();setTyped(text);void resolve(text)}} placeholder="Scan with USB reader or paste QR" className="min-h-11 w-full rounded-xl border border-[#0b5ea2]/20 bg-white p-3 text-[#0b5ea2]"/><Button type="submit" disabled={busy||scanning||!typed.trim()}>{busy?'Sending…':'Send to visitor'}</Button></form>
        <div className="grid gap-2 sm:grid-cols-2"><Button onClick={()=>void start()} disabled={scanning||busy}><Camera size={16}/>{scanning?'Camera active':'Start camera'}</Button><label className="relative inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#0b5ea2]/20 px-4 text-sm font-semibold dark:border-white/20"><Upload size={16}/>Choose saved image<input aria-label="Saved QR image" disabled={busy} type="file" accept="image/*" className="sr-only" onChange={event=>{setImageFile(event.target.files?.[0]??null);setError('');event.target.value=''}}/></label></div>
        <SelectedFilePreview file={imageFile} disabled={busy} onRemove={()=>{setImageFile(null);setError('')}}/>
        {imageFile?<Button disabled={busy} onClick={()=>void readImage()}>{busy?'Reading image…':'Read QR from image'}</Button>:null}
      </>}
      {error?<div role="alert" className="auth-error rounded-xl p-3 text-sm">{error}</div>:null}
    </div>
  </div></div>
}
