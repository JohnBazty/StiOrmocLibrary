import { useEffect, useState } from 'react'
import { Button, SectionCard } from '../../components/ui'
import { paymentRequest } from './payments-api'

type Setup={enabled:boolean;version:number}
const path='admin/payments/configuration/gcash'
export function GcashAvailabilitySetup(){
 const [saved,setSaved]=useState<Setup|null>(null),[enabled,setEnabled]=useState(false),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 async function load(){setError('');try{const value=await paymentRequest<Setup>(path);setSaved(value);setEnabled(value.enabled)}catch(e){setError(e instanceof Error?e.message:'Unable to load payment settings.')}}
 useEffect(()=>{void load()},[])
 async function save(){if(!saved)return;setBusy(true);setError('');setMessage('');try{const value=await paymentRequest<Setup>(path,{enabled,version:saved.version,reason});setSaved(value);setReason('');setMessage(enabled?'GCash payments are available.':'New GCash payments are paused. Existing payments can still be checked.')}catch(e){setError(e instanceof Error?e.message:'Unable to save payment settings.')}finally{setBusy(false)}}
 return <SectionCard className="max-w-2xl p-5 sm:p-6"><h2 className="text-lg font-bold">GCash availability</h2><p className="mt-2 text-sm opacity-75">Control new online payments. Existing checkout status, payment records and refunds remain available.</p>{error&&<p role="alert" className="mt-4 rounded-xl bg-red-700 p-3 text-sm text-white">{error}</p>}{message&&<p role="status" data-tone="success" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}{saved?<><label className="mt-5 flex min-h-11 items-center gap-3 font-semibold"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)} disabled={busy}/>Allow GCash payments</label><label className="mt-4 block text-sm font-semibold">Reason for this change<textarea className="mt-2 min-h-24 w-full rounded-xl border bg-transparent p-3" maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}/></label><p className="mt-2 text-sm opacity-75">{enabled?'New bills can be paid through GCash.':'Students can pay cash at the library. New GCash checkouts will be paused.'}</p><Button className="mt-5" disabled={busy||reason.trim().length<3||enabled===saved.enabled} onClick={()=>void save()}>{busy?'Saving…':'Save payment availability'}</Button></>:<Button className="mt-4" variant="secondary" onClick={()=>void load()}>Load payment settings</Button>}</SectionCard>
}
