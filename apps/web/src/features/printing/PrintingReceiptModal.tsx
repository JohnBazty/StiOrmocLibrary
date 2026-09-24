import { Download, Printer, ReceiptText, X } from 'lucide-react'
import { Button } from '../../components/ui'
import type { PrintingReceipt } from './printing-api'

const money=(value:number|string)=>`₱${Number(value).toFixed(2)}`

export function PrintingReceiptModal({receipt,onClose,onDownload,downloading=false}:{receipt:PrintingReceipt|null;onClose:()=>void;onDownload:()=>void;downloading?:boolean}){
  if(!receipt)return null
  const details=[['Receipt number',receipt.receipt_number],['Verification code',receipt.verification_code],['Print request',`#${receipt.request_id}`],['Payment method',receipt.payment_method],['User',receipt.student_name],['School ID',receipt.school_id],['Received by',receipt.received_by],['Received',new Date(receipt.received_at).toLocaleString()]]
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#003399]/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Printing digital receipt"><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
    <div className="flex items-center justify-between bg-[#003399] p-5 text-white"><div className="flex items-center gap-3"><span className="rounded-xl bg-[#FFF200] p-2 text-[#003399]"><ReceiptText size={22}/></span><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#FFF200]">Printing Service</p><h2 className="font-display text-xl font-bold">Digital receipt</h2></div></div><button onClick={onClose} aria-label="Close printing receipt" className="rounded-xl p-2 hover:bg-white/10"><X/></button></div>
    <div className="space-y-5 p-5 text-[#003399]"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-2xl font-black">{receipt.receipt_number}</p><p className="mt-1 text-xs">This receipt belongs only to the Printing Service.</p></div><span className="rounded-full border border-[#003399]/20 px-3 py-1 text-xs font-bold">{receipt.receipt_status}</span></div>
      <div className="grid gap-3 rounded-2xl border border-[#003399]/15 p-4 sm:grid-cols-2">{details.map(([label,value])=><div key={label}><p className="text-[10px] font-bold uppercase tracking-wider text-[#003399]/55">{label}</p><p className="mt-1 break-words text-sm font-semibold">{value}</p></div>)}</div>
      <div className="rounded-2xl border border-[#003399]/15 p-4"><p className="font-bold">{receipt.file_name}</p><p className="mt-1 text-sm text-[#003399]/70">{receipt.page_count} pages · {receipt.number_of_copies} copies · {receipt.total_sheets} sheets</p><p className="text-sm text-[#003399]/70">{receipt.print_type} · {receipt.paper_size}</p><div className="mt-4 flex items-end justify-between border-t border-[#003399]/15 pt-4"><span className="text-xs font-bold uppercase">Total cash received</span><strong className="text-2xl">{money(receipt.amount_received)}</strong></div></div>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={()=>window.print()}><Printer size={16}/>Print</Button><Button onClick={onDownload} disabled={downloading}><Download size={16}/>{downloading?'Downloading…':'Download PDF'}</Button></div>
    </div>
  </div></div>
}
