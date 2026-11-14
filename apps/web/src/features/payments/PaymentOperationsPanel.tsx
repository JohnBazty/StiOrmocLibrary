import {useCallback,useEffect,useId,useRef,useState,type FormEvent} from 'react'
import {Button,SectionCard} from '../../components/ui'
import {paymentMoney,paymentsApi,type Payment,type PaymentOperations,type PaymentSettlement} from './payments-api'

const field='mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-white/25 dark:bg-[#001a4d] dark:text-white'
const time=(value:string)=>new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila'})
export function PaymentOperationsPanel(){
  const [data,setData]=useState<PaymentOperations|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
  const load=useCallback(async()=>{try{setData(await paymentsApi.operations());setError('')}catch(error){setError(error instanceof Error?error.message:'Payment recovery information is unavailable.')}},[])
  useEffect(()=>{void load()},[load])
  async function recover(){if(busy)return;setBusy(true);setMessage('');try{await paymentsApi.recover();setMessage('Recovery check finished. Pending payments keep their saved status.');await load()}catch(error){setError(error instanceof Error?error.message:'Recovery could not finish. Try again later.')}finally{setBusy(false)}}
  return <SectionCard className="mb-5 space-y-4 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Payment recovery</h2><Button variant="secondary" className="min-h-11" disabled={busy} onClick={()=>void recover()}>{busy?'Checking…':'Run recovery check'}</Button></div>
    <p className="text-sm">The existing library worker retries saved confirmations. Checking never creates another checkout.</p>
    {error?<p role="alert" className="auth-error rounded-xl p-3">{error}</p>:null}{message?<p role="status" className="text-sm">{message}</p>:null}
    {data?<><p className="font-semibold">{data.checkoutEnabled?'New online payments are open.':'New online payments are paused. Existing payments still process.'}</p>
      <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">{[['Payments needing review',data.needs_review],['Checks due',data.due_checks],['Confirmations waiting',data.pending_events],['Confirmations needing review',data.review_events]].map(([label,value])=><div key={label}><dt>{label}</dt><dd className="mt-1 text-xl font-bold tabular-nums">{value}</dd></div>)}</dl>
      <p className="text-xs opacity-70">Last library worker run: {data.runnerStatus?.last_success_at?time(data.runnerStatus.last_success_at):'Not recorded'}. Asia/Manila.</p>
      {data.runnerStatus?.last_error?<p role="alert" className="auth-error rounded-xl p-3">The library worker needs attention. Check pending confirmations or contact your administrator.</p>:null}
      {data.events.length?<details><summary className="min-h-11 cursor-pointer py-3 font-semibold">View pending confirmations</summary><ul className="space-y-3">{data.events.map(event=><li key={event.event_id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-white/20"><p className="break-words font-semibold">{event.state==='Review'?'Needs review':'Waiting for confirmation'} · {event.payment_id?.slice(0,8).toUpperCase()??'Unmatched reference'}</p><p>Attempts: {event.attempts}. Received {time(event.received_at)}.</p><p className="break-words opacity-70">{event.last_error_code??'Waiting for a verified provider result'}</p></li>)}</ul></details>:<p className="text-sm">No pending confirmation events.</p>}
    </>:null}
  </SectionCard>
}

export function SettlementReview({payment,onClose}:{payment:Payment;onClose:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),title=useId(),[saved,setSaved]=useState<PaymentSettlement|null>(null),[loading,setLoading]=useState(true)
  const [reference,setReference]=useState(''),[cost,setCost]=useState(''),[date,setDate]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const validCost=/^\d+(\.\d{1,2})?$/.test(cost)&&Number(cost)*100<=payment.totalCentavos
  function close(){if(!busy){dialog.current?.close?.();onClose()}}
  useEffect(()=>{const element=dialog.current;if(element?.showModal)element.showModal();else element?.setAttribute('open','');let active=true;void paymentsApi.readSettlement(payment.paymentId).then(value=>{if(active)setSaved(value)}).catch(error=>{if(active)setError(error instanceof Error?error.message:'Could not load settlement.')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false;element?.close?.()}},[payment.paymentId])
  async function submit(event:FormEvent){event.preventDefault();if(busy||!validCost)return;setBusy(true);setError('');try{await paymentsApi.recordSettlement(payment.paymentId,{reference,processingCost:cost,settledAt:date+':00+08:00'});setSaved(await paymentsApi.readSettlement(payment.paymentId))}catch(error){setError(error instanceof Error?error.message:'Settlement could not be recorded.')}finally{setBusy(false)}}
  return <dialog ref={dialog} aria-labelledby={title} onCancel={event=>{event.preventDefault();close()}} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border-0 bg-white p-5 text-slate-900 shadow-2xl backdrop:bg-black/50 dark:bg-[#001a4d] dark:text-white">
    <div className="flex items-center justify-between gap-3"><h2 id={title} className="text-xl font-bold">Settlement evidence</h2><Button variant="ghost" disabled={busy} onClick={close}>Close</Button></div>
    <p className="my-4 text-sm">Use the provider's settlement record. Payment success alone does not confirm a bank payout. Saved evidence is permanent.</p>
    {loading?<p role="status">Loading settlement…</p>:null}{error?<p role="alert" className="auth-error rounded-xl p-3">{error}</p>:null}
    {saved?<dl className="space-y-3 break-words"><div><dt>Library-recorded reference</dt><dd className="font-semibold">{saved.provider_reference}</dd></div><div><dt>Provider processing cost</dt><dd>{paymentMoney(Number(saved.processing_cost_centavos))}</dd></div><div><dt>Net settled</dt><dd>{paymentMoney(Number(saved.net_centavos))}</dd></div><div><dt>Settled (Asia/Manila)</dt><dd>{time(saved.settled_at)}</dd></div></dl>:!loading?<form onSubmit={event=>void submit(event)} className="space-y-4"><p className="font-semibold">Total paid: {paymentMoney(payment.totalCentavos)}</p>
      <label className="block">Provider settlement reference<input required maxLength={120} className={field} value={reference} onChange={event=>setReference(event.target.value)} disabled={busy}/></label>
      <label className="block">Provider processing cost (PHP)<input required inputMode="decimal" className={field} value={cost} onChange={event=>setCost(event.target.value)} disabled={busy}/></label>
      <label className="block">Settlement date and time (Asia/Manila)<input required type="datetime-local" className={field} value={date} onChange={event=>setDate(event.target.value)} disabled={busy}/></label>
      {validCost?<p>Net settled: <strong>{paymentMoney(payment.totalCentavos-Math.round(Number(cost)*100))}</strong></p>:null}
      <Button type="submit" className="min-h-12 w-full" disabled={busy||!validCost||!reference||!date}>{busy?'Saving…':'Confirm settlement evidence'}</Button>
    </form>:null}
  </dialog>
}
