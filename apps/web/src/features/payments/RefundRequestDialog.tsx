import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { MoneyOutDialog } from './RefundReview'
import { paymentMoney, type Payment } from './payments-api'
import { refundRequestsApi, type RefundRequest, type RefundRequestOptions } from './refund-requests-api'

export function RefundRequestDialog({payment,admin=false,onSaved,onClose}:{payment:Payment;admin?:boolean;onSaved:()=>void;onClose:()=>void}) {
  const [options,setOptions]=useState<RefundRequestOptions|null>(null),[reasonCode,setReasonCode]=useState(''),[reason,setReason]=useState(''),[part,setPart]=useState(false),[amount,setAmount]=useState('')
  const [review,setReview]=useState<RefundRequestOptions['quote']|null>(null),[saved,setSaved]=useState<RefundRequest|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[version,setVersion]=useState(0)
  const key=useRef(crypto.randomUUID()),flight=useRef(false)
  useEffect(()=>{let active=true;void refundRequestsApi.options(payment.paymentId,admin).then(value=>{if(active)setOptions(value)}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'Refund options could not load.')});return()=>{active=false}},[payment.paymentId,admin,version])
  async function run(){
    if(flight.current||!options)return
    flight.current=true;setBusy(true);setError('')
    try {
      const principal=part?amount:(options.refundableCentavos/100).toFixed(2)
      if(!review){const latest=await refundRequestsApi.options(payment.paymentId,admin,principal);setOptions(latest);if(!latest.refundRequestAllowed)throw Error(latest.refundRequestReason??'This payment cannot be refunded.');setReview(latest.quote)}
      else {setSaved(await refundRequestsApi.create(payment.paymentId,{amount:(review.principalCentavos/100).toFixed(2),reasonCode,reason,requestKey:key.current,expectedTotalCentavos:review.totalCentavos},admin));onSaved()}
    }catch(cause){setError(cause instanceof Error?cause.message:'The request could not be saved. Please try again.')}
    finally{flight.current=false;setBusy(false)}
  }
  const partAmountValid=!part||(/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(amount)&&Number(amount)>0&&Math.round(Number(amount)*100)<=(options?.refundableCentavos??0))
  const reasonTrimmedLen=reason.trim().length
  const valid=options?.refundRequestAllowed&&reasonCode&&reasonTrimmedLen>=10&&partAmountValid
  return <MoneyOutDialog title={admin?'Request refund on behalf of user':'Request refund'} busy={busy} onClose={onClose}><div className="space-y-5">
    {saved?<><h3 className="text-xl font-bold">Request submitted</h3><p role="status" className="payment-success">Pending librarian review</p><p className="payment-muted">{saved.reference}. No refund has been sent. Your original payment stays applied until a refund is confirmed.</p><Button className="payment-button w-full" onClick={onClose}>Done</Button></>:review?<>
      <h3 className="text-lg font-bold">Review your request</h3><dl className="payment-summary"><div><dt>Payment amount requested</dt><dd>{paymentMoney(review.principalCentavos)}</dd></div><div><dt>Transaction fee included</dt><dd>{paymentMoney(review.feeCentavos)}</dd></div><div className="payment-summary-total"><dt>Total requested</dt><dd>{paymentMoney(review.totalCentavos)}</dd></div></dl>
      <p className="text-sm">Returns through the original GCash payment if approved.</p><p className="break-words text-sm">Reason: {reason}</p><p className="payment-field-note">The librarian checks your request before deciding. Sending this request does not return money automatically.</p>
      <div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={busy} onClick={()=>setReview(null)}>Edit request</Button><Button className="payment-button flex-1" disabled={busy} onClick={()=>void run()}>{busy?'Submitting…':'Submit refund request'}</Button></div>
    </>:options?<>
      <p className="payment-muted">{payment.description??'Library payment'} · PAY-{payment.paymentId.slice(0,8).toUpperCase()}</p><div className="payment-summary flex justify-between gap-3"><span>Payment available to refund</span><strong>{paymentMoney(options.refundableCentavos)}</strong></div>
      {!options.refundRequestAllowed?<p role="status" className="payment-field-note">{options.refundRequestReason}</p>:<>
        <fieldset><legend className="font-semibold">Amount to request</legend><div className="payment-amount-options"><label><input type="radio" checked={!part} onChange={()=>setPart(false)}/> Full remaining payment</label><label><input type="radio" checked={part} onChange={()=>setPart(true)}/> Part of the payment</label></div>{part?<label className="mt-3 block">Amount in pesos<input className="payment-field mt-2" inputMode="decimal" aria-invalid={Boolean(amount&&!partAmountValid)} value={amount} onChange={event=>setAmount(event.target.value)}/>{amount&&!partAmountValid?<span className="field-error mt-1.5 block text-xs font-medium">Enter an amount greater than ₱0.00 up to {paymentMoney(options.refundableCentavos)}.</span>:null}</label>:null}</fieldset>
        <label className="block font-semibold">Refund reason<select className="payment-field mt-2" value={reasonCode} onChange={event=>setReasonCode(event.target.value)}><option value="">Choose a reason</option><option value="REQUESTED_BY_CUSTOMER">Cancel unstarted printing / requested cancellation</option><option value="DUPLICATE">Duplicate payment or overpayment</option><option value="INCORRECT_CHARGE">Incorrect fine / found or returned book</option><option value="OTHER">Other</option></select></label>
        <label className="block font-semibold">Explain your request<textarea className="payment-field mt-2" rows={3} maxLength={500} aria-invalid={Boolean(reason&&reasonTrimmedLen<10)} value={reason} onChange={event=>setReason(event.target.value)}/></label><p className="payment-field-note">{reasonTrimmedLen<10?`${reasonTrimmedLen} / 10 minimum characters. `:''}Use at least 10 characters. A reason alone does not cancel a charge or confirm a book return.</p>
        <Button className="payment-button w-full" disabled={busy||!valid} onClick={()=>void run()}>{busy?'Checking…':'Review request'}</Button>
      </>}
    </>:!error?<p role="status">Loading refund options…</p>:null}
    {error?<><p role="alert" className="payment-error">{error}</p>{!options?<Button variant="secondary" onClick={()=>{setError('');setVersion(value=>value+1)}}>Retry refund options</Button>:null}</>:null}
  </div></MoneyOutDialog>
}

