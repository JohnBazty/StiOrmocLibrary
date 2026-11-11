import { useCallback,useEffect,useId,useRef,useState } from 'react'
import { CreditCard,RefreshCw,X } from 'lucide-react'
import { Button } from '../../components/ui'
import { downloadPaymentRecord,paymentMoney,paymentsApi,paymentStatus,providerCheckout,type Payment,type PaymentKind,type PaymentOptions } from './payments-api'

const field='min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:border-white/25 dark:bg-[#001a4d] dark:text-white'
const message=(error:unknown)=>error instanceof Error?error.message:'Payment information could not load. Please try again.'
const go=(payment:Payment)=>{if(payment.checkoutUrl)window.location.assign(providerCheckout(payment.checkoutUrl))}

export function PaymentSummary({payment}:{payment:Payment}) {
  return <dl className="space-y-3 rounded-xl bg-slate-50 p-4 text-base tabular-nums dark:bg-white/5">
    <div className="flex justify-between gap-4"><dt>{payment.kind==='Printing'?'Printing bill':'Applied to balance'}</dt><dd className="font-semibold">{paymentMoney(payment.principalCentavos)}</dd></div>
    <div className="flex justify-between gap-4"><dt>Transaction fee</dt><dd>{paymentMoney(payment.feeCentavos)}</dd></div>
    <div className="flex justify-between gap-4 border-t border-slate-200 pt-3 text-lg font-bold dark:border-white/20"><dt>{payment.state==='Succeeded'?'Total paid':'Total to pay'}</dt><dd>{paymentMoney(payment.totalCentavos)}</dd></div>
    {payment.kind==='Fine'?<div className="flex justify-between gap-4 text-sm"><dt>Remaining fine balance after payment</dt><dd>{paymentMoney(payment.remainingCentavos)}</dd></div>:null}
  </dl>
}

