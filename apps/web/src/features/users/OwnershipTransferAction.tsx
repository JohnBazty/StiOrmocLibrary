import {useEffect,useRef,useState,type FormEvent} from 'react'
import {useNavigate} from 'react-router-dom'
import {Button} from '../../components/ui'
import {clearAuthSession,setSessionIdentity} from '../auth/auth-storage'
import {ownershipApi,OwnershipError,type OwnershipState,type RecipientReview} from './ownership-api'

const field='mt-2 block min-h-11 w-full rounded-xl border border-current/25 bg-transparent px-3 py-2'
const errorText=(error:unknown)=>error instanceof Error?error.message:'Ownership settings are unavailable. Please try again.'
export function OwnershipTransferAction(){
 const [open,setOpen]=useState(false)
 return <><Button variant="secondary" onClick={()=>setOpen(true)}>Transfer ownership</Button>{open&&<OwnershipDialog onClose={()=>setOpen(false)}/>}</>
}
function OwnershipDialog({onClose}:{onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),mounted=useRef(true),sequence=useRef(0),polling=useRef(false)
 const navigate=useNavigate()
 const [data,setData]=useState<OwnershipState|null>(null),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[review,setReview]=useState<RecipientReview|null>(null)
 const [busy,setBusy]=useState(false),[editing,setEditing]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 async function load(signal?:AbortSignal){
  const generation=++sequence.current
  try{const next=await ownershipApi.state(signal);if(mounted.current&&!signal?.aborted&&generation===sequence.current){setData(next);setError('')}}
  catch(cause){if(mounted.current&&!signal?.aborted&&generation===sequence.current){if(cause instanceof OwnershipError&&cause.status===401){clearAuthSession();setSessionIdentity(null);navigate('/staff',{replace:true});return}setError(errorText(cause))}}
 }
 useEffect(()=>{mounted.current=true;dialog.current?.showModal();const controller=new AbortController();void load(controller.signal);return()=>{mounted.current=false;controller.abort()}},[])
 useEffect(()=>{
  if(!data?.pending||data.pending.mailStatus!=='Pending'||busy)return
  let attempts=0
  const timer=window.setInterval(()=>{if(polling.current||document.visibilityState!=='visible'||attempts>=60)return;polling.current=true;attempts++;void load().finally(()=>{polling.current=false})},5000)
  return()=>window.clearInterval(timer)
 },[data?.pending?.id,data?.pending?.mailStatus,busy])
 function close(){dialog.current?.close();setPassword('');onClose()}
 async function preview(event:FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError('');setNotice('')
  try{const next=await ownershipApi.preview(email.trim());setReview(next);setEmail(next.email)}catch(cause){setError(errorText(cause))}finally{setBusy(false)}
 }
 async function invite(event:FormEvent){event.preventDefault();if(!review||busy)return;setBusy(true);setError('')
  try{const result=await ownershipApi.invite(review,password);setNotice(result.message);setReview(null);setEditing(false);await load()}catch(cause){await load();if(mounted.current){setError(errorText(cause));if(cause instanceof OwnershipError&&cause.status===409)setReview(null)}}finally{setPassword('');setBusy(false)}
 }
 async function cancel(){if(!data||busy)return;setBusy(true);setError('')
  try{const result=await ownershipApi.cancel(data.version);setNotice(result.message);setReview(null);setEditing(false);await load()}catch(cause){await load();if(mounted.current)setError(errorText(cause))}finally{setBusy(false)}
 }
 const pending=data?.pending
 return <dialog ref={dialog} aria-label="Transfer administrator ownership" onCancel={event=>{event.preventDefault();if(!busy)close()}}
  className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl bg-white p-6 text-slate-950 backdrop:bg-slate-950/60 dark:bg-slate-900 dark:text-white">
  <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-xl font-bold">Transfer administrator ownership</h2><Button variant="ghost" disabled={busy} onClick={close}>Close</Button></div>
  {error&&<p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-100">{error}</p>}
  {notice&&<p role="status" data-tone="success" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
  {!data?<><p role="status">Loading ownership…</p>{error&&<Button variant="secondary" onClick={()=>void load()}>Retry</Button>}</>:!data.canTransfer?<p>Only the current administrator owner can transfer ownership.</p>:<>
   <p className="mb-4 text-sm">Invite another person through their Ormoc Microsoft mailbox. You keep ownership until they create their password and accept.</p>
   {pending&&<section className="mb-5 space-y-3 rounded-xl border border-current/20 p-4" aria-label="Pending ownership invitation">
    <h3 className="font-bold">Invitation awaiting acceptance</h3><p className="break-all">{pending.email}</p>
    <p className="text-sm">Expires {new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Manila'}).format(new Date(pending.expiresAt))}</p>
    <p role="status" className="text-sm">{pending.mailStatus==='Pending'?'Sending invitation through the scheduled mail service…':pending.mailStatus==='Sent'?'Email accepted by the sender. Waiting for the recipient to finish setup.':'Email could not be completed. Cancel or replace this invitation.'}</p>
    <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={()=>void cancel()}>Cancel invitation</Button><Button variant="secondary" disabled={busy} onClick={()=>{setEditing(true);setEmail(pending.email);setReview(null);setPassword('')}}>Replace invitation</Button><Button variant="ghost" disabled={busy} onClick={()=>void load()}>Refresh status</Button></div>
   </section>}
   {(!pending||editing)&&(!review?<form className="space-y-4" onSubmit={preview}>
    <label className="block text-sm font-semibold">New administrator’s Ormoc Microsoft email<input autoFocus required type="email" maxLength={191} autoComplete="email" disabled={busy} className={field} value={email} onChange={e=>{setEmail(e.target.value);setReview(null);setPassword('');setError('')}}/></label>
    <Button type="submit" disabled={busy}>{busy?'Checking…':'Review recipient'}</Button>
   </form>:<form className="space-y-4" onSubmit={invite}>
    <section className="space-y-2 rounded-xl border border-amber-400/50 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
     <p className="break-all font-bold">{review.email}</p>
     <p>{review.createsAccount?'A new administrator account will be created after the recipient accepts.':`${review.name??'This account'} currently has ${review.targetRole} access. Acceptance changes it to administrator access and preserves its existing records.`}</p>
     <p>You will lose admin and Staff access only after the recipient finishes setup. Your transaction history will be preserved.</p>
     {pending&&<p>The earlier invitation will stop working.</p>}
    </section>
    <label className="block text-sm font-semibold">Your current administrator password<input required type="password" autoComplete="current-password" maxLength={72} disabled={busy} className={field} value={password} onChange={e=>setPassword(e.target.value)}/></label>
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy?'Queuing invitation…':'Send ownership invitation'}</Button><Button variant="secondary" disabled={busy} onClick={()=>{setReview(null);setPassword('')}}>Keep editing</Button></div>
   </form>)}
  </>}
 </dialog>
}
