import { useEffect, useRef, useState } from 'react'
import { Button, SectionCard } from '../../components/ui'
import { deweyApi, type AutomaticDeweyBook, type AutomaticDeweyResult } from './dewey-api'

const AUTO_REQUEST_INTERVAL_MS=1100
const descriptions:Record<string,string>={needs_review:'Subject unclear or conflicting; add a description and review',assigned:'Assigned',already_assigned:'Already assigned or no longer eligible',missing_isbn:'ISBN missing or invalid',not_found:'No matching Dewey number',multiple:'Several numbers found; choose manually',unavailable:'Lookup unavailable; try again',invalid_match:'Match could not be verified',archived:'Classification archived; choose manually',changed:'Book changed; try again'}
export function AutomaticDeweyPanel({onSaved}:{onSaved:()=>Promise<void>|void}) {
  const [data,setData]=useState<{items:AutomaticDeweyBook[];total:number;libraryTotal?:number}>({items:[],total:0})
  const [selected,setSelected]=useState<Record<number,AutomaticDeweyBook>>({}),[all,setAll]=useState(false)
  const [page,setPage]=useState(1),[q,setQuery]=useState(''),[revision,setRevision]=useState(0)
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const [results,setResults]=useState<AutomaticDeweyResult[]>([]),[progress,setProgress]=useState('')
  const stopped=useRef(false),mounted=useRef(true)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stopped.current=true}},[])
  useEffect(()=>{
    let active=true;setLoading(true)
    const timer=window.setTimeout(()=>{void deweyApi.automaticBooks(new URLSearchParams({page:String(page),q})).then(found=>{if(active)setData(found)}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Unable to load books.')}).finally(()=>{if(active)setLoading(false)})},250)
    return()=>{active=false;window.clearTimeout(timer)}
  },[page,q,revision])
  const count=all?(data.libraryTotal??data.total):Object.keys(selected).length
  const copies=Object.values(selected).reduce((sum,book)=>sum+book.copies,0)
  async function run() {
    if(!count||busy)return
    stopped.current=false;setBusy(true);setError('');setResults([]);setProgress('Starting automatic assignment…')
    let saved=false
    try {
      const scope=await deweyApi.automaticStart(all?{all:true}:{titleIds:Object.keys(selected).map(Number)})
      let token:string|null=scope.token,processed=0
      while(token&&!stopped.current) {
        const started=Date.now()
        const result=await deweyApi.automaticStep(token)
        saved=saved||result.assignedCopies>0
        if(!mounted.current)return
        if(result.titleId!==null){
          if(!result.remainingForTitle)processed++
          setResults(current=>{
            const prior=current.find(item=>item.titleId===result.titleId)
            return [...current.filter(item=>item.titleId!==result.titleId),{...result,assignedCopies:(prior?.assignedCopies??0)+result.assignedCopies}]
          })
        }
        setProgress(`${processed} of ${scope.books} books processed (${scope.copies} selected copies).`)
        token=result.nextToken
        if(token&&!stopped.current)await new Promise(resolve=>window.setTimeout(resolve,Math.max(0,AUTO_REQUEST_INTERVAL_MS-(Date.now()-started))))
      }
      if(mounted.current)setProgress(stopped.current?'Stopped. Saved numbers are kept. Select remaining books to continue.':'Finished. Saved numbers are shown below.')
    } catch(reason) {if(mounted.current)setError((reason instanceof Error?reason.message:'Automatic assignment stopped.')+' Completed assignments are kept. Select remaining books to retry.')}
    finally {
      if(mounted.current){setBusy(false);setSelected({});setAll(false);setRevision(value=>value+1)}
      if(saved&&mounted.current)try{await onSaved()}catch{if(mounted.current)setError('Dewey numbers were saved, but the copy list could not refresh. Reload the page.')}
    }
  }
  return <SectionCard className="space-y-4 p-4 text-[#003399] dark:text-white">
    <h2 className="text-lg font-bold">Automatically assign missing Dewey numbers</h2>
    <p className="text-sm">Select books and press Auto-assign. Matching local subject rules are saved automatically. Unclear subjects need review. ISBN is optional.</p>
    <label className="block text-sm">Find books without Dewey<input className="mt-1 min-h-11 w-full rounded-xl border p-3 text-[#003399]" value={q} disabled={busy||all} onChange={event=>{setQuery(event.target.value);setPage(1)}}/></label>
    {error&&<p role="alert">{error}</p>}
    <p role="status">{loading?'Loading books…':`${data.total} matching books without Dewey`}</p>
    <div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={busy||loading||all} onClick={()=>{setAll(true);setSelected({});setQuery('');setPage(1)}}>Select all books without Dewey ({data.libraryTotal??data.total})</Button><Button variant="secondary" disabled={busy||!count} onClick={()=>{setSelected({});setAll(false)}}>Clear book selection</Button></div>
    {all&&<p>All books without Dewey across every page in the library are selected.</p>}
    <fieldset disabled={busy||loading||all} className="space-y-2"><legend className="sr-only">Choose books for automatic assignment</legend>{data.items.map(book=><label key={book.id} className="flex min-h-11 items-center gap-3 rounded-xl border p-3"><input type="checkbox" aria-label={`Auto-select ${book.title}`} checked={all||Boolean(selected[book.id])} onChange={event=>{const checked=event.target.checked;setSelected(current=>{const next={...current};if(checked)next[book.id]=book;else delete next[book.id];return next})}}/><span>{book.title}<span className="block text-xs">{book.isbn||'No ISBN'} · {book.copies} unassigned copies</span></span></label>)}</fieldset>
    <div className="flex flex-wrap items-center gap-3"><Button variant="secondary" disabled={busy||loading||page===1} onClick={()=>setPage(value=>value-1)}>Previous unclassified books</Button><span>Page {page}</span><Button variant="secondary" disabled={busy||loading||page*50>=data.total} onClick={()=>setPage(value=>value+1)}>Next unclassified books</Button></div>
    <p>{count} {count===1?'book':'books'} selected{all?' across the library':` · ${copies} unassigned copies`}</p>
    {!all&&count>1000&&<p role="alert">Choose up to 1000 books, or use Select all books without Dewey.</p>}
    <Button disabled={busy||loading||!count||(!all&&count>1000)} onClick={()=>void run()}>{busy?'Assigning Dewey…':`Auto-assign Dewey to ${count} ${count===1?'book':'books'}`}</Button>
    {busy&&<Button variant="secondary" onClick={()=>{stopped.current=true;setProgress('Stopping after the current save…')}}>Stop after current save</Button>}
    <p role="status">{progress}</p>
    {results.length>0&&<><p role="status">{results.reduce((sum,result)=>sum+result.assignedCopies,0)} copies assigned · {results.filter(result=>result.outcome==='assigned').length} books assigned · {results.filter(result=>result.outcome!=='assigned').length} books skipped or needing attention.</p><ul className="space-y-1 text-sm">{results.map((result,index)=><li key={`${result.titleId}:${index}`}>{result.title}: {descriptions[result.outcome]??'Needs attention'}{result.assignedCopies?` (${result.assignedCopies} copies)`:''}</li>)}</ul></>}
    <p className="text-xs">Keep this page open while processing. If it closes, saved numbers remain. Run again for books still missing numbers.</p>
  </SectionCard>
}