export function PaymentStatusPanel({payment,onChange,onUpdated}:{payment:Payment;onChange:(value:Payment)=>void;onUpdated?:()=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  async function action(run:()=>Promise<Payment|void>){if(busy)return;setBusy(true);setError('');try{const result=await run();if(result){onChange(result);if(result.state==='Succeeded')onUpdated?.()}}catch(error){setError(message(error))}finally{setBusy(false)}}
  const closed=['Succeeded','Expired','Cancelled'].includes(payment.state)
  return <div className="space-y-3 rounded-xl border border-slate-200 p-4 text-sm dark:border-white/20" aria-live="polite">
    <p className={`text-base font-bold ${payment.state==='Succeeded'?'text-emerald-700 dark:text-emerald-300':''}`}>{paymentStatus(payment)}</p>
    {payment.state==='Review'?<p>The library needs to check this payment. Please do not pay again until it is resolved.</p>:null}
    {payment.cancellationPending?<p>Your payment stays reserved until Xendit confirms cancellation. Wait before paying cash.</p>:null}
    {payment.state==='Creating'?<p>We are waiting for the payment provider. Please do not start another payment.</p>:null}
    <p className="break-all text-xs opacity-70">Reference {payment.paymentId.slice(0,8).toUpperCase()}</p>
    {error?<p role="alert" className="auth-error rounded-lg p-3">{error}</p>:null}
    <div className="flex flex-wrap gap-2">
      {!closed?<Button className="min-h-11" variant="secondary" disabled={busy} onClick={()=>void action(()=>paymentsApi.check(payment.paymentId))}><RefreshCw size={15}/>Check status</Button>:null}
      {!payment.cancellationPending && ['Active','Prepared'].includes(payment.state)?<Button className="min-h-11" disabled={busy} onClick={()=>void action(async()=>{const result=await paymentsApi.resume(payment.paymentId);go(result);return result})}>Continue payment</Button>:null}
      {!closed&&!payment.refundReview?<Button className="min-h-11" variant="ghost" disabled={busy} onClick={()=>void action(()=>paymentsApi.cancel(payment.paymentId))}>Cancel online payment</Button>:null}
      {payment.state==='Succeeded'&&payment.receiptId?<Button className="min-h-11" disabled={busy} onClick={()=>void action(()=>downloadPaymentRecord(payment))}>Download payment record</Button>:null}
    </div>
  </div>
}

function PaymentReview({kind,targetId,title,options,onClose,onPayment}:{kind:PaymentKind;targetId:number;title:string;options:PaymentOptions;onClose:()=>void;onPayment:(payment:Payment)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null),[channel,setChannel]=useState(options.methods[0]?.channelCode??'')
  const [part,setPart]=useState(false),[amount,setAmount]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [quoteState,setQuoteState]=useState<{key:string;payment:Payment}|null>(null),[retry,setRetry]=useState(0)
  const retryKey=useRef<{id:string;key:string}|null>(null),submitting=useRef(false),labelId=useId()
  const validAmount=!part||(/^\d+(\.\d{1,2})?$/.test(amount)&&Number(amount)>0&&Math.round(Number(amount)*100)<=options.balanceCentavos)
  const key=JSON.stringify({kind,targetId,channel,...(part?{amount}:{})})
  const quote=quoteState?.key===key?quoteState.payment:null
  const selected=options.methods.find(method=>method.channelCode===channel)
  function close(){if(busy)return;dialog.current?.close?.();onClose()}
  useEffect(()=>{const element=dialog.current;if(element?.showModal)element.showModal();else element?.setAttribute('open','');return()=>{if(element?.close)element.close()}},[])
  useEffect(()=>{
    if(!channel||!validAmount)return
    let active=true
    const timer=setTimeout(()=>{setError('');void paymentsApi.quote({kind,targetId,channelCode:channel,...(part?{amount}:{})})
      .then(payment=>{if(active)setQuoteState({key,payment})}).catch(error=>{if(active){setQuoteState(null);setError(message(error))}})},250)
    return()=>{active=false;clearTimeout(timer)}
  },[key,retry,validAmount])
  async function checkout(){
    if(!quote||submitting.current)return
    submitting.current=true;setBusy(true);setError('')
    if(retryKey.current?.id!==quote.paymentId)retryKey.current={id:quote.paymentId,key:crypto.randomUUID()}
    try{const payment=await paymentsApi.checkout(quote.paymentId,retryKey.current.key);onPayment(payment);go(payment)}
    catch(error){setError(message(error))}finally{submitting.current=false;setBusy(false)}
  }
  return <dialog ref={dialog} aria-labelledby={labelId} onCancel={event=>{event.preventDefault();close()}}
    className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-black/50 dark:bg-[#001a4d] dark:text-white">
    <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-5 dark:border-white/20 dark:bg-[#001a4d]"><div><h2 id={labelId} className="text-xl font-bold">Review payment</h2><p className="mt-1 break-words text-sm opacity-70">{title}</p></div><button type="button" disabled={busy} aria-label="Close payment review" className="grid min-h-11 min-w-11 place-items-center rounded-lg focus-visible:ring-2" onClick={close}><X size={20}/></button></div>
    <div className="space-y-5 p-5">
      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-300/15 dark:text-amber-100">Sandbox test. Sample fees are shown. No real payment is collected.</p>
      {kind==='Fine'?<fieldset className="space-y-3"><legend className="mb-2 font-semibold">How much would you like to pay?</legend>
        <label className="flex min-h-11 items-center gap-3"><input type="radio" name="amount-choice" checked={!part} onChange={()=>setPart(false)} disabled={busy}/>Pay full balance</label>
        <label className="flex min-h-11 items-center gap-3"><input type="radio" name="amount-choice" checked={part} onChange={()=>setPart(true)} disabled={busy}/>Pay part of the balance</label>
        {part?<label className="block">Amount to pay<input aria-label="Amount to pay" className={field+' mt-2'} inputMode="decimal" value={amount} onChange={event=>setAmount(event.target.value)} disabled={busy}/><span className="mt-2 block text-sm opacity-70">Up to {paymentMoney(options.balanceCentavos)}. Fees are added separately.</span>{amount&&!validAmount?<span role="alert" className="block text-sm text-red-700 dark:text-red-300">Enter an amount within your balance, with up to two decimal places.</span>:null}</label>:null}
      </fieldset>:null}
      <label className="block font-semibold">Payment method<select className={field+' mt-2'} value={channel} onChange={event=>setChannel(event.target.value)} disabled={busy}>{options.methods.map(method=><option key={method.channelCode} value={method.channelCode}>{method.displayName}</option>)}</select></label>
      {selected?<p className="text-sm opacity-70">Total including fees must be between {paymentMoney(selected.minTotalCentavos)} and {paymentMoney(selected.maxTotalCentavos)}.</p>:null}
      {quote?<PaymentSummary payment={quote}/>:validAmount?<p role="status" className="text-sm">Calculating your payment…</p>:null}
      {error?<div role="alert" className="auth-error rounded-xl p-3"><p>{error}</p><button type="button" disabled={busy} className="mt-2 min-h-11 font-semibold underline" onClick={()=>setRetry(value=>value+1)}>Try again</button></div>:null}
      <p className="text-sm opacity-70">Xendit handles your payment details. Your balance changes after payment is verified.</p>
      <Button className="min-h-12 w-full" disabled={!quote||busy||!validAmount} onClick={()=>void checkout()}><CreditCard size={18}/>{busy?'Opening secure checkout…':'Continue to Xendit'}</Button>
    </div>
  </dialog>
}

export function PaymentAction({kind,targetId,title,onUpdated,allowNew=true}:{kind:PaymentKind;targetId:number;title:string;onUpdated?:()=>void;allowNew?:boolean}) {
  const [options,setOptions]=useState<PaymentOptions|null>(null),[error,setError]=useState(''),[open,setOpen]=useState(false),[cash,setCash]=useState(false)
  const [payment,setPayment]=useState<Payment|null>(null)
  const load=useCallback(async()=>{try{const next=await paymentsApi.options(kind,targetId);setOptions(next);setPayment(next.active);setError('')}catch(error){setError(message(error))}},[kind,targetId])
  useEffect(()=>{let mounted=true;void paymentsApi.options(kind,targetId).then(next=>{if(mounted){setOptions(next);setPayment(next.active)}}).catch(error=>{if(mounted)setError(message(error))});return()=>{mounted=false}},[kind,targetId])
  const closed=payment&&['Succeeded','Expired','Cancelled'].includes(payment.state)
  const canStart=allowNew&&!(payment?.state==='Succeeded'&&payment.remainingCentavos===0)
  function changed(next:Payment){setPayment(next);if(['Succeeded','Expired','Cancelled'].includes(next.state)){
    setOptions(null);void paymentsApi.options(kind,targetId).then(setOptions).catch(error=>setError(message(error)))
  }}
  return <div className="mt-3 min-w-0 space-y-3">
    {payment?<PaymentStatusPanel payment={payment} onChange={changed} onUpdated={onUpdated}/>:null}
    {canStart&&(!payment||closed)?<div className="flex flex-wrap gap-2">
      {options?.enabled&&options.paymentAllowed&&options.methods.length?<Button className="min-h-11" onClick={()=>setOpen(true)}>Pay online</Button>:null}
      <Button variant="secondary" className="min-h-11" onClick={()=>setCash(value=>!value)}>Pay cash at library</Button>
      {closed?<Button variant="ghost" className="min-h-11" onClick={()=>void load()}>Review remaining balance</Button>:null}
    </div>:null}
    {cash?<p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-950 dark:bg-white/10 dark:text-white">Bring your school ID and pay authorized library personnel. No online transaction fee. Your payment record appears after cash is recorded.</p>:null}
    {error?<div className="text-sm"><p role="alert" className="auth-error rounded-lg p-3">{error}</p><button type="button" className="min-h-11 font-semibold underline" onClick={()=>void load()}>Retry payment options</button></div>:null}
    {open&&options?<PaymentReview kind={kind} targetId={targetId} title={title} options={options} onClose={()=>setOpen(false)} onPayment={payment=>{setPayment(payment);setOpen(false)}}/>:null}
  </div>
}
