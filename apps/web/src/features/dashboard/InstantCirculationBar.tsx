import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { CirculationDesk } from '../circulation/CirculationDesk'
import { BookDetailDrawer } from '../catalog/BookDetailDrawer'
import { deskDashboardApi, type DeskSearch } from './desk-dashboard-api'

export function InstantCirculationBar({onChanged}:{onChanged:()=>void}){
 const [q,setQ]=useState(''),[results,setResults]=useState<DeskSearch|null>(null),[error,setError]=useState(''),[searching,setSearching]=useState(false)
 const [borrower,setBorrower]=useState<{schoolId:string;key:number}>(),[book,setBook]=useState<number|null>(null),[deskBusy,setDeskBusy]=useState(false)
 useEffect(()=>{
  setResults(null);setError('');if(q.trim().length<2){setSearching(false);return}
  const controller=new AbortController();setSearching(true)
  const timer=setTimeout(()=>void deskDashboardApi.search(q.trim(),controller.signal).then(value=>{if(!controller.signal.aborted)setResults(value)}).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Search is unavailable.')}).finally(()=>{if(!controller.signal.aborted)setSearching(false)}),250)
  return()=>{clearTimeout(timer);controller.abort()}
 },[q])
 return <section aria-label="Instant circulation" className="mb-6 grid items-start gap-4 xl:grid-cols-[2fr_1fr]">
  <CirculationDesk dashboard onChanged={onChanged} onBusyChange={setDeskBusy} schoolIdRequest={borrower}/>
  <div className="rounded-2xl border border-[#0b5ea2]/15 bg-white p-4 dark:border-white/15 dark:bg-white/5"><label className="block text-sm font-bold" htmlFor="desk-universal-search">Find a student or book</label><div className="mt-2 flex items-center gap-3 rounded-xl border border-[#0b5ea2]/20 px-3 dark:border-white/20"><Search size={19} aria-hidden="true"/><input id="desk-universal-search" value={q} onChange={event=>setQ(event.target.value)} maxLength={80} autoComplete="off" placeholder="Name, School ID, book title or ISBN" className="min-h-12 w-full bg-transparent text-sm outline-none"/></div>
   <p className="mt-2 text-xs opacity-75">Type at least two characters. Scanned codes belong in the circulation field above.</p>
   {searching?<p role="status" className="mt-3 text-sm">Searching…</p>:null}{error?<p role="alert" className="auth-error mt-3 rounded-xl p-3 text-sm">{error}</p>:null}
   {results?<div className="mt-4 grid gap-5"><div><h3 className="mb-2 font-bold">Borrowers</h3>{results.people.map(person=><button key={person.schoolId} disabled={deskBusy} onClick={()=>{setBorrower({schoolId:person.schoolId,key:Date.now()});setQ('')}} className="mb-2 block min-h-11 w-full rounded-xl border border-current/15 p-3 text-left hover:bg-[#0b5ea2]/5 disabled:opacity-50"><span className="block text-sm font-bold">{person.name}</span><span className="text-xs opacity-75">{person.schoolId} · {person.program||person.role}</span></button>)}{!results.people.length?<p className="text-sm opacity-75">No matching borrowers. Try an exact School ID.</p>:null}</div><div><h3 className="mb-2 font-bold">Books</h3>{results.books.map(item=><button key={item.id} onClick={()=>setBook(item.id)} className="mb-2 block min-h-11 w-full rounded-xl border border-current/15 p-3 text-left hover:bg-[#0b5ea2]/5"><span className="block text-sm font-bold">{item.title}</span><span className="text-xs opacity-75">{item.isbn??'No ISBN'} · View copies</span></button>)}{!results.books.length?<p className="text-sm opacity-75">No matching books. Try another title or ISBN.</p>:null}</div></div>:null}
  </div>{book!==null?<BookDetailDrawer titleId={book} barcode={null} onClose={()=>setBook(null)}/>:null}
 </section>
}
