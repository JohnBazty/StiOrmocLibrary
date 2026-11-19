import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { getCsrfToken } from '../auth/auth-storage'
import { paymentRequest } from './payments-api'
import { notifyPaymentUpdate } from './payment-updates'

type Proof={proof_id:string;external_reference:string;declared_amount:string;review_status:'Pending'|'Verified'|'Rejected';review_reason?:string;version:number;created_at:string}
export function PaymentProofPanel({paymentId,admin=false,onUpdated}:{paymentId:string;admin?:boolean;onUpdated?:()=>Promise<unknown>|void}){
 const path=`${admin?'admin':'user'}/payments`,[proofs,setProofs]=useState<Proof[]>([]),[loading,setLoading]=useState(true)
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[reference,setReference]=useState(''),[amount,setAmount]=useState(''),[reason,setReason]=useState('')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[image,setImage]=useState<string|null>(null),[message,setMessage]=useState('')
 const retry=useRef({payload:'',key:crypto.randomUUID()}),saving=useRef(false)
 async function load(){setError('');try{setProofs(await paymentRequest<Proof[]>(`${path}/${paymentId}/proofs`))}catch(e){setError(e instanceof Error?e.message:'Unable to load payment proof.')}finally{setLoading(false)}}
 useEffect(()=>{setLoading(true);void load()},[paymentId,admin])
 useEffect(()=>{if(!file){setPreview('');return}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url)},[file])
 async function upload(){
  if(!file||saving.current)return;saving.current=true;setBusy(true);setError('');setMessage('')
  const signature=JSON.stringify([paymentId,file.name,file.size,file.lastModified,reference,amount]);if(retry.current.payload!==signature)retry.current={payload:signature,key:crypto.randomUUID()}
  try{const form=new FormData();form.append('receipt',file);form.append('external_reference',reference);form.append('declared_amount',amount);form.append('request_key',retry.current.key)
   const headers=new Headers({Accept:'application/json'}),csrf=getCsrfToken();if(csrf)headers.set('X-CSRF-Token',csrf)
   const response=await fetch(`/api/v1/${path}/${paymentId}/proofs`,{method:'POST',credentials:'include',headers,body:form}),data=await response.json()
   if(!response.ok||!data.success)throw new Error(data.message??'Unable to upload payment proof.')
   setFile(null);setMessage('Receipt attached. Payment status still follows Xendit confirmation.');notifyPaymentUpdate();await load();await onUpdated?.()
  }catch(e){setError(e instanceof Error?e.message:'Unable to upload payment proof.')}finally{saving.current=false;setBusy(false)}
 }
 async function review(proof:Proof,status:'Verified'|'Rejected'){
  if(saving.current)return;saving.current=true;setBusy(true);setError('')
  try{const headers=new Headers({'Content-Type':'application/json',Accept:'application/json'}),csrf=getCsrfToken();if(csrf)headers.set('X-CSRF-Token',csrf)
   const response=await fetch(`/api/v1/${path}/proofs/${proof.proof_id}/review`,{method:'PATCH',credentials:'include',headers,body:JSON.stringify({version:proof.version,status,reason})}),data=await response.json()
   if(!response.ok||!data.success)throw new Error(data.message??'Unable to review payment proof.')
   setReason('');notifyPaymentUpdate();await load();await onUpdated?.()
  }catch(e){setError(e instanceof Error?e.message:'Unable to review payment proof.')}finally{saving.current=false;setBusy(false)}
 }
 const active=proofs.some(p=>p.review_status!=='Rejected')
 return <section className="mt-5 rounded-xl border border-slate-200 p-4 text-sm dark:border-white/15"><h3 className="font-bold">GCash receipt</h3><p className="mt-1 opacity-70">A receipt image supports payment review. Xendit confirms whether money was received.</p>{error&&<p role="alert" className="mt-3 rounded-lg bg-red-700 p-3 text-white">{error}</p>}{message&&<p role="status" data-tone="success" className="mt-3 text-emerald-700 dark:text-emerald-300">{message}</p>}
  {loading?<p className="mt-3" role="status">Loading receipt…</p>:proofs.length===0?<p className="mt-3 opacity-70">No receipt image attached.</p>:proofs.map(proof=><div key={proof.proof_id} className="mt-4 border-t pt-4"><div className="flex flex-wrap justify-between gap-2"><strong>{proof.review_status==='Pending'?'Awaiting review':proof.review_status}</strong><span className="tabular-nums">₱{Number(proof.declared_amount).toFixed(2)}</span></div><p className="mt-2 break-all">Reference: {proof.external_reference}</p>{proof.review_reason&&<p className="mt-2 break-words">{proof.review_reason}</p>}<Button variant="secondary" className="mt-3" onClick={()=>setImage(`/api/v1/${path}/proofs/${proof.proof_id}/image`)}>View receipt image</Button>{admin&&proof.review_status==='Pending'&&<div className="mt-4"><label className="block font-semibold">Review note<textarea className="mt-2 min-h-20 w-full rounded-xl border bg-transparent p-3" value={reason} maxLength={1000} onChange={e=>setReason(e.target.value)} disabled={busy}/></label><p className="mt-2 opacity-70">Verify only after the provider reference and full payment amount match. This review will not apply another payment.</p><div className="mt-3 flex flex-wrap gap-2"><Button disabled={busy||reason.trim().length<3} onClick={()=>void review(proof,'Verified')}>Verify receipt</Button><Button variant="secondary" disabled={busy||reason.trim().length<3} onClick={()=>void review(proof,'Rejected')}>Reject receipt</Button></div></div>}</div>)}
  {!admin&&!active&&!loading&&<details className="mt-4"><summary className="min-h-11 cursor-pointer py-3 font-semibold">Upload GCash receipt</summary><div className="space-y-4"><label className="block">Receipt image <span className="opacity-70">(PNG or JPEG, up to 3 MB)</span><input className="mt-2 block w-full" type="file" accept="image/png,image/jpeg" disabled={busy} onChange={e=>{const chosen=e.target.files?.[0];setError('');if(chosen&&chosen.size>3*1024*1024){setError('Choose a receipt image up to 3 MB.');setFile(null);return}setFile(chosen??null)}}/></label>{preview&&<img alt="Receipt to upload" src={preview} className="mx-auto max-h-80 max-w-full rounded-lg object-contain"/>}<label className="block">Payment reference<input className="mt-2 min-h-11 w-full rounded-xl border bg-transparent px-3" value={reference} maxLength={80} onChange={e=>setReference(e.target.value)} disabled={busy}/></label><label className="block">Total amount paid<input className="mt-2 min-h-11 w-full rounded-xl border bg-transparent px-3" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} disabled={busy}/></label><Button disabled={busy||!file||reference.trim().length<3||!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(amount)||Number(amount)<=0} onClick={()=>void upload()}>{busy?'Uploading…':'Attach receipt for review'}</Button></div></details>}
  {image&&<div className="mt-4"><div className="mb-2 flex justify-end"><Button variant="secondary" onClick={()=>setImage(null)}>Close image</Button></div><img alt="Uploaded GCash payment receipt" src={image} className="mx-auto max-h-[70dvh] max-w-full rounded-lg object-contain" onError={()=>{setError('Unable to load the private receipt image. Try again.');setImage(null)}}/></div>}
 </section>
}
