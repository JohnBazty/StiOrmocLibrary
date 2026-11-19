import {useEffect,useRef,useState,type FormEvent} from 'react'
import {Button} from '../../components/ui'
import {DeskDialog} from '../dashboard/DeskDialog'
import {paperField} from './PaperStockDialog'
import {printingApi,type InkColorType} from './printing-api'

export function InkStockDialog({onClose,onSaved}:{onClose:()=>void;onSaved:(message:string)=>Promise<void>}){
  const [brand,setBrand]=useState(''),[type,setType]=useState(''),[color,setColor]=useState(''),[definitions,setDefinitions]=useState<InkColorType[]>([]),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState('')
  const [bottles,setBottles]=useState('1'),[cost,setCost]=useState(''),[threshold,setThreshold]=useState('1'),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const key=useRef(crypto.randomUUID()),flight=useRef(false)
  async function load(){setLoading(true);setLoadError('');try{setDefinitions(await printingApi.inkColorTypes())}catch(cause){setLoadError(cause instanceof Error?cause.message:'Color types could not be loaded.')}finally{setLoading(false)}}
  useEffect(()=>{void load()},[])
  const types=[...new Set(definitions.map(item=>item.cartridge_type))],colors=definitions.filter(item=>item.cartridge_type===type).map(item=>item.color_variation)
  const total=Number(bottles)*Number(cost)
  async function submit(event:FormEvent){
    event.preventDefault();if(flight.current)return;flight.current=true;setBusy(true);setError('')
    try{
      await printingApi.createInk({brand:brand.trim(),cartridge_type:type.trim(),color_variation:color,available_bottles:Number(bottles),low_stock_threshold_bottles:Number(threshold),cost_per_bottle:Number(cost),client_request_id:key.current})
      await onSaved('Ink stock added. Stock totals, alerts and purchase history refreshed.');onClose()
    }catch(cause){setError(cause instanceof Error?cause.message:'Ink stock could not be saved. Your entry is still here.')}
    finally{flight.current=false;setBusy(false)}
  }
  return <DeskDialog title="Add ink bottle stock" busy={busy} onClose={onClose}><form onSubmit={submit} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">Brand name<input required maxLength={100} disabled={busy} className={paperField} value={brand} onChange={event=>setBrand(event.target.value)} placeholder="e.g. Epson"/></label>
      <label className="text-sm font-semibold">Ink type<select required disabled={busy||loading||Boolean(loadError)} className={paperField} value={type} onChange={event=>{setType(event.target.value);setColor('')}}><option value="">Choose ink type</option>{types.map(item=><option key={item}>{item}</option>)}</select></label>
      <label className="text-sm font-semibold">Color<select required disabled={busy||loading||!type||Boolean(loadError)} className={paperField} value={color} onChange={event=>setColor(event.target.value)}><option value="">Choose color</option>{colors.map(item=><option key={item}>{item}</option>)}</select></label>
      <label className="text-sm font-semibold">Number of bottles<input required type="number" min="1" max="10000" step="1" disabled={busy} className={paperField} value={bottles} onChange={event=>setBottles(event.target.value)}/></label>
      <label className="text-sm font-semibold">Cost per bottle<input required type="number" min="0.01" max="1000000" step="0.01" disabled={busy} className={paperField} value={cost} onChange={event=>setCost(event.target.value)}/></label>
      <label className="text-sm font-semibold">Low-stock alert at (bottles)<input required type="number" min="0" max="10000" step="1" disabled={busy} className={paperField} value={threshold} onChange={event=>setThreshold(event.target.value)}/></label>
    </div>
    {loading?<p role="status" className="text-sm">Loading color types…</p>:loadError?<div role="alert" className="auth-error rounded-xl p-3 text-sm">{loadError}<Button variant="secondary" disabled={busy} onClick={()=>void load()}>Retry color types</Button></div>:definitions.length===0?<p className="text-sm">Add a color and ink type using Add new color type first.</p>:null}
    <p className="text-pretty text-xs opacity-75">The stock alert appears when unopened bottles reach this number or lower.</p>
    <div className="flex flex-wrap justify-between gap-2 rounded-xl bg-current/5 p-4 text-sm"><span>Total restocking expense</span><strong className="tabular-nums">₱{(Number.isFinite(total)?total:0).toFixed(2)}</strong></div>
    {error?<p role="alert" className="auth-error rounded-xl p-3 text-sm">{error}</p>:null}
    <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy||loading||Boolean(loadError)||!type||!color}>{busy?'Saving…':'Add ink stock'}</Button></div>
  </form></DeskDialog>
}
