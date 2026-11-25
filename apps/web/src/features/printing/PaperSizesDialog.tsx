import {Trash2} from 'lucide-react'
import {useEffect,useRef,useState,type FormEvent} from 'react'
import {Button} from '../../components/ui'
import {DeskDialog} from '../dashboard/DeskDialog'
import {paperField} from './PaperStockDialog'
import {printingApi,type PaperSize,type PaperDefinitionInput} from './printing-api'
import {paperSizeLabel} from './paper-size-presets'

const emptyForm=():PaperDefinitionInput=>({name:'',width:'',height:''})
function millimetres(value:unknown,unit:string|null){return value==null?'':String(Number((Number(value)*(unit==='in'?25.4:unit==='cm'?10:1)).toFixed(3)))}

export function PaperSizesDialog({onClose,onSaved,startCreating=false,initialId}:{initialId?:number;startCreating?:boolean;onClose:()=>void;onSaved:(message:string)=>Promise<void>}){
  const [sizes,setSizes]=useState<PaperSize[]>([]),[editing,setEditing]=useState<PaperSize|null|undefined>(startCreating?null:undefined),[confirmDelete,setConfirmDelete]=useState<PaperSize|null>(null),[form,setForm]=useState(emptyForm),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const flight=useRef(false)
  async function load(){setLoading(true);try{const fresh=await printingApi.paperSizes();setSizes(fresh);if(initialId!==undefined){const chosen=fresh.find(size=>size.paper_stock_id===initialId);if(!chosen)throw new Error('This paper size is no longer available. Refresh the list.');edit(chosen)}setError('')}catch(cause){setError(cause instanceof Error?cause.message:'Paper sizes could not be loaded.')}finally{setLoading(false)}}
  useEffect(()=>{void load()},[])
  function edit(size:PaperSize|null){setError('');setConfirmDelete(null);setEditing(size);setForm(size?{configuration_version:size.configuration_version,name:size.paper_size_dimension,width:millimetres(size.width,size.dimension_unit),height:millimetres(size.height,size.dimension_unit)}:emptyForm())}
  const set=(change:Partial<PaperDefinitionInput>)=>setForm(current=>({...current,...change}))
  async function submit(event:FormEvent){event.preventDefault();if(flight.current)return;flight.current=true;setBusy(true);setError('')
    try{const saved=await printingApi.savePaperSize(editing?.paper_stock_id??null,form);await onSaved(`${saved.paper_size_dimension} paper size saved.`);if(initialId!==undefined){onClose();return}setEditing(undefined);await load()}
    catch(cause){setError(cause instanceof Error?cause.message:'The paper size could not be saved. Your changes are still here.')}
    finally{flight.current=false;setBusy(false)}
  }
  async function remove(size:PaperSize){
    if(flight.current)return
    flight.current=true;setBusy(true);setError('')
    try{
      await printingApi.deletePaperSize(size.paper_stock_id,Number(size.configuration_version))
      setConfirmDelete(null)
      setEditing(undefined)
      await onSaved(`${size.paper_size_dimension} paper size deleted.`)
      await load()
    }catch(cause){
      setError(cause instanceof Error?cause.message:'The paper size could not be deleted.')
    }finally{flight.current=false;setBusy(false)}
  }
  return <DeskDialog title={confirmDelete?'Delete paper size?':editing===undefined?'Paper sizes':editing?'Edit paper size':'Add new paper size'} busy={busy} onClose={onClose}>
    {confirmDelete?<div className="space-y-4">
      <p className="text-sm text-[var(--sl-text)]">Delete <strong>{confirmDelete.paper_size_dimension}</strong> from the available paper sizes? Existing printing records keep their history.</p>
      {error?<p role="alert" className="auth-error rounded-xl p-3 text-sm">{error}</p>:null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={()=>{setConfirmDelete(null);setError('')}}>Keep paper size</Button>
        <Button variant="danger" disabled={busy} onClick={()=>void remove(confirmDelete)}>{busy?'Deleting…':`Delete ${confirmDelete.paper_size_dimension}`}</Button>
      </div>
    </div>:editing===undefined?<>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-pretty text-sm opacity-75">Manage paper size names and dimensions available for printing.</p><Button disabled={loading||busy} onClick={()=>edit(null)}>Add new paper size</Button></div>
      {loading?<p role="status">Loading paper sizes…</p>:<ul className="divide-y divide-current/10">{sizes.map(size=>{return <li key={size.paper_stock_id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0 flex-1"><p className="break-words font-bold">{paperSizeLabel(size.paper_size_dimension,size)}</p></div><div className="flex gap-2"><Button variant="secondary" aria-label={'Edit '+size.paper_size_dimension} onClick={()=>edit(size)}>Edit</Button><Button variant="danger" aria-label={'Delete '+size.paper_size_dimension} onClick={()=>{setError('');setConfirmDelete(size)}}><Trash2 size={14} aria-hidden="true"/> Delete</Button></div></li>})}</ul>}
      {error?<div role="alert" className="auth-error rounded-xl p-3 text-sm">{error}<Button variant="secondary" onClick={()=>void load()}>Retry paper sizes</Button></div>:null}
    </>:<form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-semibold">Size name<input required disabled={busy} maxLength={60} value={form.name} onChange={event=>set({name:event.target.value})} placeholder="e.g. A3 or Legal" className={paperField}/></label>
      <p className="text-pretty text-xs opacity-75">Names and dimensions can be changed here. Completed printing records keep their original names. Finish or cancel unfinished jobs before renaming.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">Width (mm)<input disabled={busy} type="number" min="0.001" max="10000" step="0.001" value={form.width} onChange={event=>set({width:event.target.value})} className={paperField}/></label>
        <label className="text-sm font-semibold">Height (mm)<input disabled={busy} type="number" min="0.001" max="10000" step="0.001" value={form.height} onChange={event=>set({height:event.target.value})} className={paperField}/></label>
      </div><p className="text-xs opacity-75">Dimensions are optional. Enter both values or leave both blank.</p>
      {error?<p role="alert" className="auth-error rounded-xl p-3 text-sm">{error}</p>:null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {editing?<Button type="button" variant="danger" disabled={busy} onClick={()=>{setError('');setConfirmDelete(editing)}}><Trash2 size={14} aria-hidden="true"/> Delete</Button>:<span/>}
        <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={busy} onClick={()=>{setEditing(undefined);setError('')}}>Back to sizes</Button><Button type="submit" disabled={busy}>{busy?'Saving…':'Save paper size'}</Button></div>
      </div>
    </form>}
  </DeskDialog>
}
