import { usePaymentUpdates } from '../payments/payment-updates'
import { AlertTriangle,PhilippinePeso,ReceiptText,RefreshCw } from 'lucide-react'
import { useCallback,useEffect,useRef,useState } from 'react'
import { Button,PageHeader,SectionCard,StatCard,StatusBadge } from '../../components/ui'
import { fineDate,fineMoney,today } from './fine-format'
import { finesApi } from './fines-api'
import type { FineList } from './types'
import {Link} from 'react-router-dom'
import {getCurrentIdentity} from '../auth/auth-storage'
import { PaymentAction } from '../payments/PaymentAction'
import {paymentsApi} from '../payments/payments-api'
import {paymentResultPath} from '../payments/payment-navigation'

export function StudentFinesPage(){
  const [data,setData]=useState<FineList|null>(null);const [error,setError]=useState('')
  const request=useRef(0);const [paymentVersion,setPaymentVersion]=useState(0)
  const prefix=getCurrentIdentity()?.role==='Faculty'?'/faculty':'/student'
  const load=useCallback(async()=>{
    const current=++request.current
    try {
      await paymentsApi.sync().catch(()=>undefined)
      const records=await finesApi.mine({search:'',status:'all',type:'all',period:'custom',from:'2000-01-01',to:today(),page:1,limit:100})
      if(current===request.current){setData(records);setPaymentVersion(value=>value+1);setError('')}
    } catch(cause) { if(current===request.current)setError(cause instanceof Error?cause.message:'Fine records are unavailable.') }
  },[])
  useEffect(()=>{void load()},[load])
  usePaymentUpdates(load)
  return <>
    <PageHeader eyebrow="Account payments" title="Library fines" action={<Button variant="secondary" onClick={()=>void load()}><RefreshCw size={16}/>Refresh</Button>}/>
    {error?<div role="alert" className="mb-5 flex gap-2 rounded-xl bg-[#FFF200] p-4 font-bold text-[#0b5ea2]"><AlertTriangle size={18}/>{error}</div>:null}
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><StatCard label="Total assessed" value={fineMoney(data?.summary.assessed??0)} icon={PhilippinePeso}/><StatCard label="Outstanding balance" value={fineMoney(data?.summary.outstanding??0)} icon={AlertTriangle} tone="orange"/><StatCard label="Payments applied" value={fineMoney(data?.summary.collected??0)} icon={ReceiptText}/></div>
    <SectionCard className="mb-5 border-[#FFF200] p-5"><div className="flex gap-3"><PhilippinePeso className="shrink-0"/><div><h2 className="font-bold">How to pay</h2><p className="mt-1 text-sm leading-6 text-[#0b5ea2]/70">Select Pay beside an eligible charge. You can also bring your school ID and pay at the library. A payment record appears after payment is confirmed.</p></div></div></SectionCard>
    <div className="space-y-5">
      <SectionCard className="overflow-hidden"><div className="border-b border-[#0b5ea2]/15 p-5"><h2 className="font-bold">Fine and replacement-charge history</h2></div>
        <div className="divide-y divide-[#0b5ea2]/15">{data?.items.length?data.items.map(item=><article key={item.id} className="min-w-0 space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-base font-bold">{item.title}</h3><p className="mt-1 text-sm opacity-70">{item.type} · {fineDate(item.occurredAt)}</p></div><StatusBadge status={item.status}/></div>
          <p className="break-words text-sm leading-6 opacity-80">{item.reason}</p>
          <dl className="grid grid-cols-3 gap-3 text-sm tabular-nums"><div><dt className="opacity-65">Assessed</dt><dd className="mt-1 font-semibold">{fineMoney(item.assessed)}</dd></div><div><dt className="opacity-65">Payments applied</dt><dd className="mt-1 font-semibold">{fineMoney(item.paid)}</dd></div><div><dt className="opacity-65">Balance</dt><dd className="mt-1 font-bold">{fineMoney(item.balance)}</dd></div></dl>
          {item.adjusted>0?<p className="text-sm">Waived or reduced: {fineMoney(item.adjusted)}</p>:null}
          {item.localPaymentId?<Link className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold" to={paymentResultPath({paymentId:item.localPaymentId})}>View payment</Link>:null}
          {item.balance>0?<PaymentAction kind={item.fineId?'Fine':'LostBook'} targetId={item.fineId??item.lostBookReportId!} title={item.title} onUpdated={()=>void load()} refreshKey={paymentVersion} allowNew={item.paymentAllowed}/>:null}
        </article>):<p className="p-8 text-center font-semibold">You have no fine records.</p>}</div>
      </SectionCard>
      <p className="text-sm opacity-75">Your online and onsite payment records are in <Link className="font-semibold underline" to={prefix+'/transactions'}>Transactions</Link>.</p>
    </div>
  </>
}
