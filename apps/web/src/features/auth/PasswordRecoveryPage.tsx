import {useEffect,useState,type FormEvent} from 'react'
import {Link,useSearchParams} from 'react-router-dom'
import {AuthMessage} from './AuthMessage'
import {requestPasswordResetLink} from './auth-api'
const field='mt-2 min-h-12 w-full rounded-xl border border-[#0b5ea2]/20 bg-white px-4 text-[#0b5ea2] focus:outline-none focus:ring-4 focus:ring-[#0b5ea2]/15'
export function PasswordRecoveryPage(){
 const [params]=useSearchParams(),staff=params.get('portal')==='staff'
 const [identifier,setIdentifier]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[retryAt,setRetryAt]=useState(0),[waiting,setWaiting]=useState(false)
 useEffect(()=>{if(!retryAt)return;setWaiting(true);const timer=window.setTimeout(()=>setWaiting(false),Math.max(0,retryAt-Date.now()));return()=>window.clearTimeout(timer)},[retryAt])
 async function submit(event:FormEvent){event.preventDefault();if(busy||waiting)return;setBusy(true);setError('')
  try{const result=await requestPasswordResetLink(identifier.trim());setMessage(result.message);setRetryAt(Date.now()+60_000)}
  catch(cause){setError(cause instanceof Error?cause.message:'Password recovery is unavailable. Please try again.')}
  finally{setBusy(false)}
 }
 return <main className="flex min-h-screen items-center justify-center bg-[#0b5ea2] px-4 py-10"><section className="w-full max-w-md rounded-3xl bg-white p-7 text-[#0b5ea2] shadow-xl sm:p-9">
  <p className="text-xs font-black tracking-widest">STI COLLEGE ORMOC · SMART LIBRARY</p>
  <h1 className="mt-3 font-display text-3xl font-black">Forgot password</h1>
  <p className="mt-3 text-sm">For Students, Faculty, Staff and the library administrator. We send a secure link to the school email already saved on your account.</p>
  {error&&<AuthMessage>{error}</AuthMessage>}{message&&<AuthMessage error={false}>{message}</AuthMessage>}
  <form className="mt-6 space-y-5" onSubmit={submit}>
   <label className="block text-sm font-bold">School ID or registered school email<input required disabled={busy} autoComplete="username" className={field} maxLength={254} value={identifier} onChange={e=>setIdentifier(e.target.value)}/></label>
   <button disabled={busy||waiting} className="min-h-12 w-full rounded-xl bg-[#0b5ea2] px-4 font-bold text-white disabled:opacity-60">{busy?'Sending request…':waiting?'Wait one minute before requesting again':'Send reset link'}</button>
  </form>
  <p className="mt-4 text-sm">Open the email link to choose your new password. Your password stays unchanged until you save it there.</p>
  <Link to={staff?'/staff':'/login'} className="mt-6 inline-block min-h-11 text-sm font-bold underline">Return to Log In</Link>
 </section></main>
}
