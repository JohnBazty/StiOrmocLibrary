import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Button, SectionCard } from '../../components/ui'
import { getCurrentClaims } from '../auth/auth-storage'
import { CatalogCover } from './CatalogCover'
import { PublicCatalogWelcome } from './PublicCatalogWelcome'
import { enhancedCatalog, type CatalogRecord, type Options } from './enhanced-catalog-api'
import { CatalogDetailsPanel, catalogInput } from './CatalogDetailsPanel'
type Props = {
 embedded?: boolean
 refreshKey?: number
 onViewBook?: (id: number) => void
 renderBookAction?: (book: CatalogRecord) => ReactNode
}
export function PublicCatalogPage({embedded=false,refreshKey=0,onViewBook,renderBookAction}:Props){
 const location=useLocation()
 const [params,setParams]=useSearchParams(),[options,setOptions]=useState<Options|null>(null),[items,setItems]=useState<CatalogRecord[]>([]),[total,setTotal]=useState(0),[detail,setDetail]=useState<CatalogRecord|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true)
 const lastScrolledAnchor=useRef('')
 useEffect(()=>{if(embedded)return;if(!['#home','#catalog','#categories'].includes(location.hash)){lastScrolledAnchor.current='';return}if(!loading&&lastScrolledAnchor.current!==location.hash){document.getElementById(location.hash.slice(1))?.scrollIntoView?.({block:'start'});lastScrolledAnchor.current=location.hash}},[embedded,location.hash,loading])
 const claims=getCurrentClaims(),page=Number(params.get('page')||1)
 const heading=params.get('kind')==='Book'?'All Books':params.get('kind')==='Research/Thesis'?'All Research & Theses':'All Books & Research'
 useEffect(()=>{let active=true;enhancedCatalog.options().then(o=>{if(active)setOptions(o)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[])
 const query=params.toString()
 useEffect(()=>{let active=true;setLoading(true);setError('');const filters=new URLSearchParams(query);filters.delete('titleId');filters.delete('request');enhancedCatalog.search(filters).then(r=>{if(active){setItems(r.items);setTotal(r.pagination.total)}}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[query,refreshKey])
 const change=(field:string,value:string)=>{const next=new URLSearchParams(params);if(value)next.set(field,value);else next.delete(field);if(field!=='page')next.delete('page');setParams(next)}
 async function open(id:number){const entry=items.find(book=>Number(book.id)===id);if(onViewBook&&entry?.kind==='Book'&&Number(entry.copyCount)>0){onViewBook(id);return}setError('');try{setDetail(await enhancedCatalog.detail(id))}catch(e){setError(e instanceof Error?e.message:'Unable to load this title.')}}
 const requestLink=(book:CatalogRecord)=>claims&&['Student','Faculty'].includes(claims.role)?`/${claims.role.toLowerCase()}/library?titleId=${book.id}&request=1`:`/login?catalogTitleId=${book.id}`
 const content=<>
 {!embedded&&<PublicCatalogWelcome role={claims?.role} query={params.get('q')??''} categories={options?.categories??[]} selectedCategory={params.get('categoryId')??''} onSearch={value=>change('q',value)} onCategory={value=>change('categoryId',value)}/>}
 <section id="catalog" className={embedded?'space-y-6':'scroll-mt-6 px-5 py-10 sm:px-8'} style={embedded?undefined:{backgroundImage:'radial-gradient(color-mix(in srgb, currentColor 15%, transparent) 0.8px, transparent 0.8px)',backgroundSize:'22px 22px'}}>
 <div className={embedded?'space-y-6':'mx-auto max-w-7xl space-y-6'}>
 <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
  <div>{embedded&&!onViewBook?<h1 className="font-display text-2xl font-black tracking-tight">{heading}</h1>:<h2 className="font-display text-2xl font-black tracking-tight">{heading}</h2>}<p className="mt-1 text-sm text-[#003399]/65 dark:text-white/65">Browse our complete library collection.</p></div>
  {embedded&&<label className="flex w-full items-center gap-2 rounded-full border border-[#003399]/15 bg-white px-4 py-2.5 shadow-sm sm:w-72 dark:border-white/20 dark:bg-[#001a4d]"><Search size={16} className="shrink-0 opacity-50"/><span className="sr-only">Search title, author or ISBN</span><input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#003399]/50 dark:placeholder:text-white/50" value={params.get('q')??''} onChange={e=>change('q',e.target.value)} placeholder="Search catalog..."/></label>}
 </header>
 {error&&<p role="alert" className="rounded-xl bg-[#b42318] p-3 text-white">{error}</p>}
 <details className="rounded-xl border border-[#003399]/10 bg-white/80 px-4 py-3 dark:border-white/15 dark:bg-[#001a4d]/80">
  <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-bold"><SlidersHorizontal size={15}/>Filter collection<span className="ml-auto font-normal opacity-65">{loading?'Loading catalog…':total+' entries'}</span></summary>
  <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3 lg:grid-cols-5">
   <label>Collection<select className={catalogInput} value={params.get('kind')??''} onChange={e=>change('kind',e.target.value)}><option value="">Books & research</option><option value="Book">Books</option><option value="Research/Thesis">Research / thesis</option></select></label>
   {(['categoryId','programId','courseId','typeId'] as const).map((field,index)=>{const list=options?.[(['categories','programs','courses','types'] as const)[index]]??[];return <label key={field}>{['Category','Program','Course','Resource type'][index]}<select className={catalogInput} value={params.get(field)??''} onChange={e=>{if(field==='programId'){const next=new URLSearchParams(params);next.delete('courseId');next.delete('page');if(e.target.value)next.set(field,e.target.value);else next.delete(field);setParams(next)}else change(field,e.target.value)}}><option value="">All</option>{list.filter(o=>field!=='courseId'||!params.get('programId')||Number(o.programId)===Number(params.get('programId'))).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>})}
  </div>
 </details>
 <p role="status" className="sr-only">{loading?'Loading catalog…':total+' catalog entries'}</p>
 <div className="catalog-cover-grid grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5 lg:gap-6">{items.map(book=>{
  const available=book.kind==='Book'&&Number(book.available)>0
  const status=book.kind!=='Book'?'Library viewing':available?'Available':'Unavailable'
  return <article key={book.id} className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#003399]/10 bg-white shadow-sm transition-shadow hover:shadow-lg dark:border-white/15 dark:bg-[#001a4d]">
   <button onClick={()=>void open(Number(book.id))} aria-label={'View '+book.title+' details'} className="block w-full focus-visible:outline-2 focus-visible:outline-offset-[-2] focus-visible:outline-[#003399]"><CatalogCover title={book.title} src={book.coverImagePath} flush className="aspect-[3/4] w-full"/></button>
   <div className="flex flex-1 flex-col p-3">
    <p className={'flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide '+(available?'text-[#007f62] dark:text-[#62dcc0]':book.kind==='Book'?'text-[#ad5900] dark:text-[#ffc06c]':'text-[#003399] dark:text-white')}><span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"/>{status}</p>
    <h3 className="mt-2 line-clamp-2 min-h-10 text-sm font-bold leading-5"><button onClick={()=>void open(Number(book.id))} className="text-left hover:underline">{book.title}</button></h3>
    <p className="mt-1 truncate text-xs text-[#003399]/60 dark:text-white/60" title={book.author}>{book.author||'Author not recorded'}</p>
    {book.kind==='Book'&&<p className="mt-2 text-[11px] font-semibold text-[#003399]/75 dark:text-white/75">Copies: <strong className="text-[#003399] dark:text-white">{Number(book.available)}</strong> of {Number(book.copyCount)} available</p>}
    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-[11px] font-bold"><button onClick={()=>void open(Number(book.id))} className="inline-flex min-h-11 items-center py-1 hover:underline">View details</button>{book.kind==='Book'&&(renderBookAction?renderBookAction(book):Number(book.copyCount)>0&&<Link className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#003399] px-3 py-2 text-white hover:bg-[#003399]/85" to={requestLink(book)} state={{catalogLocation:location}}>Borrow book</Link>)}</div>
   </div>
  </article>
 })}</div>
 {!loading&&!items.length&&!error&&<SectionCard className="p-8 text-center">No catalog entries match these filters.</SectionCard>}
 <div className="flex items-center justify-center gap-3"><Button variant="secondary" disabled={page<=1||loading} onClick={()=>change('page',String(page-1))}>Previous</Button><span>Page {page}</span><Button variant="secondary" disabled={page*24>=total||loading} onClick={()=>change('page',String(page+1))}>Next</Button></div></div></section>
 {detail&&<div role="dialog" aria-modal="true" aria-labelledby="public-book-title" className="fixed inset-0 z-50 flex justify-end bg-[#003399]/50"><button className="absolute inset-0" aria-label="Close catalog details" onClick={()=>setDetail(null)}/><section className="relative h-full w-full max-w-2xl overflow-auto bg-white p-6 text-[#003399] dark:bg-[#001a4d] dark:text-white"><header className="flex justify-between gap-3"><h2 id="public-book-title" className="text-2xl font-bold">{detail.title}</h2><button aria-label="Close details" onClick={()=>setDetail(null)}><X/></button></header><CatalogCover key={detail.id} title={detail.title} src={detail.coverImagePath} className="mt-5 h-72"/><p className="mt-3">{detail.author}</p><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="font-bold">ISBN</dt><dd>{detail.isbn||'Not recorded'}</dd></div><div><dt className="font-bold">Publication year</dt><dd>{detail.publicationYear??'Not recorded'}</dd></div><div><dt className="font-bold">Publisher</dt><dd>{detail.publisher||'Not recorded'}</dd></div><div><dt className="font-bold">Category</dt><dd>{detail.category||'Not recorded'}</dd></div></dl>{detail.abstract&&<p className="mt-4 whitespace-pre-wrap text-sm">{detail.abstract}</p>}<CatalogDetailsPanel titleId={Number(detail.id)}/><h3 className="mt-5 font-bold">Individual physical copies</h3><div className="mt-3 space-y-2">{detail.copies.map(copy=><div key={copy.id} className="rounded-xl border p-3 text-sm"><strong>{copy.accession}</strong><p>{copy.availability} · {copy.condition}</p><p>Shelf: {copy.shelf}</p></div>)}{!detail.copies.length&&<p>No active physical copies recorded.</p>}</div>{detail.kind==='Book'&&(renderBookAction?renderBookAction(detail):Number(detail.copyCount)>0&&<Link className="mt-5 inline-block rounded-xl bg-[#003399] px-4 py-3 font-bold text-white" to={requestLink(detail)} state={{catalogLocation:location}}>Borrow this book</Link>)}</section></div>}
 </>
 return embedded?<div className="text-[#003399] dark:text-white">{content}</div>:<main className="min-h-screen bg-[#f6f8ff] text-[#003399] dark:bg-[#000d2b] dark:text-white">{content}</main>
}
