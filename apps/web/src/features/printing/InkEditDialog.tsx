import {useRef,useState,type FormEvent} from 'react'
import {Button} from '../../components/ui'
import {DeskDialog} from '../dashboard/DeskDialog'
import {paperField} from './PaperStockDialog'
import {printingApi,type InkColorType} from './printing-api'

export function InkEditDialog({ink,onClose,onSaved}:{ink:InkColorType;onClose:()=>void;onSaved:(message:string)=>Promise<void>}){
  const [type,setType]=useState(ink.cartridge_type),[color,setColor]=useState(ink.color_variation)
  const [review,setReview]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const flight=useRef(false)
  async function save(){
    if(flight.current)return
    flight.current=true;setBusy(true);setError('')
    try{
      await printingApi.updateInkColorType(ink.ink_color_type_id,{cartridge_type:type.trim(),color_variation:color.trim(),expected_cartridge_type:ink.cartridge_type,expected_color_variation:ink.color_variation})
      await onSaved('Ink type and color saved. Stock quantities and purchase costs stayed the same.')
      onClose()
    }catch(cause){setError(cause instanceof Error?cause.message:'The ink changes could not be saved. Your changes are still here.')}
    finally{flight.current=false;setBusy(false)}
  }
  function preview(event:FormEvent){event.preventDefault();setReview(true);setError('')}
  return <DeskDialog title={review?'Review ink changes':'Edit ink type'} busy={busy} onClose={onClose}><form onSubmit={preview} className="space-y-4">
    <p className="text-pretty text-sm">{ink.cartridge_type} · {ink.color_variation}</p>
    {review?<dl className="space-y-3 text-sm"><div><dt>Ink type</dt><dd className="break-words font-bold">{ink.cartridge_type} → {type.trim()}</dd></div><div><dt>Color</dt><dd className="break-words font-bold">{ink.color_variation} → {color.trim()}</dd></div></dl>:<div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">Ink type<input required minLength={2} maxLength={100} className={paperField} value={type} onChange={event=>setType(event.target.value)}/></label>
      <label className="text-sm font-semibold">Color<input required maxLength={60} className={paperField} value={color} onChange={event=>setColor(event.target.value)}/></label>
    </div>}
    <p className="text-pretty text-sm opacity-75">This changes the saved ink type and matching stock labels. Bottle quantities, purchase costs and usage records stay recorded.</p>
    {error?<p role="alert" className="auth-error rounded-xl p-3 text-sm">{error}</p>:null}
    <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={()=>review?setReview(false):onClose()}>{review?'Back to edit':'Cancel'}</Button>{review?<Button disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save changes'}</Button>:<Button type="submit">Review changes</Button>}</div>
  </form></DeskDialog>
}
