import {useRef,useState,type FormEvent} from 'react'
import {Button} from '../../components/ui'
import {DeskDialog} from '../dashboard/DeskDialog'
import {paperField} from './PaperStockDialog'
import {printingApi} from './printing-api'

export function InkColorTypeDialog({onClose,onSaved}:{onClose:()=>void;onSaved:(message:string)=>Promise<void>}){
  const [type,setType]=useState(''),[color,setColor]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const flight=useRef(false)
  async function submit(event:FormEvent){
    event.preventDefault();if(flight.current)return;flight.current=true;setBusy(true);setError('')
    try{
      const result=await printingApi.saveInkColorType({cartridge_type:type.trim(),color_variation:color.trim()})
      await onSaved(result.already_saved?'This color and ink type are already saved. Choose them in Add ink stock.':'Color and ink type saved. Available in Add ink stock.')
      onClose()
    }catch(cause){setError(cause instanceof Error?cause.message:'The color and ink type could not be saved. Your entry is still here.')}
    finally{flight.current=false;setBusy(false)}
  }
  return <DeskDialog title="Add new color type" busy={busy} onClose={onClose}><form onSubmit={submit} className="space-y-4">
    <p className="text-pretty text-sm opacity-75">Save a color and ink type for future stock entries.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">Ink type<input required minLength={2} maxLength={100} disabled={busy} className={paperField} value={type} onChange={event=>setType(event.target.value)} placeholder="e.g. Pigment"/></label>
      <label className="text-sm font-semibold">Color<input required maxLength={60} disabled={busy} className={paperField} value={color} onChange={event=>setColor(event.target.value)} placeholder="e.g. Light Cyan"/></label>
    </div>
    {error?<p role="alert" className="auth-error rounded-xl p-3 text-sm">{error}</p>:null}
    <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy?'Saving…':'Save color type'}</Button></div>
  </form></DeskDialog>
}
