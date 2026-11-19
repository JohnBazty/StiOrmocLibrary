import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { MoneyOutDialog, MoneyOutSummary } from './RefundReview'
import { RefundApproval } from './RefundApproval'
import { paymentMoney } from './payments-api'
import { moneyOutApi, moneyOutStatus, type MoneyOutRecord, type RefundOptions } from './money-out-api'
import { refundRequestsApi, type RefundQueueRow, type RefundRequestDetails } from './refund-requests-api'
import { notifyPaymentUpdate, usePaymentUpdates } from './payment-updates'

export function AdminRefundRequests() {
  const [filters,setFilters]=useState({state:'PendingReview',kind:'',search:'',page:1}),[data,setData]=useState<Awaited<ReturnType<typeof refundRequestsApi.list>>|null>(null)
  const [selected,setSelected]=useState<RefundQueueRow|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false)
  const version=useRef(0),latest=useRef(filters),flight=useRef<Promise<void>|null>(null),queued=useRef(false),mounted=useRef(true),recoveredAt=useRef(0);latest.current=filters
  const refresh=useCallback(()=>{
    if(flight.current){queued.current=true;return flight.current}
    setLoading(true)
    const run=(async()=>{do{
      queued.current=false;const request=++version.current,query={...latest.current}
      try{if(Date.now()-recoveredAt.current>=10000){await moneyOutApi.recover();recoveredAt.current=Date.now()}const result=await refundRequestsApi.list(query);if(mounted.current&&request===version.current&&JSON.stringify(query)===JSON.stringify(latest.current)){setData(result);setError('');setSelected(current=>current?result.items.find(row=>row.id===current.id)??current:null)}}
      catch(cause){if(mounted.current&&request===version.current)setError(cause instanceof Error?cause.message:'Refund requests could not load.')}
    }while(queued.current&&mounted.current)})().finally(()=>{flight.current=null;if(mounted.current)setLoading(false)})
    flight.current=run;return run
  },[])
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;queued.current=false;version.current++}},[])
  usePaymentUpdates(refresh,10000)
  useEffect(()=>{const timer=setTimeout(()=>void refresh(),filters.search?250:0);return()=>{version.current++;clearTimeout(timer)}},[filters,refresh])
  function saved(){notifyPaymentUpdate()}
  return <section className="payment-ui" aria-label="Refund request queue">
    <div className="payment-surface mb-5 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Refund requests</h2><p className="payment-muted text-sm">{data?.pending??'…'} awaiting librarian review. Verify the payment and bill before approving.</p></div><Button variant="secondary" disabled={loading} onClick={()=>void refresh()}>Refresh requests</Button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-sm font-semibold">Request status<select className="payment-field mt-2" value={filters.state} onChange={event=>setFilters(value=>({...value,state:event.target.value,page:1}))}><option value="">All requests</option><option value="PendingReview">Pending review</option><option value="Approved">Approved / processing</option><option value="Rejected">Rejected</option><option value="Withdrawn">Withdrawn</option></select></label><label className="text-sm font-semibold">Service<select className="payment-field mt-2" value={filters.kind} onChange={event=>setFilters(value=>({...value,kind:event.target.value,page:1}))}><option value="">All services</option><option value="Printing">Printing</option><option value="Fine">Library fines</option><option value="LostBook">Replacement charges</option></select></label><label className="text-sm font-semibold">Search requests<input className="payment-field mt-2" placeholder="Name, School ID or reference" value={filters.search} maxLength={120} onChange={event=>setFilters(value=>({...value,search:event.target.value,page:1}))}/></label></div>
    </div>
    {error?<p role="alert" className="payment-error mb-4">{error}</p>:null}{loading&&!data?<p role="status">Loading requests…</p>:null}
    {data?.items.map(row=><article className="payment-surface mb-4 p-5" key={row.id}><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="font-bold">{row.payerName}</h3><p className="payment-muted text-sm">{row.schoolId} · {row.kind==='Printing'?'Printing':row.kind==='Fine'?'Library fine':'Replacement charge'}</p><p className="payment-muted mt-1 text-xs">{row.reference} · {new Date(row.createdAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</p></div><div className="text-right"><strong>{paymentMoney(row.requestedPrincipalCentavos+row.requestedFeeCentavos)}</strong><p className="payment-chip mt-2">{row.status}</p></div></div><p className="my-4 break-words text-sm">{row.reason}</p><Button className="payment-button" variant="secondary" onClick={()=>setSelected(row)}>{row.state==='PendingReview'?'Review request':'View request'}</Button></article>)}
    {data&&!data.items.length?<div className="payment-surface p-8 text-center"><h3 className="font-semibold">No requests match these filters.</h3><p className="payment-muted mt-2 text-sm">User requests appear here after submission from Transactions.</p></div>:null}
    {data&&data.pagination.total>25?<div className="mt-4 flex items-center justify-end gap-3"><Button variant="secondary" disabled={loading||filters.page===1} onClick={()=>setFilters(value=>({...value,page:value.page-1}))}>Previous</Button><span>Page {filters.page}</span><Button variant="secondary" disabled={loading||filters.page*25>=data.pagination.total} onClick={()=>setFilters(value=>({...value,page:value.page+1}))}>Next</Button></div>:null}
    {selected?<RefundRequestReview selected={selected} onSaved={saved} onClose={()=>setSelected(null)}/>:null}
  </section>
}

function RefundRequestReview({selected,onSaved,onClose}:{selected:RefundQueueRow;onSaved:()=>void;onClose:()=>void}) {
  const [details,setDetails]=useState<RefundRequestDetails|null>(null),[options,setOptions]=useState<RefundOptions|null>(null),[operation,setOperation]=useState<MoneyOutRecord|null>(selected.operation)
  const [amount,setAmount]=useState((selected.requestedPrincipalCentavos/100).toFixed(2)),[note,setNote]=useState(''),[decision,setDecision]=useState(selected.kind==='Printing'?'Cancel':'')
  const [verified,setVerified]=useState(false),[approved,setApproved]=useState(false),[rejecting,setRejecting]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[version,setVersion]=useState(0)
  const flight=useRef(false),key=useRef(crypto.randomUUID())
  useEffect(()=>{let active=true;void Promise.all([refundRequestsApi.details(selected.id),moneyOutApi.options(selected.paymentId)]).then(([detail,value])=>{if(active){setDetails(detail);setOptions(value)}}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'Request details could not load.')});return()=>{active=false}},[selected.id,selected.version,version])
  useEffect(()=>{setOperation(current=>selected.operation&&(!current||selected.operation.events.length>=current.events.length)?selected.operation:current)},[selected.operation])
  async function run(action:'review'|'confirm'|'reject'|'check'|'cancel') {
    if(flight.current)return;flight.current=true;setBusy(true);setError('')
    try{
      if(action==='reject'){await refundRequestsApi.reject(selected.id,details?.request.version??selected.version,note);onSaved();onClose();return}
      if(action==='review')setOperation(await moneyOutApi.refund(selected.paymentId,{amount,decision,reason:selected.reason,reasonCode:selected.reasonCode,requestKey:key.current,requestId:selected.id,requestVersion:details?.request.version??selected.version,verificationNote:note,verified}))
      if(action==='confirm'&&operation&&approved)setOperation(await moneyOutApi.confirm(operation.id,{confirmed:true}))
      if(action==='check'&&operation)setOperation(await moneyOutApi.check(operation.id))
      if(action==='cancel'&&operation){await moneyOutApi.cancel(operation.id);onSaved();onClose();return}
      onSaved()
    }catch(cause){setError(cause instanceof Error?cause.message:'The request could not be updated.')}
    finally{flight.current=false;setBusy(false)}
  }
  const valid=verified&&note.trim().length>=10&&decision&&options?.eligible&&/^\d+(\.\d{1,2})?$/.test(amount)&&Number(amount)>0&&Math.round(Number(amount)*100)<=Math.min(selected.requestedPrincipalCentavos,options.refundableCentavos)
  const state=details?.request.state??selected.state
  return <MoneyOutDialog title="Review refund request" busy={busy} onClose={onClose}><div className="space-y-5">
    <div><h3 className="text-lg font-bold">{selected.payerName}</h3><p className="payment-muted text-sm">{selected.schoolId} · {selected.reference}</p></div>
    {operation?<>
      <h3 className="font-bold">{operation.state==='Draft'?'Final approval':moneyOutStatus(operation.state)}</h3><MoneyOutSummary row={operation}/><p className="break-words text-sm">Verification: {details?.request.reviewNote??note}</p>
      {operation.state==='Draft'?<><RefundApproval total={operation.totalCentavos} checked={approved} disabled={busy} onChange={setApproved}/><Button className="payment-button w-full" disabled={busy||!approved||!options?.enabled||details?.payment.refundEligible===false} onClick={()=>void run('confirm')}>{busy?'Sending…':'Approve and send refund'}</Button><Button variant="secondary" disabled={busy} onClick={()=>void run('cancel')}>Cancel unsent review</Button></>:<><p role="status" className="payment-muted">{operation.state==='Succeeded'?'The provider confirmed the refund. Linked balances have been updated.':operation.state==='Failed'?'The refund failed. The original payment stays applied.':operation.state==='Review'?'Confirmation is delayed. Keep this request; do not send another refund.':operation.state==='Processing'?'The provider is processing this refund. The original payment stays applied until confirmation.':'This refund review is closed.'}</p>{['Processing','Review'].includes(operation.state)?<Button className="payment-button" variant="secondary" disabled={busy} onClick={()=>void run('check')}>Check refund status</Button>:null}<Button className="payment-button" disabled={busy} onClick={onClose}>Done</Button></>}
    </>:details&&options?<>
      <div className="payment-summary"><p className="font-semibold">Requested: {paymentMoney(selected.requestedPrincipalCentavos)} + {paymentMoney(selected.requestedFeeCentavos)} fee</p><p className="mt-3 break-words text-sm">{selected.reason}</p><p className="payment-field-note">Original method: GCash. Returns to the original payer.</p></div>
      <details className="rounded-xl border border-current/15 p-4"><summary className="min-h-11 cursor-pointer font-semibold">Payment and service history</summary><p className="text-sm">Paid {new Date(details.payment.createdAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})} · {paymentMoney(details.payment.totalCentavos)}</p>{details.evidence.jobStatus?<p className="mt-2 text-sm">Printing status: {details.evidence.jobStatus}</p>:null}{details.evidence.history.map((row,index)=><p className="mt-2 text-sm" key={index}>{row.to_status?`${row.from_status??'Created'} → ${row.to_status}`:`${row.fine_type??'Charge'} · ${row.transaction_status??'No linked loan'}`}{row.returned_at?` · Returned ${new Date(String(row.returned_at)).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}`:''}</p>)}<p className="payment-field-note">Check these records and the actual service issue. This system does not read printer hardware logs.</p></details>
      {state==='PendingReview'?<>
        {!options.eligible?<p role="alert" className="payment-error">This bill is no longer eligible. Review the history and reject with an explanation.</p>:null}
        {!rejecting?<><label className="block font-semibold">Payment amount to approve<input className="payment-field mt-2" inputMode="decimal" value={amount} onChange={event=>setAmount(event.target.value)}/></label><p className="payment-field-note">Approve up to the requested amount. Explain any reduction in your verification note. The matching fee is calculated before final approval.</p>{selected.kind!=='Printing'?<label className="block font-semibold">Effect on the charge<select className="payment-field mt-2" value={decision} onChange={event=>setDecision(event.target.value)}><option value="">Choose an action</option><option value="Restore">Restore unpaid balance</option><option value="Cancel">Cancel incorrect charge</option></select></label>:<p className="payment-field-note">The unstarted print request is cancelled after the refund is confirmed.</p>}</>:null}
        <label className="block font-semibold">{rejecting?'Reason for rejection':'Verification note'}<textarea className="payment-field mt-2" rows={3} maxLength={500} value={note} onChange={event=>setNote(event.target.value)}/></label>
        {!rejecting?<label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5" checked={verified} onChange={event=>setVerified(event.target.checked)}/>I checked the original payment, service history and reason. This refund is justified.</label>:<p className="payment-field-note">The user will see your explanation. Rejection sends no money.</p>}
        <div className="flex flex-wrap gap-3">{rejecting?<><Button variant="secondary" disabled={busy} onClick={()=>setRejecting(false)}>Back</Button><Button className="payment-button" disabled={busy||note.trim().length<10} onClick={()=>void run('reject')}>Confirm rejection</Button></>:<><Button variant="secondary" disabled={busy} onClick={()=>setRejecting(true)}>Reject request</Button><Button className="payment-button flex-1" disabled={busy||!valid} onClick={()=>void run('review')}>Review refund</Button></>}</div>
      </>:<><p role="status">{details.request.status}</p>{details.request.reviewNote?<p className="break-words">{details.request.reviewNote}</p>:null}<Button className="payment-button" onClick={onClose}>Done</Button></>}
    </>:!error?<p role="status">Loading verified details…</p>:null}
    {error?<><p role="alert" className="payment-error">{error}</p><Button variant="secondary" disabled={busy} onClick={()=>{setError('');setVersion(value=>value+1)}}>Reload request details</Button></>:null}
  </div></MoneyOutDialog>
}
