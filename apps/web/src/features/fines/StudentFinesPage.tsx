import { AlertTriangle,Download,History,PhilippinePeso,ReceiptText,RefreshCw } from 'lucide-react'
import { useCallback,useEffect,useState } from 'react'
import { Button,PageHeader,SectionCard,StatCard,StatusBadge } from '../../components/ui'
import { fineDate,fineMoney,today } from './fine-format'
import { finesApi } from './fines-api'
import type { FineList,FineReceiptSummary } from './types'
import { PaymentAction } from '../payments/PaymentAction'

export function StudentFinesPage(){
  const [data,setData]=useState<FineList|null>(null);const [receipts,setReceipts]=useState<FineReceiptSummary[]>([]);const [error,setError]=useState('')
  const load=useCallback(async()=>{
    try {
      const records=await finesApi.mine({search:'',status:'all',type:'all',period:'custom',from:'2000-01-01',to:today(),page:1,limit:100})
      setData(records);setError('')
    } catch(cause) { setError(cause instanceof Error?cause.message:'Fine records are unavailable.') }
    try { setReceipts(await finesApi.receipts()) } catch { setReceipts([]) }
  },[])
  useEffect(()=>{void load()},[load])
  return <>
    <PageHeader eyebrow="Account payments" title="Library fines" action={<Button variant="secondary" onClick={()=>void load()}><RefreshCw size={16}/>Refresh</Button>}/>
    {error?<div role="alert" className="mb-5 flex gap-2 rounded-xl bg-[#FFF200] p-4 font-bold text-[#003399]"><AlertTriangle size={18}/>{error}</div>:null}
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><StatCard label="Total assessed" value={fineMoney(data?.summary.assessed??0)} icon={PhilippinePeso}/><StatCard label="Outstanding balance" value={fineMoney(data?.summary.outstanding??0)} icon={AlertTriangle} tone="orange"/><StatCard label="Payments applied" value={fineMoney(data?.summary.collected??0)} icon={ReceiptText}/></div>
    <SectionCard className="mb-5 border-[#FFF200] p-5"><div className="flex gap-3"><PhilippinePeso className="shrink-0"/><div><h2 className="font-bold">How to pay</h2><p className="mt-1 text-sm leading-6 text-[#003399]/70">Available payment options appear beside each eligible charge. You can also bring your school ID and pay at the library. A payment record appears after payment is confirmed.</p></div></div></SectionCard>
    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
      <SectionCard className="overflow-hidden"><div className="border-b border-[#003399]/15 p-5"><h2 className="font-bold">Fine and replacement-charge history</h2></div>
        <div className="divide-y divide-[#003399]/15">{data?.items.length?data.items.map(item=><article key={item.id} className="min-w-0 space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-base font-bold">{item.title}</h3><p className="mt-1 text-sm opacity-70">{item.type} · {fineDate(item.occurredAt)}</p></div><StatusBadge status={item.status}/></div>
          <p className="break-words text-sm leading-6 opacity-80">{item.reason}</p>
          <dl className="grid grid-cols-3 gap-3 text-sm tabular-nums"><div><dt className="opacity-65">Assessed</dt><dd className="mt-1 font-semibold">{fineMoney(item.assessed)}</dd></div><div><dt className="opacity-65">Payments applied</dt><dd className="mt-1 font-semibold">{fineMoney(item.paid)}</dd></div><div><dt className="opacity-65">Balance</dt><dd className="mt-1 font-bold">{fineMoney(item.balance)}</dd></div></dl>
          {item.adjusted>0?<p className="text-sm">Waived or reduced: {fineMoney(item.adjusted)}</p>:null}
          <PaymentAction kind={item.fineId?'Fine':'LostBook'} targetId={item.fineId??item.lostBookReportId!} title={item.title} onUpdated={()=>void load()} allowNew={item.paymentAllowed}/>
        </article>):<p className="p-8 text-center font-semibold">You have no fine records.</p>}</div>
      </SectionCard>
      <SectionCard className="overflow-hidden"><div className="border-b border-[#003399]/15 p-5"><h2 className="flex items-center gap-2 font-bold"><History size={18}/>Payment records</h2></div><div className="divide-y divide-[#003399]/10">{receipts.length?receipts.map((receipt)=><div key={receipt.receiptId} className="p-5"><div className="flex items-start justify-between gap-3"><div><strong>{receipt.receiptNumber}</strong><p className="mt-1 text-xs text-[#003399]/60">{fineDate(receipt.receivedAt)} · {receipt.paymentMethod}</p></div><StatusBadge status={receipt.status}/></div><p className="mt-3 text-xl font-bold">{fineMoney(receipt.totalReceived??receipt.amountReceived)}</p>{receipt.transactionFeeCentavos?<p className="mt-1 text-sm">Applied {fineMoney(receipt.amountReceived)} · Fee {fineMoney(receipt.transactionFeeCentavos/100)}</p>:null}<Button variant="secondary" className="mt-3 w-full" onClick={()=>void finesApi.downloadReceipt(receipt.receiptId,receipt.receiptNumber).catch((cause)=>setError(cause instanceof Error?cause.message:'Receipt download failed.'))}><Download size={15}/>Download PDF</Button></div>):<p className="p-8 text-center text-sm text-[#003399]/65">No payment records yet.</p>}</div></SectionCard>
    </div>
  </>
}
