import {useEffect,useRef,useState} from 'react'
import {Button,SectionCard} from '../../components/ui'
import {enhancedCatalog,type Batch} from './enhanced-catalog-api'
import {BulkImportCovers} from './BulkImportCovers'
import { RefreshButton } from '../../components/RefreshButton'
type SavedList=Awaited<ReturnType<typeof enhancedCatalog.batches>>[number]
export function BookCoversPage(){
 const [lists,setLists]=useState<SavedList[]>([]),[batch,setBatch]=useState<Batch|null>(null),[loading,setLoading]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState('')
 const alive=useRef(true),request=useRef(0)
 async function select(id:number){
  const attempt=++request.current;setLoading(true);setError('')
  try{const next=await enhancedCatalog.batch(id);if(alive.current&&attempt===request.current)setBatch(next)}
  catch{if(alive.current&&attempt===request.current)setError('This saved book list could not be loaded. Your progress is kept. Try again.')}
  finally{if(alive.current&&attempt===request.current)setLoading(false)}
 }
 async function load(){
  setLoading(true);setError('')
  try{const saved=await enhancedCatalog.batches();if(!alive.current)return;setLists(saved);const desired=Number(new URLSearchParams(window.location.search).get('batch'));const chosen=saved.find(list=>Number(list.id)===Number(batch?.id??desired))??saved[0];if(chosen)await select(Number(chosen.id))}
  catch{if(alive.current)setError('Saved book lists could not be loaded. Refresh to try again. Your cover progress is kept.')}
  finally{if(alive.current)setLoading(false)}
 }
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;request.current++}},[])
 return <div className="space-y-5 text-slate-900 dark:text-slate-100"><SectionCard className="space-y-4 p-5"><h2 className="text-xl font-bold">Book covers</h2><p className="text-sm">Finish adding your books first, then return here whenever you want to find their covers. Completed uploads and saved cover progress are kept. Lookup runs while this page is open; you can pause and continue later.</p>{error&&<p role="alert" className="auth-error rounded-xl p-3 text-sm">{error}</p>}<RefreshButton label="Refresh saved book lists" onRefresh={() => load()} variant="secondary" disabled={working||loading} />{lists.length>0&&<label className="block text-sm font-semibold">Saved book list for covers<select className="mt-2 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-white/20 dark:bg-slate-900" aria-label="Saved book list for covers" disabled={working||loading} value={batch?.id??''} onChange={event=>{if(event.target.value)void select(Number(event.target.value))}}><option value="">Choose a saved book list</option>{lists.map(list=><option key={list.id} value={list.id}>{list.filename} — {list.imported} of {list.total} entries added</option>)}</select></label>}{loading&&<p role="status">Loading saved cover progress…</p>}{!loading&&!error&&!lists.length&&<p className="text-sm">Your saved book lists will appear here after you upload an Excel or CSV list.</p>}</SectionCard>{batch&&<BulkImportCovers key={batch.id} batch={batch} disabled={loading||working} onWorking={setWorking} onDone={async()=>{}}/>}</div>
}
