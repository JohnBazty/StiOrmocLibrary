import {paperSizeLabel} from './paper-size-presets'
import {useRef,useState,type FormEvent} from 'react'
import {Button} from '../../components/ui'
import {DeskDialog} from '../dashboard/DeskDialog'
import {printingApi,type PaperStock,type PaperStockSettings} from './printing-api'

export const paperField='mt-1 min-h-11 w-full rounded-xl border border-current/20 bg-transparent px-3 text-sm font-normal'
const money=(amount:number)=>'₱'+amount.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})
const settingsFor=(size?:PaperStock):PaperStockSettings=>({configuration_version:size?.configuration_version??1,sheets_per_ream:size?.sheets_per_ream??500,low_stock_threshold_reams:Number(size?.low_stock_threshold_reams??2),monochrome_price:String(size?.monochrome_price??''),colored_price:String(size?.colored_price??''),is_active:size?.is_active!==false})

export function PaperStockDialog({sizes,initialId,onClose,onSaved}:{sizes:PaperStock[];initialId?:number;onClose:()=>void;onSaved:(message:string)=>Promise<void>}) {
  const [id,setId]=useState(initialId?String(initialId):''),[brand,setBrand]=useState(''),[quantity,setQuantity]=useState('1'),[price,setPrice]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [settings,setSettings]=useState(()=>settingsFor(sizes.find(size=>size.paper_stock_id===initialId)))
  const key=useRef(crypto.randomUUID()),flight=useRef(false)
  const selected=sizes.find(item=>String(item.paper_stock_id)===id),total=Number(quantity)*Number(price)
  const set=(change:Partial<PaperStockSettings>)=>setSettings(current=>({...current,...change}))
  async function submit(event:FormEvent){
    event.preventDefault();if(flight.current||!selected)return;flight.current=true;setBusy(true);setError('')
    try{
      const result=await printingApi.restock('paper',selected.paper_stock_id,{quantity:Number(quantity),unit_cost:Number(price),client_request_id:key.current,brand:brand.trim(),settings})
      await onSaved(result.data.already_recorded?'This paper stock entry was already recorded. Stock totals refreshed.':`${quantity} reams of ${brand.trim()} ${selected.paper_size_dimension} added. Purchase expense: ${money(total)}.`)
      onClose()
    }catch(cause){setError(cause instanceof Error?cause.message:'Paper stock could not be saved. Please try again.')}
    finally{flight.current=false;setBusy(false)}
  }
  return <DeskDialog title="Add paper stock" busy={busy} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold">Paper size<select required className={paperField} value={id} disabled={busy} onChange={event=>{setId(event.target.value);setBrand('');setSettings(settingsFor(sizes.find(size=>String(size.paper_stock_id)===event.target.value)))}}>
          <option value="">Choose paper size</option>{sizes.map(size=><option key={size.paper_stock_id} value={size.paper_stock_id}>{paperSizeLabel(size.paper_size_dimension,size)}</option>)}
        </select></label>
        <label className="block text-sm font-semibold">Paper brand<input required maxLength={100} disabled={busy} className={paperField} list="paper-stock-brands" value={brand} onChange={event=>{const value=event.target.value;setBrand(value);const saved=selected?.brands?.find(item=>item.brand.trim().toLowerCase()===value.trim().toLowerCase());if(saved)set({monochrome_price:String(saved.monochrome_price??selected?.monochrome_price??''),colored_price:String(saved.colored_price??selected?.colored_price??'')})}} placeholder="Choose or enter brand"/><datalist id="paper-stock-brands">{selected?.brands?.map(item=><option key={item.paper_brand_stock_id} value={item.brand}/>)}</datalist></label>
      </div>
      {selected?<p className="text-sm opacity-75">Current stock for this size: <strong className="tabular-nums">{Number(selected.unopened_reams)}</strong> unopened reams across all brands.</p>:null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">Reams to add<input required disabled={busy} type="number" min="1" max="10000" step="1" value={quantity} onChange={event=>setQuantity(event.target.value)} className={paperField}/></label>
        <label className="text-sm font-semibold">Cost per ream<input required disabled={busy} type="number" min="0.01" max="1000000" step="0.01" value={price} onChange={event=>setPrice(event.target.value)} className={paperField}/></label>
        <label className="text-sm font-semibold">Sheets per ream<input required disabled={busy} type="number" min="1" max="10000" step="1" value={settings.sheets_per_ream} onChange={event=>set({sheets_per_ream:Number(event.target.value)})} className={paperField}/></label>
        <label className="text-sm font-semibold">Low-stock alert at (reams)<input required disabled={busy} type="number" min="0" max="10000" step="1" value={settings.low_stock_threshold_reams} onChange={event=>set({low_stock_threshold_reams:Number(event.target.value)})} className={paperField}/></label>
      </div>
      <fieldset className="rounded-xl border border-current/15 p-3"><legend className="px-1 text-sm font-semibold">Printing prices per page</legend><div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">Monochrome price<input required disabled={busy} type="number" min="0.01" max="1000000" step="0.01" value={settings.monochrome_price} onChange={event=>set({monochrome_price:event.target.value})} className={paperField}/></label>
        <label className="text-sm font-semibold">Colored price<input required disabled={busy} type="number" min="0.01" max="1000000" step="0.01" value={settings.colored_price} onChange={event=>set({colored_price:event.target.value})} className={paperField}/></label>
      </div><p className="mt-2 text-xs opacity-75">These page prices belong to this brand. They apply when staff opens its ream. Sheets per ream and alerts apply to this size. Existing bills keep their prices.</p></fieldset>
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input disabled={busy} type="checkbox" checked={settings.is_active} onChange={event=>set({is_active:event.target.checked})}/>Available for new print requests</label>
      <div className="flex flex-wrap justify-between gap-2 rounded-xl bg-current/5 p-4 text-sm"><span>Total restocking expense</span><strong className="tabular-nums">{money(Number.isFinite(total)?total:0)}</strong></div>
      {error?<p role="alert" className="auth-error rounded-xl p-3 text-sm">{error}</p>:null}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy||!selected}>{busy?'Saving…':'Add paper stock'}</Button></div>
    </form>
  </DeskDialog>
}
