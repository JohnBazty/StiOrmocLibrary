import { useEffect, useState } from 'react'
import { Button, SectionCard } from '../../components/ui'
import { printingApi, type PrintSetup } from './printing-api'
import { printField } from './PrintRequestForm'

export function PrintingServiceSetup() {
  const [data,setData]=useState<PrintSetup|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState(''),[confirm,setConfirm]=useState(false)
  useEffect(()=>{void printingApi.setup().then(setData).catch(e=>setError(e.message))},[])
  function change(next:PrintSetup){setData(next);setConfirm(false);setSuccess('')}
  async function save(){
    if(!data)return
    setBusy(true);setError('')
    try{
      // Always disable the separate printing schedule; printing follows library hours and manual open/close.
      setData(await printingApi.saveSetup({...data,scheduleEnabled:false,weekly:[],exceptions:[]}))
      setConfirm(false)
      setSuccess('Photocopy and online printing image-page additions saved. Existing bills keep their accepted prices.')
    }catch(e){setError(e instanceof Error?e.message:'Unable to save.')}finally{setBusy(false)}
  }
  if(!data)return <SectionCard className="p-5">{error?<p role="alert">{error}</p>:<p role="status">Loading photocopy and online printing setup…</p>}</SectionCard>
  return <SectionCard className="max-w-4xl space-y-5 p-4 sm:p-6">
    <div><h2 className="text-lg font-bold">Photocopy and online printing</h2><p className="mt-1 text-sm opacity-75">Both services follow the library’s operating hours and manual open/close toggle. Set image-page additions here.</p><p className="mt-2 text-sm font-semibold">{Number(data.availability.accepting_requests)?'Accepting requests now':data.availability.unavailable_reason||'Closed for new requests'}</p></div>
    <fieldset disabled={busy} className="space-y-5"><legend className="sr-only">Photocopy and online printing setup</legend>
      <section><h3 className="font-semibold">Image-page additions</h3><p className="mt-1 text-sm opacity-75">For both photocopying and online printing, added per eligible image page, per copy, after staff review. Enter zero for no addition.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{(['imageFeeMono','imageFeeColor'] as const).map(key=><label key={key} className="text-sm font-semibold">{key==='imageFeeMono'?'Monochrome image page (₱)':'Colored image page (₱)'}<input className={printField} type="number" min={0} max={100000} step="0.01" value={data[key]} onChange={e=>change({...data,[key]:Number(e.target.value)})}/></label>)}</div></section>
    </fieldset>
    {error&&<p role="alert" className="rounded-xl bg-red-700 p-3 text-sm text-white">{error}</p>}{success&&<p role="status" data-tone="success" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">{success}</p>}
    {confirm?<div className="space-y-3 rounded-xl border border-[#0b5ea2] p-4"><p className="text-sm">Image additions: ₱{data.imageFeeMono.toFixed(2)} monochrome, ₱{data.imageFeeColor.toFixed(2)} colored per eligible page. Existing bills stay unchanged.</p><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Confirm and save'}</Button><Button variant="secondary" disabled={busy} onClick={()=>setConfirm(false)}>Go back</Button></div></div>:<Button onClick={()=>setConfirm(true)}>Review changes</Button>}
  </SectionCard>
}
