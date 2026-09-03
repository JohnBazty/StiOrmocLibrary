import { AlertTriangle,Download,History,PhilippinePeso,ReceiptText,RefreshCw } from 'lucide-react'
import { useCallback,useEffect,useState } from 'react'
import { Button,PageHeader,SectionCard,StatCard,StatusBadge } from '../../components/ui'
import { fineDate,fineMoney,today } from './fine-format'
import { finesApi } from './fines-api'
import type { FineList,FineReceiptSummary } from './types'

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
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><StatCard label="Total assessed" value={fineMoney(data?.summary.assessed??0)} icon={PhilippinePeso}/><StatCard label="Outstanding balance" value={fineMoney(data?.summary.outstanding??0)} icon={AlertTriangle} tone="orange"/><StatCard label="Cash payments recorded" value={fineMoney(data?.summary.collected??0)} icon={ReceiptText}/></div>
    <SectionCard className="mb-5 border-[#FFF200] p-5"><div className="flex gap-3"><PhilippinePeso className="shrink-0"/><div><h2 className="font-bold">Cash payment at the library counter</h2><p className="mt-1 text-sm leading-6 text-[#003399]/70">Online payment is not available. Bring your school ID and pay an authorized librarian or staff member. A downloadable digital receipt will appear here after the cash payment is recorded.</p></div></div></SectionCard>
    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
      <SectionCard className="overflow-hidden"><div className="border-b border-[#003399]/15 p-5"><h2 className="font-bold">Fine and replacement-charge history</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-[#003399] text-white"><tr>{['Record','Type','Book / incident','Reason','Assessed','Paid','Balance','Status'].map((value)=><th key={value} className="px-4 py-3">{value}</th>)}</tr></thead><tbody>{data?.items.length?data.items.map((item)=><tr key={item.id} className="border-b border-[#003399]/10"><td className="px-4 py-4 font-mono text-xs">{item.id}<p className="mt-1 font-sans text-[10px] text-[#003399]/50">{fineDate(item.occurredAt)}</p></td><td className="px-4 py-4">{item.type}</td><td className="px-4 py-4 font-bold">{item.title}</td><td className="max-w-64 px-4 py-4 text-[#003399]/70">{item.reason}</td><td className="px-4 py-4 font-bold">{fineMoney(item.assessed)}</td><td className="px-4 py-4">{fineMoney(item.paid+item.adjusted)}</td><td className="px-4 py-4 font-bold">{fineMoney(item.balance)}</td><td className="px-4 py-4"><StatusBadge status={item.status}/></td></tr>):<tr><td colSpan={8} className="p-12 text-center font-semibold">You have no fine records.</td></tr>}</tbody></table></div></SectionCard>
      <SectionCard className="overflow-hidden"><div className="border-b border-[#003399]/15 p-5"><h2 className="flex items-center gap-2 font-bold"><History size={18}/>Digital receipts</h2></div><div className="divide-y divide-[#003399]/10">{receipts.length?receipts.map((receipt)=><div key={receipt.receiptId} className="p-5"><div className="flex items-start justify-between gap-3"><div><strong>{receipt.receiptNumber}</strong><p className="mt-1 text-xs text-[#003399]/60">{fineDate(receipt.receivedAt)} · Cash</p></div><StatusBadge status={receipt.status}/></div><p className="mt-3 text-xl font-bold">{fineMoney(receipt.amountReceived)}</p><Button variant="secondary" className="mt-3 w-full" onClick={()=>void finesApi.downloadReceipt(receipt.receiptId,receipt.receiptNumber).catch((cause)=>setError(cause instanceof Error?cause.message:'Receipt download failed.'))}><Download size={15}/>Download PDF</Button></div>):<p className="p-8 text-center text-sm text-[#003399]/65">No cash receipts yet.</p>}</div></SectionCard>
    </div>
  </>
}
