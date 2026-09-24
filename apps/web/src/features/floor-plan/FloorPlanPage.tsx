import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MapPin, Plus, Save, Undo2 } from 'lucide-react'
import { Button, PageHeader, SectionCard } from '../../components/ui'
import { getCurrentIdentity } from '../auth/auth-storage'
import { BookCoverThumbnail } from '../catalog/BookCoverThumbnail'
import { floorRequest, type BooksResult, type Layout, type MapBook, type MapObject, type PlanState, type Shelf, type Version } from './floor-plan-api'
import { FloorMap } from './FloorMap'

const input='mt-1 w-full rounded-xl border border-[#003399]/20 bg-white p-2 text-sm text-[#003399]'
const emptyBooks:BooksResult={items:[],matches:[],total:0}
function catalogPath(titleId:number){const role=getCurrentIdentity()?.role;const prefix=role==='Faculty'?'/faculty':role==='Admin'?'/admin':role==='Librarian'?'/librarian':'/student';return `${prefix}/catalog?titleId=${titleId}`}
function ShelfContents({shelf,books,target}:{shelf:Shelf;books:MapBook[];target:MapBook|null}){
  const cells=Array.from({length:shelf.rowCount*shelf.columnCount},(_,index)=>({row:Math.floor(index/shelf.columnCount)+1,column:index%shelf.columnCount+1}))
  return <div className="mt-4 overflow-x-auto"><div className="grid gap-3" style={{gridTemplateColumns:`repeat(${shelf.columnCount}, minmax(190px, 1fr))`,minWidth:`${shelf.columnCount*190}px`}}>{cells.map(cell=>{const located=books.filter(book=>book.shelfColumn===cell.column&&book.shelfRow===cell.row);return <section key={`${cell.column}-${cell.row}`} className={`min-h-32 rounded-xl border p-3 ${target?.shelfColumn===cell.column&&target?.shelfRow===cell.row?'border-[#003399] bg-[#FFF200]/35':'border-[#003399]/15 bg-white'}`}><h3 className="mb-2 text-xs font-black uppercase">Column {cell.column} · Row {cell.row}</h3>{located.length?located.map(book=>{const focused=target?.copyId===book.copyId||(!target?.copyId&&target?.titleId===book.titleId);return <article id={`shelf-book-${book.copyId}`} key={book.copyId} className={`mb-2 flex gap-2 rounded-lg border border-[#003399]/10 p-2 last:mb-0 ${focused?'animate-[pulse_1s_ease-in-out_3] bg-[#FFF200]':''}`}><BookCoverThumbnail title={book.title} coverImagePath={book.coverPath} className="h-14 w-10 shrink-0 rounded-md"/><div className="min-w-0"><p className="truncate text-xs font-bold">{book.title}</p><p className="truncate text-[10px] text-[#003399]/65">{book.author||'Author not recorded'}</p><p className="mt-1 font-mono text-[10px]">{book.callNumber||'Call number pending'}</p><p className="text-[10px]">{book.availability}</p><a className="mt-1 inline-block text-[10px] font-bold underline" href={catalogPath(book.titleId)}>View details</a></div></article>}):<p className="text-xs text-[#003399]/45">Empty</p>}</section>})}</div><p className="mt-2 text-xs text-[#003399]/60">Rows are shown from top to bottom. Books are ordered by call number inside each compartment.</p></div>
}
export function FloorPlanPage({editor=false}:{editor?:boolean}){
  const [params,setParams]=useSearchParams()
  const [data,setData]=useState<PlanState|null>(null),[layout,setLayout]=useState<Layout|null>(null),[areaId,setAreaId]=useState('')
  const [selected,setSelected]=useState<string|null>(null),[books,setBooks]=useState<BooksResult>(emptyBooks)
  const [q,setQ]=useState(''),[category,setCategory]=useState(''),[shelfFilter,setShelfFilter]=useState('')
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState(false),[dirty,setDirty]=useState(false)
  const [newShelf,setNewShelf]=useState(''),[areaName,setAreaName]=useState(''),[versionId,setVersionId]=useState(''),[versions,setVersions]=useState<Version[]>([])
  const [unmapped,setUnmapped]=useState(false)
  const [targetBook,setTargetBook]=useState<MapBook|null>(null)
  const [undo,setUndo]=useState<Layout[]>([])
  const requestSequence=useRef(0),focusKey=useRef('')
  const titleId=params.get('titleId'),copyId=params.get('copyId'),barcode=params.get('barcode'),available=params.get('available')
  const load=useCallback(async()=>{
    const state=await floorRequest<PlanState>(editor?'/editor':'')
    setData(state);setLayout(state.layout);setAreaId(old=>state.layout?.areas.some(a=>a.id===old)?old:state.layout?.areas[0]?.id??'');setDirty(false);setUndo([])
    if(editor)setVersions(await floorRequest<Version[]>('/versions'))
  },[editor])
  useEffect(()=>{void load().catch(e=>setError(e.message));if(editor)return;const timer=setInterval(()=>void load().catch(e=>setError(e.message)),30000);return()=>clearInterval(timer)},[load,editor])
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty])
  const refreshBooks=useCallback(async()=>{
    const seq=++requestSequence.current
    const search=new URLSearchParams();if(q)search.set('q',q);if(category)search.set('categoryId',category);if(shelfFilter)search.set('shelfId',shelfFilter)
    if(!shelfFilter){if(titleId)search.set('titleId',titleId);if(copyId)search.set('copyId',copyId);if(barcode)search.set('barcode',barcode);if(available)search.set('available',available)}if(unmapped)search.set('unmapped','true')
    try{const result=await floorRequest<BooksResult>(`/books?${search}`);if(seq===requestSequence.current)setBooks(result)}catch(e){if(seq===requestSequence.current)setError(e instanceof Error?e.message:'Unable to search books.')}
  },[q,category,shelfFilter,titleId,copyId,barcode,available,unmapped])
  useEffect(()=>{const timer=setTimeout(()=>void refreshBooks(),200);return()=>clearTimeout(timer)},[refreshBooks])
  useEffect(()=>{
    const key=`${titleId}:${copyId}:${barcode}`;if(!titleId||!layout||focusKey.current===key)return
    const item=books.items.find(b=>layout.objects.some(o=>o.shelfId===Number(b.shelfId)))
    const object=item?layout.objects.find(o=>o.shelfId===Number(item.shelfId)):null
    if(object&&item){setTargetBook(item);setAreaId(object.areaId);setSelected(object.id);focusKey.current=key}
  },[books,layout,titleId,copyId,barcode])
  useEffect(()=>{if(!shelfFilter||!targetBook)return;const timer=window.setTimeout(()=>{const node=document.getElementById(`shelf-book-${targetBook.copyId}`);if(node&&typeof node.scrollIntoView==='function')node.scrollIntoView({behavior:'smooth',block:'center',inline:'center'})},50);return()=>window.clearTimeout(timer)},[books.items.length,shelfFilter,targetBook])
  const area=layout?.areas.find(a=>a.id===areaId)??layout?.areas[0]
  const object=layout?.objects.find(o=>o.id===selected)
  const selectedShelf=data?.shelves.find(shelf=>shelf.id===object?.shelfId)
  const canEdit=editor&&!preview
  const highlighted=new Set(books.matches.filter(m=>m.shelfId).map(m=>Number(m.shelfId)))
  function change(next:Layout){if(!layout)return;setUndo(old=>[...old.slice(-29),layout]);setLayout(next);setDirty(true);setNotice('')}
  function updateObject(next:MapObject){if(layout)change({...layout,objects:layout.objects.map(o=>o.id===next.id?next:o)})}
  function moveObjectToArea(nextAreaId:string){
    if(!object||!layout)return
    const target=layout.areas.find(a=>a.id===nextAreaId);if(!target)return
    updateObject({...object,areaId:target.id,x:Math.max(0,Math.min(target.width-object.width,50)),y:Math.max(0,Math.min(target.height-object.height,50))})
    setAreaId(target.id)
  }
  function removeArea(){
    if(!area||!layout||layout.areas.length===1)return
    if(layout.objects.some(o=>o.areaId===area.id)){setError('Move or remove every object on this area before deleting it.');return}
    const remaining=layout.areas.filter(a=>a.id!==area.id);change({...layout,areas:remaining});setAreaId(remaining[0].id);setSelected(null)
  }
  function select(id:string|null){setSelected(id);const o=layout?.objects.find(o=>o.id===id);setQ('');setCategory('');setShelfFilter(o?.shelfId?String(o.shelfId):'')}
  async function action(work:()=>Promise<void>){setBusy(true);setError('');setNotice('');try{await work()}catch(e){setError(e instanceof Error?e.message:'The change could not be saved.')}finally{setBusy(false)}}
  function save(publish=false){if(!layout||!data)return;void action(async()=>{
    const result=await floorRequest<{revision:number}>(publish?'/publish':'/draft',publish?'POST':'PUT',{revision:data.revision,layout})
    setData({...data,revision:result.revision,...(publish?{published:layout}:{})});setDirty(false);setNotice(publish?'Layout published. Users can now see it.':'Draft saved.');if(publish){setVersions(await floorRequest<Version[]>('/versions'));await refreshBooks();setData(await floorRequest<PlanState>('/editor'))}
  })}
  function addObject(kind:string,shelfId:number|null=null,label?:string){if(!layout||!area)return;const id=crypto.randomUUID();change({...layout,objects:[...layout.objects,{id,areaId:area.id,kind,label:label??kind[0].toUpperCase()+kind.slice(1),note:'',shelfId,x:50,y:50,width:kind==='wall'?180:120,height:kind==='wall'?20:70,rotation:0}]});setSelected(id)}
  function saveShelfGrid(columnCount:number,rowCount:number){if(!selectedShelf)return;void action(async()=>{await floorRequest(`/shelves/${selectedShelf.id}/grid`,'PATCH',{columnCount,rowCount});await load();setSelected(object?.id??null);setNotice(`${selectedShelf.label} now has ${columnCount} columns and ${rowCount} rows.`)})}
  function removeObject(){if(!object||!layout)return;const s=data?.shelves.find(s=>s.id===object.shelfId);if(s&&(s.bookCount+s.researchCount)>0){setError(`Transfer the items assigned to ${s.label} before removing its map position.`);return}change({...layout,objects:layout.objects.filter(o=>o.id!==selected)});setSelected(null);setShelfFilter('')}
  async function upload(file:File|undefined){if(!file||!area||!layout)return;void action(async()=>{
    if(file.size>2*1024*1024)throw new Error('Use an image no larger than 2 MB.')
    const image=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file)})
    const result=await floorRequest<{path:string}>('/background','POST',{image});change({...layout,areas:layout.areas.map(a=>a.id===area.id?{...a,background:result.path}:a)})
  })}
  return <>
    <PageHeader eyebrow={editor?'Library layout management':'Find your way around'} title="Library floor plan" description={editor?'Arrange shelves, save a draft, and publish the layout when the library is ready.':'Find a book, select its shelf, or explore the library map.'} action={editor?<div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={!undo.length||busy||preview} onClick={()=>{const previous=undo.at(-1);if(previous){setLayout(previous);setUndo(undo.slice(0,-1));setDirty(true)}}}><Undo2 size={15}/>Undo</Button><Button variant="secondary" disabled={!layout||busy} onClick={()=>setPreview(!preview)}>{preview?'Return to editing':'Preview'}</Button><Button disabled={!layout||busy} onClick={()=>save()}><Save size={15}/>Save draft</Button><Button disabled={!layout||busy} onClick={()=>save(true)}>Publish</Button></div>:undefined}/>
    {error?<div role="alert" className="mb-4 rounded-xl bg-[#FFF200] p-4 text-sm font-semibold text-[#003399]">{error}</div>:null}
    {notice?<p role="status" className="mb-4 rounded-xl bg-[#003399]/5 p-4 text-sm">{notice}</p>:null}
    {dirty?<p className="mb-3 text-sm font-semibold">Unsaved layout changes</p>:null}
    {preview?<p className="mb-3 rounded-xl bg-[#FFF200]/40 p-3 text-sm">Preview of your draft. Users see it only after publishing.</p>:null}
    {data&&!layout?<SectionCard className="mb-5 p-6">The library floor plan has not been published yet. Written shelf locations are shown below.</SectionCard>:null}
    {!data&&!error?<p className="p-6">Loading floor plan…</p>:null}
    <div className={`grid gap-5 ${canEdit?'xl:grid-cols-[280px_1fr]':''}`}>
      {canEdit&&layout&&area?<SectionCard className="space-y-5 p-4">
        <h2 className="font-bold">Layout tools</h2>
        <label className="block text-xs font-bold">Area name<input className={input} value={area.name} maxLength={100} onChange={e=>change({...layout,areas:layout.areas.map(a=>a.id===area.id?{...a,name:e.target.value}:a)})}/></label>
        <div className="grid grid-cols-2 gap-2">{(['width','height'] as const).map(key=><label key={key} className="text-xs font-bold">Area {key}<input className={input} type="number" min={300} max={10000} value={area[key]} onChange={e=>change({...layout,areas:layout.areas.map(a=>a.id===area.id?{...a,[key]:Number(e.target.value)}:a)})}/></label>)}</div>
        <p className="text-xs text-[#003399]/60">Increasing the area adds space and keeps existing shelf positions.</p>
        {layout.areas.length>1?<Button variant="secondary" onClick={removeArea}>Delete this empty area</Button>:null}
        <label className="block text-xs font-bold">Background image (optional)<input className={input} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>void upload(e.target.files?.[0])}/></label>
        {area.background?<Button variant="secondary" onClick={()=>change({...layout,areas:layout.areas.map(a=>a.id===area.id?{...a,background:null}:a)})}>Remove background</Button>:null}
        <form onSubmit={e=>{e.preventDefault();const id=crypto.randomUUID();change({...layout,areas:[...layout.areas,{id,name:areaName.trim(),width:1200,height:800,background:null}]});setAreaId(id);setAreaName('')}}><label className="text-xs font-bold">New area or floor<input required maxLength={100} className={input} value={areaName} onChange={e=>setAreaName(e.target.value)} placeholder="Second floor"/></label><Button variant="secondary" type="submit" disabled={!areaName.trim()||layout.areas.length>=20} className="mt-2"><Plus size={15}/>Add area</Button></form>
        <div><h3 className="mb-2 text-sm font-bold">Add objects</h3><div className="flex flex-wrap gap-2">{['wall','entrance','exit','table','desk','chair','printing'].map(kind=><button key={kind} onClick={()=>addObject(kind)} className="rounded-lg border border-[#003399]/20 px-2 py-1.5 text-xs capitalize hover:bg-[#FFF200]">{kind}</button>)}</div></div>
        <div><h3 className="text-sm font-bold">Unplaced shelves</h3><p className="my-1 text-xs text-[#003399]/60">Select a shelf to place it on this area.</p><select aria-label="Place existing shelf" className={input} value="" onChange={e=>{const s=data?.shelves.find(s=>s.id===Number(e.target.value));if(s)addObject('shelf',s.id,s.label)}}><option value="">Choose shelf…</option>{data?.shelves.filter(s=>!layout.objects.some(o=>o.shelfId===s.id)).map(s=><option key={s.id} value={s.id}>{s.label} ({s.bookCount+s.researchCount} items)</option>)}</select></div>
        <form onSubmit={e=>{e.preventDefault();void action(async()=>{const shelf=await floorRequest<{id:number;label:string;columnCount:number;rowCount:number}>('/shelves','POST',{label:newShelf});setData(d=>d?{...d,shelves:[...d.shelves,{...shelf,bookCount:0,researchCount:0}]}:d);setNewShelf('');addObject('shelf',shelf.id,shelf.label)})}}><label className="text-xs font-bold">New shelf label<input className={input} required maxLength={100} value={newShelf} onChange={e=>setNewShelf(e.target.value)} placeholder="Shelf F-A"/></label><Button type="submit" variant="secondary" disabled={busy||!newShelf.trim()} className="mt-2">Create shelf</Button></form>
        {object?<div className="space-y-3 border-t border-[#003399]/15 pt-4"><h3 className="font-bold">Selected: {object.kind}</h3><label className="block text-xs font-bold">Label<input className={input} value={object.label} maxLength={100} onChange={e=>updateObject({...object,label:e.target.value})}/></label><label className="block text-xs font-bold">Area / floor<select className={input} value={object.areaId} onChange={e=>moveObjectToArea(e.target.value)}>{layout.areas.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>{selectedShelf?<div className="rounded-xl bg-[#003399]/5 p-3"><p className="text-xs font-bold">Shelf compartments</p><p className="mt-1 text-[11px] text-[#003399]/60">Choose 1–12 columns and rows. Making the grid smaller is blocked while affected compartments contain assignments.</p><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs">Columns<input id="shelf-columns" className={input} type="number" min={1} max={12} defaultValue={selectedShelf.columnCount}/></label><label className="text-xs">Rows<input id="shelf-rows" className={input} type="number" min={1} max={12} defaultValue={selectedShelf.rowCount}/></label></div><Button variant="secondary" className="mt-2" onClick={()=>saveShelfGrid(Number((document.getElementById('shelf-columns') as HTMLInputElement)?.value),Number((document.getElementById('shelf-rows') as HTMLInputElement)?.value))}>Save shelf grid</Button></div>:null}<label className="block text-xs font-bold">Location note (optional)<textarea className={input} maxLength={300} value={object.note} onChange={e=>updateObject({...object,note:e.target.value})}/></label><div className="grid grid-cols-2 gap-2">{(['width','height','rotation'] as const).map(key=><label key={key} className="text-xs capitalize">{key}<input className={input} type="number" min={key==='rotation'?0:10} max={key==='rotation'?359:10000} value={object[key]} onChange={e=>updateObject({...object,[key]:Number(e.target.value)})}/></label>)}</div><Button variant="secondary" onClick={removeObject}>Remove from layout</Button></div>:null}
      </SectionCard>:null}
      <div className="min-w-0 space-y-4">
        <div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-bold">Area / floor<select className={input} value={area?.id??''} onChange={e=>{setAreaId(e.target.value);setSelected(null);setShelfFilter('')}}>{layout?.areas.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label className="text-xs font-bold">Find a book or shelf<input className={input} value={q} onChange={e=>{setQ(e.target.value);setShelfFilter('')}} placeholder="Title, author, ISBN, shelf…"/></label><label className="text-xs font-bold">Category<select className={input} value={category} onChange={e=>{setCategory(e.target.value);setShelfFilter('');setSelected(null)}}><option value="">All categories</option>{data?.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
        <div className="flex flex-wrap items-center gap-3"><Button variant="secondary" onClick={()=>{setQ('');setCategory('');setShelfFilter('');setUnmapped(false);setSelected(null);setTargetBook(null);setParams({})}}>Clear filters</Button>{titleId?<span className="text-xs font-semibold">Showing the selected book{copyId||barcode?' — assigned copy':''}</span>:null}{editor?<label className="text-xs"><input type="checkbox" checked={unmapped} onChange={e=>{setUnmapped(e.target.checked);setShelfFilter('')}}/> Books without a managed shelf</label>:null}</div>
        {area&&layout?<FloorMap area={area} objects={layout.objects} shelves={data?.shelves??[]} selectedId={selected} highlighted={q||category||titleId||shelfFilter?highlighted:new Set()} focused={targetBook?.shelfId?{shelfId:Number(targetBook.shelfId),column:targetBook.shelfColumn,row:targetBook.shelfRow}:null} editable={canEdit&&!busy} onSelect={select} onChange={updateObject}/>:null}
        {targetBook?<p role="status" className="rounded-xl bg-[#FFF200] p-3 text-sm font-semibold">Find <strong>{targetBook.title}</strong> at {targetBook.shelfLabel}, Column {targetBook.shelfColumn}, Row {targetBook.shelfRow}. Select the flashing shelf to open its books.</p>:null}
        {object?.note?<p className="rounded-xl bg-[#FFF200]/30 p-3 text-sm"><MapPin size={15} className="mr-1 inline"/>{object.label}: {object.note}</p>:null}
        <SectionCard className="p-4"><h2 className="font-bold">{object?.shelfId?`Books on ${object.label}`:'Book locations'}</h2><p className="mt-1 text-xs text-[#003399]/60">{books.total} copies found{books.total>100?' · Showing the first 100. Search or filter to narrow the list.':''}. Locations are assigned shelves; check availability before collecting a book.</p>
          {canEdit?<p className="my-3 rounded-xl bg-[#003399]/5 p-3 text-xs">To move books, edit their category shelf in <a className="font-bold underline" href="/admin/categories">Category Management</a>. The system will move every copy in that category together.</p>:null}
          {selectedShelf&&shelfFilter?<ShelfContents shelf={selectedShelf} books={books.items} target={targetBook}/>:<div className="mt-3 max-h-[440px] divide-y divide-[#003399]/10 overflow-y-auto">{books.items.map(book=>{
            const mapped=layout?.objects.find(o=>o.shelfId===Number(book.shelfId)),floor=layout?.areas.find(a=>a.id===mapped?.areaId)
            return <article key={book.copyId} className="flex items-center gap-3 py-3"><BookCoverThumbnail title={book.title} coverImagePath={book.coverPath} className="h-16 w-11 shrink-0 rounded-lg"/><div className="min-w-0 flex-1"><h3 className="text-sm font-bold">{book.title}</h3><p className="text-xs text-[#003399]/65">{book.author} · {book.categoryName??'Uncategorized'}</p><p className="mt-1 text-xs">{book.shelfLabel||'Shelf not recorded'} · Column {book.shelfColumn} · Row {book.shelfRow}{floor?` · ${floor.name}`:''} · {book.availability}</p><p className="font-mono text-[10px]">{book.callNumber||'Call number pending'}</p>{editor?<p className="text-[10px]">{book.barcode}</p>:null}{!mapped?<p className="mt-1 text-xs text-[#003399]/60">Map location not yet assigned. Please ask the librarian.</p>:null}</div>{mapped?<button className="rounded-xl border border-[#003399]/20 px-3 py-2 text-xs font-bold hover:bg-[#FFF200]" onClick={()=>{setAreaId(mapped.areaId);setSelected(mapped.id);setShelfFilter(String(mapped.shelfId))}}>Locate shelf</button>:null}</article>
          })}{!books.items.length?<p className="py-6 text-sm">No books match these filters.</p>:null}</div>}
        </SectionCard>
      </div>
    </div>
    {editor?<SectionCard className="mt-5 p-5"><h2 className="font-bold">Published layout history</h2><p className="mt-1 text-sm text-[#003399]/65">Restore opens an earlier layout as a draft. Current book assignments are retained; review before publishing. Save your current draft first.</p><div className="mt-3 flex flex-wrap gap-2"><select aria-label="Previous layout" className={`${input} max-w-lg`} value={versionId} onChange={e=>setVersionId(e.target.value)}><option value="">Select a published version</option>{versions.map(v=><option key={v.id} value={v.id}>Version {v.id} · {new Date(v.createdAt).toLocaleString()} · {v.publishedBy}</option>)}</select><Button variant="secondary" disabled={busy||dirty||!versionId} onClick={()=>void action(async()=>{await floorRequest(`/versions/${versionId}/restore`,'POST',{revision:data?.revision});await load();setNotice('Previous layout restored as a draft. Review it before publishing.')})}>Restore as draft</Button></div></SectionCard>:null}
  </>
}
