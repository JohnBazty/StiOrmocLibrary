import { useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { getCurrentIdentity } from '../auth/auth-storage'
import { notifyPaymentUpdate } from '../payments/payment-updates'
import { PrintingDialog } from './PrintingDialog'
import { printingApi, type PrintRequest } from './printing-api'

const field='mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-transparent px-3 dark:border-white/20'
export function PrintCounterPaymentDialog({row,onClose,onSaved}:{row:PrintRequest;onClose:()=>void;onSaved:()=>Promise<unknown>}){
 const balance=Number(row.balance??row.calculated_cost),manager=getCurrentIdentity()?.role==='Librarian'
 const [mode,setMode]=useState<'cash'|'later'>('cash'),[amount,setAmount]=useState(balance.toFixed(2)),[reason,setReason]=useState(''),[date,setDate]=useState('')
 const [review,setReview]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const retry=useRef({payload:'',key:crypto.randomUUID()}),saving=useRef(false)
 const valid=mode==='cash'?/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(amount)&&Number(amount)>0&&Number(amount)<=balance:reason.trim().length>=3&&row.job_status==='Pending'
 async function save(){
  if(!valid||saving.current)return
  saving.current=true;setBusy(true);setError('')
  const payload=JSON.stringify([mode,amount,reason,date,row.row_version])
  if(retry.current.payload!==payload)retry.current={payload,key:crypto.randomUUID()}
  try{
   if(mode==='cash')await printingApi.cash(row,amount,retry.current.key)
   else await printingApi.approveDeferred(row,{reason,agreed_payment_date:date||undefined,version:row.row_version!,request_key:retry.current.key})
   notifyPaymentUpdate();await onSaved();onClose()
  }catch(e){setError(e instanceof Error?e.message:'Unable to save. Refresh the bill and try again.')}
  finally{saving.current=false;setBusy(false)}
 }
 return <PrintingDialog title={review?'Review counter transaction':'Payment at the library'} onClose={()=>{if(!busy)onClose()}}>
  <p className="text-sm opacity-70">Request #{row.request_id} · {row.file_name}</p>
  <div className="my-4 flex items-center justify-between rounded-xl bg-slate-100 p-4 dark:bg-white/5"><span>Remaining balance</span><strong className="text-xl tabular-nums">₱{balance.toFixed(2)}</strong></div>
  {error&&<p role="alert" className="mb-4 rounded-xl bg-red-700 p-3 text-sm text-white">{error}</p>}
  {!review?<>
   {manager&&row.job_status==='Pending'&&<div className="mb-4 grid grid-cols-2 gap-2" role="group" aria-label="Counter action"><Button variant={mode==='cash'?'primary':'secondary'} onClick={()=>setMode('cash')}>Receive cash</Button><Button variant={mode==='later'?'primary':'secondary'} onClick={()=>setMode('later')}>Approve pay later</Button></div>}
   {mode==='cash'?<><label className="block font-semibold">Cash received now<input className={field} inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label><p className="mt-3 text-sm">Balance after payment: <strong>₱{Math.max(0,balance-Number(amount||0)).toFixed(2)}</strong>. The payment record covers only cash received.</p></>:<><label className="block font-semibold">Reason<textarea className={`${field} py-3`} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label><label className="mt-4 block font-semibold">Agreed payment date <span className="font-normal opacity-70">(optional)</span><input className={field} type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><p className="mt-3 text-sm">The borrower must acknowledge the remaining balance before printing can start. This does not record a payment.</p></>}
   <Button className="mt-5 w-full" disabled={!valid} onClick={()=>setReview(true)}>Review {mode==='cash'?'cash payment':'approval'}</Button>
  </>:<>
   <dl className="space-y-3 text-sm"><div className="flex justify-between gap-3"><dt>Action</dt><dd className="font-semibold">{mode==='cash'?'Receive cash':'Approve pay later'}</dd></div><div className="flex justify-between gap-3"><dt>{mode==='cash'?'Cash received':'Unpaid balance'}</dt><dd className="font-semibold">₱{(mode==='cash'?Number(amount):balance).toFixed(2)}</dd></div>{mode==='cash'?<div className="flex justify-between gap-3"><dt>Balance after payment</dt><dd className="font-semibold">₱{(balance-Number(amount)).toFixed(2)}</dd></div>:<><div><dt>Reason</dt><dd className="mt-1 break-words">{reason}</dd></div><div><dt>Agreed date</dt><dd>{date||'No date agreed'}</dd></div></>}</dl>
   <p className="mt-5 rounded-xl border p-3 text-sm">{mode==='cash'?'Confirm that you received this cash before saving.':'The bill stays unpaid until money is received. Borrower acknowledgment is required.'}</p>
   <div className="mt-5 grid grid-cols-2 gap-3"><Button variant="secondary" disabled={busy} onClick={()=>setReview(false)}>Back</Button><Button disabled={busy} onClick={()=>void save()}>{busy?'Saving…':mode==='cash'?'Confirm cash received':'Confirm approval'}</Button></div>
  </>}
 </PrintingDialog>
}
