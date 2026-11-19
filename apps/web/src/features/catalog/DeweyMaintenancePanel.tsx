import { useCallback, useEffect, useState } from 'react'
import { Button, SectionCard } from '../../components/ui'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { UnsavedGuard } from '../../components/UnsavedChanges'
import { AutomaticDeweyPanel } from './AutomaticDeweyPanel'
import { DeweyField } from './DeweyField'
import { deweyApi, type DeweyCopy, type DeweyEntry, type DeweySelection } from './dewey-api'

const field='min-h-11 w-full rounded-xl border border-[#003399]/30 bg-white px-3 py-2 text-sm text-[#003399] dark:bg-[#001a4d] dark:text-white'
function CopyReview({copies,onSaved,onCancel}:{copies:DeweyCopy[];onSaved:()=>Promise<void>;onCancel:()=>void}) {
  const [selection,setSelection]=useState<DeweySelection|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  async function save(){
    if(!selection?.reviewed||busy)return false
    setBusy(true);setError('')
    try{await deweyApi.assign(copies[0].isbn,selection,copies.map(copy=>({id:copy.id,version:copy.version})));await onSaved();return true}
    catch(reason){setError(reason instanceof Error?reason.message:'The classification could not be saved.');return false}
    finally{setBusy(false)}
  }
  return <UnsavedGuard dirty={Boolean(selection?.code)} onSave={save}><SectionCard className="space-y-4 p-4" aria-label="Review selected copy classifications">
    <h3 className="font-bold">Review Dewey numbers before saving</h3>
    <p className="text-sm">This will update {copies.length} selected {copies.length===1?'copy':'copies'} of {copies[0].title}.</p>
    <ul className="list-inside list-disc text-sm">{copies.map(copy=><li key={copy.id}>{copy.accession}: {copy.code??'Not assigned'}{selection?.code?` → ${selection.code}`:''}</li>)}</ul>
    <DeweyField isbn={copies[0].isbn??''} value={selection} onChange={setSelection} disabled={busy}/>
    {error&&<p role="alert">{error}</p>}
    <div className="flex flex-wrap gap-3"><Button disabled={busy||!selection?.reviewed} onClick={()=>void save()}>{busy?'Saving…':`Save Dewey for ${copies.length} ${copies.length===1?'copy':'copies'}`}</Button><Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel review</Button></div>
  </SectionCard></UnsavedGuard>
}
export function DeweyMaintenancePanel(){
  const [q,setQ]=useState(''),[status,setStatus]=useState('unassigned'),[page,setPage]=useState(1)
  const [data,setData]=useState<{items:DeweyCopy[];total:number}>({items:[],total:0}),[entries,setEntries]=useState<DeweyEntry[]>([])
  const [selected,setSelected]=useState<number[]>([]),[review,setReview]=useState<DeweyCopy[]|null>(null)
  const [classQuery,setClassQuery]=useState(''),[classRevision,setClassRevision]=useState(0)
  const [originalEntry,setOriginalEntry]=useState<DeweyEntry|null>(null)
  const [entry,setEntry]=useState<Partial<DeweyEntry>>({code:'',description:'',status:'Active'}),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true)
  useEffect(()=>{let active=true;const timer=window.setTimeout(()=>{void deweyApi.classifications(classQuery).then(result=>{if(active)setEntries(result)}).catch(reason=>{if(active)setError(reason.message)})},250);return()=>{active=false;window.clearTimeout(timer)}},[classQuery,classRevision])
  const load=useCallback(async()=>{
    const copies=await deweyApi.copies(new URLSearchParams({q,status,page:String(page)}))
    setData(copies);setSelected([])
  },[q,status,page])
  useEffect(()=>{
    let active=true;setLoading(true);setError('');setSelected([]);setReview(null)
    const timer=window.setTimeout(()=>{void deweyApi.copies(new URLSearchParams({q,status,page:String(page)})).then(copies=>{if(active)setData(copies)}).catch(reason=>{if(active)setError(reason.message)}).finally(()=>{if(active)setLoading(false)})},250)
    return()=>{active=false;window.clearTimeout(timer)}
  },[q,status,page])
  const chosen=data.items.filter(copy=>selected.includes(copy.id))
  const sameBook=chosen.length>0&&chosen.every(copy=>copy.title===chosen[0].title&&copy.isbn===chosen[0].isbn)
  const savedEntry=originalEntry??entries.find(item=>item.id===entry.id)
  const entryDirty=entry.id?Boolean(savedEntry&&(entry.description!==savedEntry.description||entry.status!==savedEntry.status)):Boolean(entry.code||entry.description||entry.status!=='Active')
  async function saveEntry(){
    setBusy(true);setError('');setNotice('')
    try{await deweyApi.saveClassification(entry);setClassRevision(current=>current+1);setOriginalEntry(null);setEntry({code:'',description:'',status:'Active'});setNotice('Dewey classification saved.');try{await load()}catch{setError('The classification was saved, but the copy list could not refresh. Reload this page.')}return true}
    catch(reason){setError(reason instanceof Error?reason.message:'Unable to save the classification.');return false}
    finally{setBusy(false)}
  }
  return <div className="space-y-5 text-[#003399] dark:text-white">
    <AutomaticDeweyPanel onSaved={load}/>
    <p>Find and review Dewey numbers for your books. Existing call numbers and shelf locations stay unchanged.</p>
    {error&&<p role="alert" className="rounded-xl border border-red-700 p-3">{error}</p>}
    {notice&&<p role="status" data-tone="success">{notice}</p>}
    <SectionCard className="space-y-4 p-4"><h2 className="text-lg font-bold">Book copy classifications</h2>
      <div className="grid gap-3 sm:grid-cols-2"><label>Find title, ISBN or accession<input className={field} value={q} disabled={Boolean(review)} onChange={event=>{setQ(event.target.value);setPage(1)}}/></label><label>Dewey assignment<select className={field} value={status} disabled={Boolean(review)} onChange={event=>{setStatus(event.target.value);setPage(1)}}><option value="unassigned">Not assigned</option><option value="assigned">Assigned</option><option value="all">All copies</option></select></label></div>
      <p role="status">{loading?'Loading copies…':`${data.total} copies · Page ${page}`}</p>
      <ResponsiveTable><table className="w-full text-left text-sm" aria-busy={loading}><caption className="sr-only">Choose book copies for Dewey review</caption><thead><tr>{['Select','Book','Accession','Dewey number'].map(label=><th key={label} className="p-3" scope="col">{label}</th>)}</tr></thead><tbody>{!loading&&data.items.map(copy=><tr key={copy.id} className="border-t border-[#003399]/10"><td className="p-3"><label className="flex min-h-11 min-w-11 items-center justify-center"><input type="checkbox" aria-label={`Select ${copy.accession}`} disabled={Boolean(review)||busy} checked={selected.includes(copy.id)} onChange={event=>setSelected(current=>event.target.checked?[...current,copy.id]:current.filter(id=>id!==copy.id))}/></label></td><td className="p-3">{copy.title}<span className="block text-xs">{copy.isbn??'No ISBN'}</span></td><td className="p-3">{copy.accession}</td><td className="p-3">{copy.code??'Not assigned'}{copy.description&&<span className="block text-xs">{copy.description}</span>}</td></tr>)}</tbody></table></ResponsiveTable>
      {!loading&&!data.items.length&&<p>No copies match these filters.</p>}
      <div className="flex flex-wrap gap-3"><Button disabled={loading||!sameBook||Boolean(review)} onClick={()=>{setReview(chosen);setNotice('')}}>Find missing Dewey numbers</Button><Button variant="secondary" disabled={page<=1||loading||Boolean(review)} onClick={()=>setPage(current=>current-1)}>Previous</Button><Button variant="secondary" disabled={page*50>=data.total||loading||Boolean(review)} onClick={()=>setPage(current=>current+1)}>Next</Button></div>
      {chosen.length>0&&!sameBook&&<p className="text-sm">Choose copies of one book at a time so the ISBN lookup matches every selected copy.</p>}
    </SectionCard>
    {review&&<CopyReview key={review.map(copy=>`${copy.id}:${copy.version}`).join(',')} copies={review} onCancel={()=>{setReview(null);void load().catch(reason=>setError(reason.message))}} onSaved={async()=>{setReview(null);setNotice('Reviewed Dewey numbers saved for the selected copies.');setClassRevision(current=>current+1);try{await load()}catch{setError('The Dewey numbers were saved, but the copy list could not refresh. Reload this page.')}}}/>}
    <UnsavedGuard dirty={entryDirty} onSave={saveEntry}><details className="rounded-xl border border-[#003399]/20 p-4"><summary className="min-h-11 cursor-pointer font-bold">Maintain reusable Dewey classifications</summary>
      <div className="mt-3 space-y-3"><p className="text-sm">Descriptions are maintained by the Librarian. Archiving keeps existing assignments readable. Number codes stay fixed; create a corrected entry and reassign copies if needed.</p>
        <label className="block">Classification number<input className={field} value={entry.code??''} maxLength={64} disabled={Boolean(entry.id)||busy} onChange={event=>setEntry(current=>({...current,code:event.target.value}))}/></label>
        <label className="block">Description (optional)<input className={field} maxLength={255} value={entry.description??''} disabled={busy} onChange={event=>setEntry(current=>({...current,description:event.target.value}))}/></label>
        <label className="block">Classification status<select className={field} value={entry.status} disabled={busy} onChange={event=>setEntry(current=>({...current,status:event.target.value as DeweyEntry['status']}))}><option>Active</option><option>Archived</option></select></label>
        <div className="flex gap-3"><Button disabled={busy||!entry.code} onClick={()=>void saveEntry()}>{entry.id?'Save classification changes':'Add classification'}</Button>{entry.id&&<Button variant="secondary" onClick={()=>{setOriginalEntry(null);setEntry({code:'',description:'',status:'Active'})}}>Cancel edit</Button>}</div>
        <label className="block">Find a reusable classification<input className={field} value={classQuery} onChange={event=>setClassQuery(event.target.value)}/></label>
        <p className="text-sm">Showing up to 200 matching reusable classifications.</p>
        {entries.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-t py-3"><p>{item.code} {item.description} · {item.status}</p><Button variant="secondary" disabled={busy} onClick={()=>{setOriginalEntry(item);setEntry(item)}}>Edit {item.code}</Button></div>)}
      </div>
    </details></UnsavedGuard>
  </div>
}