export function RefundRequestHistory({rows,onSaved}:{rows:RefundRequest[];onSaved:()=>void}) {
  const [busy,setBusy]=useState(''),[error,setError]=useState(''),[confirm,setConfirm]=useState<string|null>(null),flight=useRef(false)
  async function withdraw(row:RefundRequest){if(flight.current)return;flight.current=true;setBusy(row.id);setError('');try{await refundRequestsApi.withdraw(row.id,row.version);setConfirm(null);onSaved()}catch(cause){setError(cause instanceof Error?cause.message:'The request could not be withdrawn.')}finally{setBusy('');flight.current=false}}
  return <section className="refund-timeline mt-4" aria-label="Refund requests"><h3>Refund requests</h3>{rows.map(row=><article key={row.id}><div className="flex flex-wrap justify-between gap-3"><strong>{row.status}</strong><span>{paymentMoney(row.requestedPrincipalCentavos+row.requestedFeeCentavos)}</span></div><p className="payment-muted text-sm">{row.reference} · {new Date(row.createdAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</p>{row.reviewNote?<p className="mt-2 break-words text-sm">Librarian note: {row.reviewNote}</p>:null}{row.approvedTotalCentavos!==undefined?<p className="mt-2 text-sm">Approved refund: {paymentMoney(row.approvedTotalCentavos)} (including transaction fee)</p>:null}{row.state==='PendingReview'?confirm===row.id?<div className="mt-3 space-y-2"><p>Withdraw this request? Your payment will stay applied.</p><Button disabled={!!busy} onClick={()=>void withdraw(row)}>{busy===row.id?'Withdrawing…':'Confirm withdrawal of request'}</Button><Button variant="ghost" disabled={!!busy} onClick={()=>setConfirm(null)}>Keep request</Button></div>:<Button className="payment-button mt-3" variant="secondary" disabled={!!busy} onClick={()=>setConfirm(row.id)}>Withdraw request</Button>:null}</article>)}{error?<p role="alert" className="payment-error">{error}</p>:null}</section>
}
