import {useEffect,useState,type FormEvent} from 'react'
import {Link,useLocation,useNavigate} from 'react-router-dom'
import {ownershipApi,type OwnershipGrant,type SetupReview} from '../users/ownership-api'
import {clearAuthSession,setSessionIdentity} from './auth-storage'
import {AuthMessage} from './AuthMessage'
function readGrant(hash:string):OwnershipGrant|null{
 const p=new URLSearchParams(hash.replace(/^#/,'')),id=p.get('invitation')??'',token=p.get('token')??''
 return p.size===2&&p.getAll('invitation').length===1&&p.getAll('token').length===1&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)&&/^[a-f0-9]{64}$/.test(token)?{id,token}:null
}
const field='mt-2 min-h-12 w-full rounded-xl border border-[#0b5ea2]/20 bg-white px-4 text-[#0b5ea2] focus:outline-none focus:ring-4 focus:ring-[#0b5ea2]/15'
export function AdminPasswordSetupPage(){
 const location=useLocation(),navigate=useNavigate(),[grant,setGrant]=useState(()=>readGrant(location.hash))
 const [info,setInfo]=useState<SetupReview|null>(null),[name,setName]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[retry,setRetry]=useState(0)
 useEffect(()=>{if(!location.hash)return;const next=readGrant(location.hash);setGrant(previous=>previous?.id===next?.id&&previous?.token===next?.token?previous:next);setPassword('');setConfirmation('');setName('');setError('');setMessage('');navigate(location.pathname+location.search,{replace:true})},[location.hash,location.pathname,location.search,navigate])
 useEffect(()=>{
  if(!grant)return
  const controller=new AbortController();setInfo(null);setError('')
  ownershipApi.setupPreview(grant,controller.signal).then(result=>{if(!controller.signal.aborted)setInfo(result)}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'This invitation could not be checked. Please try again.')})
  return()=>controller.abort()
 },[grant,retry])
 async function submit(event:FormEvent){event.preventDefault();if(!grant||!info||busy)return;setError('')
  if(password.length<8||new TextEncoder().encode(password).length>72||password!==confirmation){setError('Use at least 8 characters, at most 72 bytes, and matching passwords.');return}
  setBusy(true)
  try{const result=await ownershipApi.complete(grant,password,confirmation,info.requiresName?name:undefined);clearAuthSession();setSessionIdentity(null);setGrant(null);setInfo(null);setPassword('');setConfirmation('');setName('');setMessage(result.message)}
  catch(cause){setError(cause instanceof Error?cause.message:'Administrator setup could not be completed. Please try again.')}
  finally{setBusy(false)}
 }
 return <main className="flex min-h-screen items-center justify-center bg-[#0b5ea2] px-4 py-10"><section className="w-full max-w-lg rounded-3xl bg-white p-7 text-[#0b5ea2] shadow-xl sm:p-9">
  <p className="text-xs font-black tracking-widest">STI COLLEGE ORMOC · SMART LIBRARY</p><h1 className="mt-3 font-display text-3xl font-black">Create administrator password</h1>
  {error&&<AuthMessage>{error}</AuthMessage>}{message&&<AuthMessage error={false}>{message}</AuthMessage>}
  {!message&&(!grant?<AuthMessage>This invitation is invalid or incomplete. Open the latest link from your Outlook inbox, or ask the current administrator to resend it.</AuthMessage>:!info?<><p role="status" className="mt-4 text-sm">{error?'Invitation not ready.':'Checking your invitation…'}</p>{error&&<button className="mt-3 min-h-11 font-bold underline" onClick={()=>setRetry(v=>v+1)}>Check invitation again</button>}</>:<>
   <section className="mt-4 space-y-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-950"><p className="break-all font-bold">{info.email}</p><p>Accepting makes you the library administrator. The previous administrator loses admin and Staff access.</p>{info.previousRole&&<p>Your existing {info.previousRole} account becomes the administrator account. Its name and previous transactions are preserved.</p>}</section>
   <form className="mt-5 space-y-4" onSubmit={submit}>
    {info.requiresName?<label className="block text-sm font-bold">Your name<input required maxLength={150} autoComplete="name" disabled={busy} className={field} value={name} onChange={e=>setName(e.target.value)}/></label>:<p className="text-sm">Account name: {info.name??'School-provided account'}</p>}
    <label className="block text-sm font-bold">New administrator password<input required type="password" minLength={8} maxLength={72} autoComplete="new-password" disabled={busy} className={field} value={password} onChange={e=>setPassword(e.target.value)}/></label>
    <label className="block text-sm font-bold">Confirm new password<input required type="password" minLength={8} maxLength={72} autoComplete="new-password" disabled={busy} className={field} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
    <button disabled={busy} className="min-h-12 w-full rounded-xl bg-[#0b5ea2] px-4 py-3 font-bold text-white disabled:opacity-60">{busy?'Completing handover…':'Create password and accept ownership'}</button>
   </form>
  </>)}
  <div className="mt-6 flex flex-wrap gap-x-5 text-sm font-bold underline"><Link className="min-h-11" to="/staff">Admin / Staff login</Link><Link className="min-h-11" to="/forgot-password?portal=staff">Forgot password</Link></div>
 </section></main>
}
