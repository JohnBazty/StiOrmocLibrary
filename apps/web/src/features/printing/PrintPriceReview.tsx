import { useState } from 'react'
import { Button } from '../../components/ui'
import { PrintingDialog } from './PrintingDialog'
import { DocumentPreview } from './DocumentPreview'
import { printField } from './PrintRequestForm'
import { printingApi, type PrintRequest } from './printing-api'

function pageList(text:string,count:number) {
  if(!text.trim())return []
  const pages=new Set<number>()
  for(const part of text.split(',')) {
    if(!/^\s*\d+(?:\s*-\s*\d+)?\s*$/.test(part))throw new Error('Use page numbers such as 1, 3–5 (type a hyphen for ranges).')
    const [first,last]=part.trim().split(/\s*-\s*/).map(Number),end=last??first
    if(first<1||end>count||end<first)throw new Error(`Use page numbers from 1 to ${count}.`)
    for(let page=first;page<=end;page++)pages.add(page)
  }
  return [...pages].sort((a,b)=>a-b)
}
export function PrintPriceReview({row,onClose,onSaved}:{row:PrintRequest;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const [count,setCount]=useState(String(row.page_count)),[images,setImages]=useState('')
  const [colors,setColors]=useState(row.page_findings?.filter(p=>p.hasColor).map(p=>p.page).join(', ')??''),[reason,setReason]=useState(''),[reviewed,setReviewed]=useState(false)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState(false)
  async function save(){setBusy(true);setError('');try{const pages=Number(count);if(!Number.isInteger(pages)||pages<1||pages>500)throw new Error('Enter 1–500 original pages.');await printingApi.reviewPrice(row,{page_count:pages,image_pages:pageList(images,pages),color_pages:pageList(colors,pages),reason});await onSaved();onClose()}catch(e){setError(e instanceof Error?e.message:'Unable to review pages.')}finally{setBusy(false)}}
  return <PrintingDialog title="Review pages and price" onClose={()=>{if(!busy)onClose()}}>
    <p className="mb-4 text-sm">Request #{row.request_id} · {row.full_name} · {row.service_kind??'Print'}</p>
    <p className="mb-4 text-sm opacity-75">Check the document or physical originals. Count each image page once. Exclude scanned text and logos from image additions.</p>
    {row.service_kind!=='Photocopy'&&<Button variant="secondary" onClick={()=>setPreview(true)}>Preview document</Button>}
    <p className="mt-3 break-words text-xs">Detected image objects: pages {row.page_findings?.filter(p=>p.hasImage).map(p=>p.page).join(', ')||'None'}. Select eligible pages below only after checking them.</p><div className="mt-4 space-y-4"><label className="block text-sm font-semibold">Verified original pages<input className={printField} type="number" min={1} max={500} disabled={busy||row.service_kind!=='Photocopy'} value={count} onChange={e=>setCount(e.target.value)}/></label>
      <label className="block text-sm font-semibold">Pages containing color<input className={printField} placeholder="For example: 1, 3-5. Leave blank for none." value={colors} onChange={e=>setColors(e.target.value)}/></label>
      <label className="block text-sm font-semibold">Pages eligible for image additions<input className={printField} placeholder="For example: 2, 4. Leave blank for none." value={images} onChange={e=>setImages(e.target.value)}/></label>
      <label className="block text-sm font-semibold">Review note<textarea className={printField} minLength={5} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1 size-5 shrink-0" type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>I checked the pages. The requester must accept the updated price before payment.</label>
      {error&&<p role="alert" className="rounded-xl bg-red-700 p-3 text-sm text-white">{error}</p>}
      <Button className="w-full" disabled={busy||!reviewed||reason.trim().length<5} onClick={()=>void save()}>{busy?'Saving…':'Send final price for confirmation'}</Button>
    </div>
    {preview&&<DocumentPreview url={`/api/v1/admin/printing/requests/${row.request_id}/preview`} onClose={()=>setPreview(false)}/>}
  </PrintingDialog>
}
