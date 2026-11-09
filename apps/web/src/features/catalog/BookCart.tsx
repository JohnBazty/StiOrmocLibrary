import { ViewLocationButton } from '../floor-plan/ViewLocationButton'
import { BookOpen, CheckCircle2, Eye, MapPin, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PageHeader, SectionCard } from '../../components/ui'
import { BookCartApiError, fetchCartState, submitBorrowRequest, type BorrowRequestReceipt } from './book-cart-api'
import { useBookCart } from './book-cart-store'
import { BookDetailDrawer } from './BookDetailDrawer'
import { BookCoverThumbnail } from './BookCoverThumbnail'
import { fetchBookOverview } from './book-catalog-api'

export function BookCart() {
  const requestKey=useRef('')
  const selectionKey=useRef('')
  const saving=useRef(false)
  const { items, updateItem, removeItem, removeItems, clear } = useBookCart()
  const [syncNotice,setSyncNotice]=useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<BorrowRequestReceipt | null>(null)
  const [detailTitleId, setDetailTitleId] = useState<number | null>(null)
  const hydratedTitleIds = useRef(new Set<number>())
  const hasItems=items.length>0

  useEffect(()=>{
    if(!hasItems)return
    let active=true,running=false
    const refresh=async()=>{
      if(running||saving.current)return
      running=true
      try{
        const state=await fetchCartState()
        if(active&&!saving.current&&removeItems(state.activeTitleIds)>0){
          setSyncNotice('Removed books already requested or checked out. You can find them in My books or Borrowing history.')
          setDetailTitleId(null)
        }
      }catch{/* Keep local selections when the authoritative check is unavailable. */}
      finally{running=false}
    }
    void refresh()
    window.addEventListener('focus',refresh)
    const timer=window.setInterval(refresh,15000)
    return()=>{active=false;window.removeEventListener('focus',refresh);window.clearInterval(timer)}
  },[hasItems,removeItems])

  useEffect(() => {
    for (const item of items) {
      if (hydratedTitleIds.current.has(item.titleId)) continue
      hydratedTitleIds.current.add(item.titleId)
      void Promise.resolve(fetchBookOverview(item.titleId))
        .then((book) => {
          if (!book) return
          updateItem(item.titleId, {
            title: book.title,
            author: book.author,
            isbn: book.isbn,
            shelfLocation: book.shelfLocation,
            callNumber: book.callNumber,
            previewBarcode: book.previewBarcode,
            coverImagePath: book.coverImagePath,
          })
        })
        .catch(() => { /* Keep the locally saved cart record when refresh fails. */ })
    }
  }, [items, updateItem])

  async function submit() {
    if (!items.length || saving.current) return
    saving.current=true
    const selection=items.map(item=>item.titleId).sort((a,b)=>a-b).join(',')
    if(selection!==selectionKey.current){requestKey.current='';selectionKey.current=selection}
    setSubmitting(true); setError('')
    try {
      requestKey.current ||= crypto.randomUUID()
      const result = await submitBorrowRequest(items.map((item) => item.titleId),requestKey.current)
      requestKey.current=''
      clear()
      setReceipt(result)
    } catch (reason) {
      setError(reason instanceof BookCartApiError && reason.code === 'STUDENT_BORROW_LIMIT_REACHED'
        ? `${reason.message} Return a book or cancel an existing request, then try again. Your cart has been kept.`
        : reason instanceof Error ? reason.message : 'The borrow request could not be submitted.')
    } finally {
      saving.current=false; setSubmitting(false)
    }
  }

  return <>
    <PageHeader eyebrow="My library" title="Book cart" description="Review available books before sending them to the library desk. Your loan starts at staff handover." />
    <p className="mb-5 text-sm opacity-70">Send your cart to the desk, then bring the selected books to staff. Staff review and confirm the handover.</p>
    {syncNotice&&<p role="status" className="mb-4 rounded-xl border border-[#0b5ea2]/15 p-3 text-sm">{syncNotice}</p>}
    {error ? <div role="alert" className="mb-4 rounded-xl border border-[#0b5ea2] bg-[#FFF200] px-4 py-3 text-sm font-semibold text-[#0b5ea2]">{error}</div> : null}
    <SectionCard className="overflow-hidden">
      <div className="border-b border-[#0b5ea2]/15 px-5 py-4"><h2 className="font-display text-lg font-bold text-[#0b5ea2]">Review your selected books</h2></div>
      {items.length ? <div className="divide-y divide-[#0b5ea2]/10">{items.map((item) => <article key={item.titleId} className="grid gap-4 px-5 py-5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <BookCoverThumbnail title={item.title} coverImagePath={item.coverImagePath} className="h-20 w-14" />
        <div className="min-w-0"><h3 className="font-display font-bold text-[#0b5ea2]">{item.title}</h3><p className="mt-1 text-sm text-[#0b5ea2]/70">{item.author}</p><div className="mt-2 flex flex-wrap gap-3 text-xs text-[#0b5ea2]/65"><span>ISBN: {item.isbn ?? 'Not recorded'}</span><span className="inline-flex items-center gap-1 font-semibold"><MapPin size={13} />{item.shelfLocation ?? item.callNumber ?? 'Shelf pending'}</span></div></div>
        <div className="flex flex-wrap items-center gap-2"><ViewLocationButton titleId={item.titleId} availableOnly/><button type="button" onClick={() => setDetailTitleId(item.titleId)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0b5ea2] px-3 text-xs font-bold text-[#FFFFFF]"><Eye size={16} /> View details</button><button type="button" aria-label={`Remove ${item.title}`} disabled={submitting} onClick={() => removeItem(item.titleId)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#0b5ea2]/20 bg-[#FFFFFF] text-[#0b5ea2] transition hover:bg-[#FFF200]"><Trash2 size={17} /></button></div>
      </article>)}</div> : <div className="px-5 py-16 text-center"><BookOpen className="mx-auto text-[#0b5ea2]" size={30} /><h2 className="mt-3 font-display text-lg font-bold text-[#0b5ea2]">Your cart is empty</h2></div>}
      <div className="flex justify-end border-t border-[#0b5ea2]/15 bg-[#FFFFFF] px-5 py-4"><button type="button" disabled={!items.length || submitting} onClick={() => void submit()} className="h-11 rounded-xl bg-[#0b5ea2] px-6 text-sm font-bold text-[#FFFFFF] transition disabled:cursor-not-allowed disabled:bg-[#0b5ea2]/25 disabled:text-[#FFFFFF]">{submitting ? 'Submitting…' : 'Check Out'}</button></div>
    </SectionCard>

    {receipt ? <div role="dialog" aria-modal="true" aria-labelledby="borrow-confirmation-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0b5ea2]/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-[#0b5ea2]/15 bg-[#FFFFFF] shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#0b5ea2]/15 p-5"><div className="flex gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFF200] text-[#0b5ea2]"><CheckCircle2 size={22} /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0b5ea2]">Request submitted</p><h2 id="borrow-confirmation-title" className="mt-1 font-display text-xl font-bold text-[#0b5ea2]">Cart sent to library desk</h2></div></div><button aria-label="Close confirmation" onClick={() => setReceipt(null)} className="rounded-lg p-2 text-[#0b5ea2]"><X size={18} /></button></div>
        <div className="p-5"><p className="rounded-xl bg-[#FFF200] p-4 text-base font-bold text-[#0b5ea2]">{receipt.instructions}</p><p className="mt-4 text-sm text-[#0b5ea2]/70">These available books are awaiting staff handover. They are not in the reservation queue. Your loan starts only after staff confirm the physical handover.</p><div className="mt-4 space-y-2">{receipt.items.map(item=><div key={item.reservationId??item.titleId} className="flex items-center justify-between gap-2"><span className="text-sm font-bold">{item.title}{item.statusLabel?` · ${item.statusLabel}`:''}</span><ViewLocationButton titleId={item.titleId} copyId={item.physicalCopyId??undefined}/></div>)}</div><p className="mt-4 font-mono text-xs text-[#0b5ea2]/60">Request: {receipt.requestGroupId}</p></div>
        <div className="flex justify-end border-t border-[#0b5ea2]/15 p-4"><button onClick={() => setReceipt(null)} className="h-10 rounded-xl bg-[#0b5ea2] px-5 text-sm font-bold text-[#FFFFFF]">Done</button></div>
      </div>
    </div> : null}
    {detailTitleId !== null ? <BookDetailDrawer titleId={detailTitleId} barcode={items.find((item) => item.titleId === detailTitleId)?.previewBarcode ?? null} onClose={() => setDetailTitleId(null)} /> : null}
  </>
}
