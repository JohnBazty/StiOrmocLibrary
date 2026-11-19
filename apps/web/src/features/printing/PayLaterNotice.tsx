import { useState } from 'react'
import { Button } from '../../components/ui'
import { notifyPaymentUpdate } from '../payments/payment-updates'
import { printingApi, type PrintRequest } from './printing-api'

export function PayLaterNotice({row,onUpdated}:{row:PrintRequest;onUpdated:()=>Promise<unknown>}){
 const [accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
 if(!row.deferred_approved_at||row.deferred_revoked_at||row.payment_status==='Paid'||row.job_status==='Cancelled')return null
 async function acknowledge(){setBusy(true);setError('');try{await printingApi.acknowledgeDeferred(row);notifyPaymentUpdate();await onUpdated()}catch(e){setError(e instanceof Error?e.message:'Unable to confirm. Refresh and try again.')}finally{setBusy(false)}}
 return <section className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-slate-900 dark:bg-amber-950/20 dark:text-white"><h3 className="font-bold">{row.pay_later_accepted?'Pay-later agreement':'Pay later is available'}</h3><p className="mt-2">Remaining balance: <strong>₱{Number(row.balance??row.calculated_cost).toFixed(2)}</strong>.</p><p className="mt-1 break-words">{row.deferred_reason}</p>{row.agreed_payment_date&&<p className="mt-1">Agreed payment date: {String(row.agreed_payment_date).slice(0,10)}</p>}{row.pay_later_accepted?<p className="mt-2">You acknowledged this balance. It remains payable.</p>:row.job_status==='Pending'?<><label className="mt-3 flex min-h-11 items-center gap-3"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} disabled={busy}/>I agree to pay the remaining balance.</label><Button disabled={!accepted||busy} onClick={()=>void acknowledge()}>{busy?'Confirming…':'Confirm pay-later agreement'}</Button></>:null}{error&&<p role="alert" className="mt-3 rounded-lg bg-red-700 p-3 text-white">{error}</p>}</section>
}
