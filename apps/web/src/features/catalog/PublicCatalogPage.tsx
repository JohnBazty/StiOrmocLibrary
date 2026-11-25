import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Button, NoticeBanner, SectionCard, StatusBadge } from '../../components/ui'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { getCurrentClaims } from '../auth/auth-storage'
import { resumeDeviceSession } from '../auth/auth-api'
import { BookAvailabilityInfo } from './BookAvailabilityInfo'
import { CatalogCover } from './CatalogCover'
import { PublicCatalogWelcome } from './PublicCatalogWelcome'
import { enhancedCatalog, type CatalogRecord, type Options } from './enhanced-catalog-api'
import { CatalogDetailsPanel, catalogInput } from './CatalogDetailsPanel'
type Props = {
 embedded?: boolean
 restoreDevice?: boolean
 suppressAnchorScroll?: boolean
 refreshKey?: number
 onViewBook?: (id: number) => void
 renderBookAction?: (book: CatalogRecord) => ReactNode
}
export function PublicCatalogPage({embedded=false,restoreDevice=false,suppressAnchorScroll=false,refreshKey=0,onViewBook,renderBookAction}:Props){
 const location=useLocation()
 const [params,setParams]=useSearchParams(),[options,setOptions]=useState<Options|null>(null),[items,setItems]=useState<CatalogRecord[]>([]),[total,setTotal]=useState(0),[detail,setDetail]=useState<CatalogRecord|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true)
 const lastScrolledAnchor=useRef('')
 const [,setDeviceRevision] = useState(0)
 useEffect(() => {
   if (!restoreDevice) return
   let active = true
   const resume = () => {
     if (document.visibilityState === 'hidden' || getCurrentClaims()) return
     void resumeDeviceSession().then(identity => { if (active && identity) setDeviceRevision(value => value + 1) }).catch(() => {})
   }
   resume()
   window.addEventListener('focus', resume)
   window.addEventListener('online', resume)
   document.addEventListener('visibilitychange', resume)
   return () => {
     active = false
     window.removeEventListener('focus', resume)
     window.removeEventListener('online', resume)
     document.removeEventListener('visibilitychange', resume)
   }
 }, [restoreDevice])
 useEffect(()=>{if(embedded||suppressAnchorScroll)return;if(!['#home','#catalog','#categories'].includes(location.hash)){lastScrolledAnchor.current='';return}if(!loading&&lastScrolledAnchor.current!==location.hash){document.getElementById(location.hash.slice(1))?.scrollIntoView?.({block:'start'});lastScrolledAnchor.current=location.hash}},[embedded,suppressAnchorScroll,location.hash,loading])
 const claims=getCurrentClaims(),page=Number(params.get('page')||1)
 const heading=params.get('kind')==='Book'?'All Books':params.get('kind')==='Research/Thesis'?'All Research & Theses':'All Books & Research'
 useEffect(()=>{let active=true;enhancedCatalog.options().then(o=>{if(active)setOptions(o)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[])
 const query=params.toString()
  useEffect(()=>{
    let active=true,running=false
    const filters=new URLSearchParams(query);filters.delete('titleId');filters.delete('request')
    setLoading(true);setError('')
    const load=async()=>{if(running)return;running=true;try{const result=await enhancedCatalog.search(filters);if(active){setItems(result.items);setTotal(result.pagination.total);setError('')}}catch(cause){if(active)setError(cause instanceof Error?cause.message:'Catalog could not be refreshed.')}finally{running=false;if(active)setLoading(false)}}
    void load()
    const refresh=()=>{if(!document.hidden)void load()}
    const timer=window.setInterval(refresh,30_000)
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh)
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}
  },[query,refreshKey])
 const change=(field:string,value:string)=>{const next=new URLSearchParams(params);if(value)next.set(field,value);else next.delete(field);if(field!=='page')next.delete('page');setParams(next)}
 async function open(id:number){const entry=items.find(book=>Number(book.id)===id);if(onViewBook&&entry?.kind==='Book'&&Number(entry.copyCount)>0){onViewBook(id);return}setError('');try{setDetail(await enhancedCatalog.detail(id))}catch(e){setError(e instanceof Error?e.message:'Unable to load this title.')}}
 const detailId=detail?.id
  useEffect(()=>{
    if(!detailId)return
    let active=true,running=false
    const refresh=async()=>{if(document.hidden||running)return;running=true;try{const value=await enhancedCatalog.detail(detailId);if(active)setDetail(value)}catch(cause){if(active)setError(cause instanceof Error?cause.message:'Book details could not be refreshed.')}finally{running=false}}
    const changed=()=>{void refresh()},timer=window.setInterval(changed,30_000)
    window.addEventListener('focus',changed);document.addEventListener('visibilitychange',changed)
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',changed);document.removeEventListener('visibilitychange',changed)}
  },[detailId])
  const requestLink=(book:CatalogRecord)=>claims&&['Student','Faculty'].includes(claims.role)?`/${claims.role.toLowerCase()}/library?titleId=${book.id}&request=1`:`/login?catalogTitleId=${book.id}`
 const content=<>
 {!embedded&&<PublicCatalogWelcome role={claims?.role} query={params.get('q')??''} categories={options?.categories??[]} selectedCategory={params.get('categoryId')??''} total={total} loading={loading} onSearch={value=>change('q',value)} onCategory={value=>change('categoryId',value)}/>}
 <section id="catalog" className={embedded?'space-y-6':'scroll-mt-16 px-5 py-8 sm:px-8'}>
 <div className={embedded?'space-y-6':'mx-auto max-w-7xl space-y-5'}>
 <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
  <div>{embedded&&!onViewBook?<h1 className="font-display text-2xl font-bold tracking-tight text-[var(--sl-text-header)]">{heading}</h1>:<h2 className="font-display text-2xl font-bold tracking-tight text-[var(--sl-text-header)]">{heading}</h2>}<p className="mt-1 text-sm text-[var(--sl-text-secondary)]">Browse our complete library collection.</p></div>
  {embedded&&<label className="relative flex w-full items-center sm:w-72"><Search size={16} className="pointer-events-none absolute left-3.5 text-[var(--sl-text-muted)]" aria-hidden="true"/><span className="sr-only">Search title, author or ISBN</span><input className="sl-input !pl-10 pr-3" value={params.get('q')??''} onChange={e=>change('q',e.target.value)} placeholder="Search catalog..."/></label>}
 </header>
 {error&&<NoticeBanner tone="error">{error}</NoticeBanner>}
 <details className="rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] px-4 py-3 shadow-[var(--sl-shadow-xs)]">
  <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-[var(--sl-text-header)]"><SlidersHorizontal size={15} className="text-[#0b5ea2] dark:text-[#93c5fd]"/>Filter collection<span className="ml-auto font-normal tabular-nums text-[var(--sl-text-muted)]">{loading?'Loading catalog…':total+' entries'}</span></summary>
  <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3 lg:grid-cols-5">
   <label className="font-semibold text-[var(--sl-text-header)]">Collection<select className={catalogInput} value={params.get('kind')??''} onChange={e=>change('kind',e.target.value)}><option value="">Books & research</option><option value="Book">Books</option><option value="Research/Thesis">Research / thesis</option></select></label>
   {(['categoryId','programId','courseId','typeId'] as const).map((field,index)=>{const list=options?.[(['categories','programs','courses','types'] as const)[index]]??[];return <label key={field} className="font-semibold text-[var(--sl-text-header)]">{['Category','Program','Course','Resource type'][index]}<select className={catalogInput} value={params.get(field)??''} onChange={e=>{if(field==='programId'){const next=new URLSearchParams(params);next.delete('courseId');next.delete('page');if(e.target.value)next.set(field,e.target.value);else next.delete(field);setParams(next)}else change(field,e.target.value)}}><option value="">All</option>{list.filter(o=>field!=='courseId'||!params.get('programId')||Number(o.programId)===Number(params.get('programId'))).map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>})}
  </div>
 </details>
 <p role="status" className="sr-only">{loading?'Loading catalog…':total+' catalog entries'}</p>
 <div className="catalog-cover-grid grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{items.map(book=>{
  const available=book.kind==='Book'&&Number(book.available)>0
  const noCopies=book.kind==='Book'&&Number(book.copyCount)===0
  const status=book.kind!=='Book'?'Library viewing':available?'Available':'Unavailable'
  const statusTone=book.kind!=='Book'?'info':available?'success':noCopies?'error':'warning'
  return <article key={book.id} className="group flex min-w-0 flex-col overflow-hidden rounded-[12px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] shadow-[var(--sl-shadow-xs)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0b5ea2]/40 hover:shadow-[var(--sl-shadow-m)]">
   <button onClick={()=>void open(Number(book.id))} aria-label={'View '+book.title+' details'} className="flex w-full items-center justify-center border-b border-[var(--sl-border)]/70 bg-gradient-to-b from-[#f0f7ff] to-[#f8fafc] px-4 py-5 focus-visible:outline-2 focus-visible:outline-offset-[-2] focus-visible:outline-[#0b5ea2] dark:from-[#1b283b] dark:to-[#1a2232]">
    <div className="transition-transform duration-200 group-hover:-translate-y-1 group-hover:scale-[1.03]">
     <CatalogCover title={book.title} src={book.coverImagePath} author={book.author} research={book.kind==='Research/Thesis'?{department:book.department,publicationYear:book.publicationYear}:undefined} className="h-40 w-28 rounded-[6px] shadow-[0_8px_18px_-4px_rgba(19,42,63,0.28)] sm:h-44 sm:w-32"/>
    </div>
   </button>
   <div className="flex flex-1 flex-col p-3.5">
    <div className="flex flex-wrap items-center justify-between gap-1.5">
     <StatusBadge status={status} tone={statusTone}/>
     {book.kind==='Research/Thesis'&&book.publicationYear?<span className="text-[11px] font-semibold tabular-nums text-[var(--sl-text-muted)]">{book.publicationYear}</span>:null}
    </div>
    <h3 className="mt-2.5 min-h-[2.5rem] text-sm font-semibold leading-5 text-[var(--sl-text-header)]"><button onClick={()=>void open(Number(book.id))} title={book.title} className="line-clamp-2 text-left hover:text-[#0b5ea2] hover:underline dark:hover:text-[#93c5fd]">{book.title}</button></h3>
    <p className="mt-1 truncate text-xs text-[var(--sl-text-secondary)]" title={book.author}>{book.author||'Author not recorded'}</p>
    {book.kind==='Research/Thesis'&&book.department?<p className="mt-1 truncate text-[11px] font-medium text-[#0f766e] dark:text-[#5eead4]">{book.department}</p>:null}
    {book.kind==='Book'&&<p className="mt-2 text-xs text-[var(--sl-text-muted)]">Copies: <strong className="font-semibold tabular-nums text-[var(--sl-text-header)]">{Number(book.available)}</strong> of {Number(book.copyCount)} available</p>}
    {book.kind==='Book'&&<BookAvailabilityInfo available={Number(book.available)} total={Number(book.copyCount)} borrowed={Number(book.borrowed??0)} reserved={Number(book.reserved??0)} />}
    <div className="mt-auto space-y-2 border-t border-[var(--sl-border)] pt-3 text-xs font-semibold">
     {book.kind==='Book'&&(renderBookAction?renderBookAction(book):Number(book.copyCount)>0&&<Link className="inline-flex min-h-9 w-full items-center justify-center rounded-[6px] bg-[#0b5ea2] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#094e87]" to={requestLink(book)} state={{catalogLocation:location}}>{Number(book.available)>0?'Borrow book':'Reserve book'}</Link>)}
     <button onClick={()=>void open(Number(book.id))} className="inline-flex min-h-8 w-full items-center justify-center rounded-[6px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/55 px-2.5 py-1.5 text-xs font-semibold text-[#0b5ea2] transition-colors hover:bg-[#0b5ea2]/10 dark:text-[#93c5fd]">View details</button>
    </div>
   </div>
  </article>
 })}</div>
 {!loading&&!items.length&&!error&&<SectionCard className="p-8 text-center"><p className="text-sm font-medium text-[var(--sl-text-secondary)]">No catalog entries match these filters.</p>{['q','kind','categoryId','programId','courseId','typeId'].some(key=>Boolean(params.get(key)))?<Button variant="secondary" size="sm" className="mt-4" onClick={()=>{const next=new URLSearchParams(params);for(const key of ['q','kind','categoryId','programId','courseId','typeId','page'])next.delete(key);setParams(next)}}>Clear filters</Button>:null}</SectionCard>}
 <div className="flex items-center justify-center gap-3"><Button variant="secondary" size="sm" disabled={page<=1||loading} onClick={()=>change('page',String(page-1))}>Previous</Button><span className="text-xs font-semibold tabular-nums text-[var(--sl-text-secondary)]">Page {page}</span><Button variant="secondary" size="sm" disabled={page*24>=total||loading} onClick={()=>change('page',String(page+1))}>Next</Button></div></div></section>
 {detail&&<div role="dialog" aria-modal="true" aria-labelledby="public-book-title" className="sl-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-[#132a3f]/65 p-3 backdrop-blur-[3px] sm:p-6"><button className="absolute inset-0" aria-label="Close catalog details" onClick={()=>setDetail(null)}/><section className="sl-book-modal-in relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[16px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text)] shadow-2xl"><header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--sl-border)] px-5 py-4 sm:px-7"><div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0f766e] dark:text-[#5eead4]">{detail.kind==='Research/Thesis'?'Research & thesis':'Catalog details'}</p><h2 id="public-book-title" className="mt-0.5 font-display text-lg font-bold text-[var(--sl-text-header)] sm:text-xl">{detail.title}</h2></div><button aria-label="Close details" onClick={()=>setDetail(null)} className="rounded-[8px] border border-[var(--sl-border-strong)] p-2 text-[var(--sl-text-secondary)] hover:bg-[var(--sl-bg-hover)]"><X size={18}/></button></header><div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_310px] lg:overflow-hidden"><div className="min-w-0 p-5 sm:p-7 lg:overflow-y-auto"><p className="text-sm font-medium text-[var(--sl-text-secondary)]">{detail.author}</p><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/45 p-3"><dt className="text-[11px] font-semibold uppercase text-[var(--sl-text-muted)]">ISBN</dt><dd className="mt-0.5 font-semibold text-[var(--sl-text-header)]">{detail.isbn||'Not recorded'}</dd></div><div className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/45 p-3"><dt className="text-[11px] font-semibold uppercase text-[var(--sl-text-muted)]">Publication year</dt><dd className="mt-0.5 font-semibold text-[var(--sl-text-header)]">{detail.publicationYear??'Not recorded'}</dd></div><div className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/45 p-3"><dt className="text-[11px] font-semibold uppercase text-[var(--sl-text-muted)]">Publisher</dt><dd className="mt-0.5 font-semibold text-[var(--sl-text-header)]">{detail.publisher||'Not recorded'}</dd></div><div className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/45 p-3"><dt className="text-[11px] font-semibold uppercase text-[var(--sl-text-muted)]">Category</dt><dd className="mt-0.5 font-semibold text-[var(--sl-text-header)]">{detail.category||'Not recorded'}</dd></div></dl>{detail.abstract&&<p className="mt-4 whitespace-pre-wrap rounded-[8px] bg-[var(--sl-bg-subtle)] p-4 text-sm leading-relaxed text-[var(--sl-text)]">{detail.abstract}</p>}<CatalogDetailsPanel titleId={Number(detail.id)}/>{detail.kind==='Book'&&<BookAvailabilityInfo available={Number(detail.available)} total={Number(detail.copyCount)} borrowed={Number(detail.borrowed??0)} reserved={Number(detail.reserved??0)} />}<h3 className="mt-5 font-display text-sm font-semibold text-[var(--sl-text-header)]">Individual physical copies</h3>{detail.copies.length?<div className="mt-3 overflow-hidden rounded-[8px] border border-[var(--sl-border)]"><ResponsiveTable label="Individual physical copies"><table className="w-full text-left text-xs"><thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]"><tr><th scope="col" className="px-3 py-2.5">Accession</th><th scope="col" className="px-3 py-2.5">Status &amp; condition</th><th scope="col" className="px-3 py-2.5">Shelf / Dewey</th></tr></thead><tbody className="divide-y divide-[var(--sl-border)]">{detail.copies.map(copy=><tr key={copy.id}><td className="px-3 py-2.5 font-semibold text-[var(--sl-text-header)]">{copy.accession}</td><td className="px-3 py-2.5 text-[var(--sl-text-secondary)]">{copy.availability} · {copy.condition}</td><td className="px-3 py-2.5 text-[var(--sl-text-secondary)]"><span className="block">Shelf: {copy.shelf}</span>{detail.kind==='Book'&&<span className="text-[11px] text-[var(--sl-text-muted)]">Dewey: {copy.deweyCode??'Not assigned'} {copy.deweyDescription}</span>}</td></tr>)}</tbody></table></ResponsiveTable></div>:<p className="mt-2 text-sm text-[var(--sl-text-muted)]">No active physical copies recorded.</p>}{detail.kind==='Book'&&(renderBookAction?<div className="mt-5">{renderBookAction(detail)}</div>:Number(detail.copyCount)>0&&<Link className="mt-5 inline-flex min-h-10 items-center justify-center rounded-[6px] bg-[#0b5ea2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#094e87]" to={requestLink(detail)} state={{catalogLocation:location}}>{Number(detail.available)>0?'Borrow book':'Reserve book'}</Link>)}</div><aside className="relative flex flex-col items-center justify-center border-t border-[var(--sl-border)] bg-gradient-to-br from-[#132a3f] via-[#0b5ea2] to-[#0f766e] p-6 text-white lg:border-l lg:border-t-0"><div className="sl-book-pop"><CatalogCover key={detail.id} title={detail.title} src={detail.coverImagePath} author={detail.author} research={detail.kind==='Research/Thesis'?{department:detail.department,publicationYear:detail.publicationYear}:undefined} className="h-64 w-44 rounded-[10px] border-2 border-white/25 shadow-[0_24px_45px_-12px_rgba(7,20,36,0.65)] sm:h-72 sm:w-48"/></div></aside></div></section></div>}
 </>
 return embedded?<div className="text-[var(--sl-text)]">{content}</div>:<main className="min-h-screen bg-[var(--sl-bg)] text-[var(--sl-text)]">{content}</main>
}
