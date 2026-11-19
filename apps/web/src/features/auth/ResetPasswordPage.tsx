import {useEffect,useState,type FormEvent} from 'react'
import {Link,useLocation,useNavigate} from 'react-router-dom'
import {AuthMessage} from './AuthMessage'
import {resetPassword} from './auth-api'
import {clearAuthSession,setSessionIdentity} from './auth-storage'

function readGrant(hash:string){
 const params=new URLSearchParams(hash.replace(/^#/,'')),id=params.get('challenge')??'',token=params.get('token')??''
 if(params.size!==2||params.getAll('challenge').length!==1||params.getAll('token').length!==1||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)||!/^[a-f0-9]{64}$/.test(token))return null
 return {id,token}
}
const field='mt-2 min-h-12 w-full rounded-xl border border-[#0b5ea2]/20 bg-white px-4 text-[#0b5ea2] focus:outline-none focus:ring-4 focus:ring-[#0b5ea2]/15'
export function ResetPasswordPage(){
 const location=useLocation(),navigate=useNavigate()
 const [grant,setGrant]=useState(()=>readGrant(location.hash))
 const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 useEffect(()=>{if(!location.hash)return;setGrant(readGrant(location.hash));setPassword('');setConfirmation('');setError('');setMessage('');navigate(location.pathname+location.search,{replace:true})},[location.hash,location.pathname,location.search,navigate])
 async function submit(event:FormEvent){event.preventDefault();if(!grant||busy)return;setError('')
  if(password.length<8||new TextEncoder().encode(password).length>72||password!==confirmation){setError('Use at least 8 characters, at most 72 bytes, and matching passwords.');return}
  setBusy(true)
  try{const result=await resetPassword(grant.id,grant.token,password,confirmation);clearAuthSession();setSessionIdentity(null);setGrant(null);setPassword('');setConfirmation('');setMessage(result.message)}
  catch(cause){setError(cause instanceof Error?cause.message:'Your password could not be changed. Please try again.')}
  finally{setBusy(false)}
 }
 return <main className="flex min-h-screen items-center justify-center bg-[#0b5ea2] px-4 py-10"><section className="w-full max-w-md rounded-3xl bg-white p-7 text-[#0b5ea2] shadow-xl sm:p-9">
  <p className="text-xs font-black tracking-widest">STI COLLEGE ORMOC · SMART LIBRARY</p>
  <h1 className="mt-3 font-display text-3xl font-black">Create new password</h1>
  {message?<AuthMessage error={false}>{message}</AuthMessage>:!grant?<AuthMessage>This reset link is invalid or incomplete. Request a new link below.</AuthMessage>:<>
   <p className="mt-3 text-sm">Choose a new password for your library account. Saving signs out your other sessions.</p>
   {error&&<AuthMessage>{error}</AuthMessage>}
   <form className="mt-6 space-y-5" onSubmit={submit}>
    <label className="block text-sm font-bold">New password<input type="password" required minLength={8} maxLength={72} autoComplete="new-password" disabled={busy} className={field} value={password} onChange={e=>setPassword(e.target.value)}/></label>
    <label className="block text-sm font-bold">Confirm new password<input type="password" required minLength={8} maxLength={72} autoComplete="new-password" disabled={busy} className={field} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
    <button disabled={busy} className="min-h-12 w-full rounded-xl bg-[#0b5ea2] px-4 font-bold text-white disabled:opacity-60">{busy?'Saving…':'Save new password'}</button>
   </form>
  </>}
  <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold underline"><Link className="min-h-11" to="/forgot-password">Request a new reset link</Link><Link className="min-h-11" to="/login">User login</Link><Link className="min-h-11" to="/staff">Admin / Staff login</Link></div>
 </section></main>
}
