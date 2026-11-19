import {useCallback,useEffect,useRef,useState} from 'react'
import {Button} from '../../components/ui'
import {DeskScanInput} from './DeskScanInput'
import {CirculationDesk} from './CirculationDesk'
import {CirculationReturnDialog} from './CirculationReturnDialog'
import {deskCirculationApi,type QuickBorrower,type BorrowerLoan,type PickupSelection} from './desk-circulation-api'

export function CirculationQuickAction({onClose}:{onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),running=useRef(false),alive=useRef(true),generation=useRef(0),activity=useRef(Date.now())
 const identity=useRef(''),modeRef=useRef<'Borrow'|'Return'>('Borrow')
 const [identityType,setIdentityType]=useState<'QR'|'SchoolID'>('QR')
 const [value,setValue]=useState(''),[mode,setMode]=useState<'Borrow'|'Return'>('Borrow'),[data,setData]=useState<QuickBorrower|null>(null)
 const [busy,setBusy]=useState(false),[deskBusy,setDeskBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [selection,setSelection]=useState<(PickupSelection&{key:number})|null>(null),[manual,setManual]=useState<{payload:string;key:number}|null>(null),[returning,setReturning]=useState<BorrowerLoan|null>(null)
 const liveBusy=useRef(false);liveBusy.current=deskBusy||Boolean(returning)
 const reportBusy=useCallback((next:boolean)=>setDeskBusy(next),[])
 function clear(){generation.current++;identity.current='';setData(null);setSelection(null);setManual(null);setReturning(null);setValue('');setError('');modeRef.current='Borrow';setMode('Borrow')}
 useEffect(()=>{alive.current=true;dialog.current?.showModal();const timer=window.setInterval(()=>{if(!running.current&&!liveBusy.current&&Date.now()-activity.current>=5*60_000){clear();setNotice('Scan the user again after five minutes of inactivity.')}},15_000);return()=>{alive.current=false;generation.current++;window.clearInterval(timer)}},[])
 async function lookup(qr:string,nextMode:'Borrow'|'Return',page=1){
  if(running.current||!qr.trim())return
  running.current=true;setBusy(true);setError('');const current=++generation.current
  setSelection(null);setManual(null);setReturning(null);setData(null)
  try{
   const result=await (identityType==='SchoolID'?deskCirculationApi.quickManualBorrower(qr.trim(),nextMode,page):deskCirculationApi.quickBorrower(qr.trim(),nextMode,page))
   if(!alive.current||current!==generation.current)return
   identity.current=qr.trim();modeRef.current=nextMode;setMode(nextMode);setData(result);setValue('');activity.current=Date.now()
   setNotice(nextMode==='Return'?`Active loans for ${result.borrower.user.name}`:`Requested books for ${result.borrower.user.name}. ${identityType==='SchoolID'?'Choose Return to see active loans.':'Scan the same user QR again to see active loans.'}`)
   if(nextMode==='Borrow'){
    const eligible=result.borrower.requests?.filter(r=>r.barcode&&['Ready for pickup','Awaiting handover'].includes(r.statusLabel))??[]
    if(eligible.length===1)setSelection({reservationId:eligible[0].reservationId,key:Date.now()})
   }
  }catch(cause){if(alive.current&&current===generation.current){identity.current='';setError(cause instanceof Error?cause.message:'The user could not be checked. Scan again.')}}
  finally{running.current=false;if(alive.current)setBusy(false)}
 }
 function scan(qr:string){if(deskBusy||returning)return;const repeated=identity.current&&identity.current===qr.trim();void lookup(qr,identityType==='SchoolID'?modeRef.current:repeated?'Return':modeRef.current==='Return'&&!identity.current?'Return':'Borrow')}
 function changeMode(next:'Borrow'|'Return'){setSelection(null);setManual(null);setReturning(null);activity.current=Date.now();if(value.trim()||identity.current)void lookup(value.trim()||identity.current,next);else{modeRef.current=next;setMode(next)}}
 function changed(){setDeskBusy(false);if(identity.current)void lookup(identity.current,modeRef.current,data?.loans.page??1);window.dispatchEvent(new Event('smartlib:circulation-updated'))}
 const disabled=busy||deskBusy||Boolean(returning)
 const requests=data?.borrower.requests??[]
 return <dialog ref={dialog} aria-label="Borrow and return shortcut" onCancel={e=>{e.preventDefault();if(!disabled)onClose()}} className="m-auto max-h-[94dvh] w-[calc(100%-1rem)] max-w-5xl overflow-y-auto rounded-2xl bg-white p-4 text-slate-950 backdrop:bg-black/60 dark:bg-[#20212b] dark:text-white sm:p-6">
  <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Borrow / Return</h2><Button variant="secondary" disabled={disabled} onClick={onClose}>Close shortcut</Button></div>
  <div className="mb-4 flex flex-wrap gap-2"><Button disabled={disabled} variant={mode==='Borrow'?'primary':'secondary'} onClick={()=>changeMode('Borrow')}>Borrow</Button><Button disabled={disabled} variant={mode==='Return'?'primary':'secondary'} onClick={()=>changeMode('Return')}>Return</Button><Button disabled={disabled} variant="ghost" onClick={()=>{clear();activity.current=Date.now();setNotice('Ready for the next borrower.')}}>Next borrower</Button></div>
  <p className="mb-4 text-sm">{identityType==='QR'?'First scan: requested books. Scan the same user again: active loans.':'Enter the School ID, then choose Borrow for requested books or Return for active loans.'} Choose the actual copy and review before confirming.</p>
  <div role="group" aria-label="Borrower identification" className="mb-4 flex flex-wrap gap-2">{(['QR','SchoolID'] as const).map(type=><Button key={type} disabled={disabled} aria-pressed={identityType===type} variant={identityType===type?'primary':'secondary'} onClick={()=>{if(type!==identityType){clear();setNotice('');setIdentityType(type)}}}>{type==='QR'?'Scan QR':'Enter School ID manually'}</Button>)}</div>
  {identityType==='QR'?<DeskScanInput label="User QR" value={value} onChange={next=>{setValue(next);setSelection(null);setManual(null);setData(null);setNotice('');activity.current=Date.now()}} onScan={scan} disabled={disabled} qr autoSubmit showCaptureOptions/>:<form onSubmit={e=>{e.preventDefault();void lookup(value,modeRef.current)}} className="space-y-3"><label className="block text-sm font-semibold">School ID<input className="mt-2 block w-full rounded-xl border border-slate-400 bg-transparent p-3" value={value} disabled={disabled} autoComplete="off" maxLength={50} onChange={e=>{setValue(e.target.value);identity.current='';setData(null);setSelection(null);setManual(null);setNotice('');activity.current=Date.now()}}/></label><p className="text-sm">Check the student's School ID and name before lending or returning a book.</p><Button type="submit" disabled={disabled||!value.trim()}>Find borrower</Button></form>}

  {notice&&<p role="status" className="my-4 text-sm">{notice}</p>}{error&&<p role="alert" className="auth-error my-4 rounded-xl p-3 text-sm">{error}</p>}
  {data&&<><section className="my-4 rounded-xl border border-current/20 p-4"><p className="font-bold">{data.borrower.user.name}</p><p className="text-sm">{data.borrower.user.schoolId} · {data.borrower.user.role}</p></section>
   {mode==='Borrow'?<section aria-label="Requested books" className="space-y-3"><h3 className="font-bold">Requested books</h3>
    {!requests.length&&<p>No books requested. Scan a physical book through manual lending below.</p>}
    {requests.map(r=><article key={r.reservationId} className="rounded-xl border border-current/20 p-3"><p className="font-semibold">{r.title}</p><p className="text-sm">{r.statusLabel} · {r.barcode??'Waiting for a copy'}</p>{r.shelfLocation&&<p className="text-sm">{r.shelfLocation}</p>}{r.pickupDeadline&&<p className="text-sm">Collect by {new Date(r.pickupDeadline).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</p>}<Button variant="secondary" disabled={disabled||!r.barcode||!['Ready for pickup','Awaiting handover'].includes(r.statusLabel)} onClick={()=>{setManual(null);setSelection({reservationId:r.reservationId,key:Date.now()});activity.current=Date.now()}}>Review this book</Button></article>)}
    <Button variant="secondary" disabled={disabled} onClick={()=>{setSelection(null);setManual({payload:identity.current,key:Date.now()});activity.current=Date.now()}}>Lend another physical book</Button>
   </section>:<section aria-label="Active loans" className="space-y-3"><h3 className="font-bold">Active loans</h3>
    {!data.loans.rows.length&&<p>No active loans on this page.</p>}
    {data.loans.rows.map(loan=><article key={loan.id} className="rounded-xl border border-current/20 p-3"><p className="font-semibold">{loan.title}</p><p className="break-all text-sm">{loan.barcode??'Copy label unavailable'} · {loan.status}</p><p className="text-sm">Borrowed {new Date(loan.borrowedAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</p><p className="text-sm">Due {new Date(loan.dueAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</p><Button variant="secondary" disabled={disabled||!loan.barcode} onClick={()=>{setReturning(loan);activity.current=Date.now()}}>Return this copy</Button></article>)}
    <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={disabled||data.loans.page===1} onClick={()=>void lookup(identity.current,'Return',data.loans.page-1)}>Previous loans</Button><span>Page {data.loans.page}</span><Button variant="secondary" disabled={disabled||!data.loans.more} onClick={()=>void lookup(identity.current,'Return',data.loans.page+1)}>Next loans</Button></div>
   </section>}
  </>}
  {(selection||manual)&&mode==='Borrow'&&<div className="mt-5"><CirculationDesk key={selection?.key??manual?.key} borrowerRequest={selection??undefined} borrowerQrRequest={identityType==='QR'?manual??undefined:undefined} schoolIdRequest={identityType==='SchoolID'&&manual?{schoolId:manual.payload,key:manual.key}:undefined} automaticScanning={false} dashboard onChanged={changed} onBusyChange={reportBusy} portalRoot={dialog.current??undefined}/></div>}
  {returning?.barcode&&<CirculationReturnDialog key={returning.id} barcode={returning.barcode} expectedLoan={{id:returning.id,kind:returning.kind}} portalRoot={dialog.current??undefined} onClose={()=>setReturning(null)} onReturned={message=>{setReturning(null);setNotice(message);const qr=identity.current;window.setTimeout(()=>void lookup(qr,'Return',data?.loans.page??1),0);window.dispatchEvent(new Event('smartlib:circulation-updated'))}}/>}
 </dialog>
}
