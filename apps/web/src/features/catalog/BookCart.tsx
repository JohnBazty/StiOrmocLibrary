import { BookOpen, CheckCircle2, Eye, MapPin, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PageHeader, SectionCard } from '../../components/ui'
import { submitBorrowRequest, type BorrowRequestReceipt } from './book-cart-api'
import { useBookCart } from './book-cart-store'
import { BookDetailDrawer } from './BookDetailDrawer'
import { BookCoverThumbnail } from './BookCoverThumbnail'
import { fetchBookOverview } from './book-catalog-api'

export function BookCart() {
  const { items, updateItem, removeItem, clear } = useBookCart()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<BorrowRequestReceipt | null>(null)
  const [detailTitleId, setDetailTitleId] = useState<number | null>(null)
  const hydratedTitleIds = useRef(new Set<number>())

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
    if (!items.length || submitting) return
    setSubmitting(true); setError('')
    try {
      const result = await submitBorrowRequest(items.map((item) => item.titleId))
      clear()
      setReceipt(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The borrow request could not be submitted.')
    } finally {
      setSubmitting(false)
    }
  }

  return <>
    <PageHeader eyebrow="My library" title="Book cart" />
    {error ? <div role="alert" className="mb-4 rounded-xl border border-[#003399] bg-[#FFF200] px-4 py-3 text-sm font-semibold text-[#003399]">{error}</div> : null}
    <SectionCard className="overflow-hidden">
      <div className="border-b border-[#003399]/15 px-5 py-4"><h2 className="font-display text-lg font-bold text-[#003399]">Books selected for checkout</h2></div>
      {items.length ? <div className="divide-y divide-[#003399]/10">{items.map((item) => <article key={item.titleId} className="grid gap-4 px-5 py-5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <BookCoverThumbnail title={item.title} coverImagePath={item.coverImagePath} className="h-20 w-14" />
        <div className="min-w-0"><h3 className="font-display font-bold text-[#003399]">{item.title}</h3><p className="mt-1 text-sm text-[#003399]/70">{item.author}</p><div className="mt-2 flex flex-wrap gap-3 text-xs text-[#003399]/65"><span>ISBN: {item.isbn ?? 'Not recorded'}</span><span className="inline-flex items-center gap-1 font-semibold"><MapPin size={13} />{item.shelfLocation ?? item.callNumber ?? 'Shelf pending'}</span></div></div>
        <div className="flex items-center gap-2"><button type="button" onClick={() => setDetailTitleId(item.titleId)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#003399] px-3 text-xs font-bold text-[#FFFFFF]"><Eye size={16} /> View details</button><button type="button" aria-label={`Remove ${item.title}`} onClick={() => removeItem(item.titleId)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#003399]/20 bg-[#FFFFFF] text-[#003399] transition hover:bg-[#FFF200]"><Trash2 size={17} /></button></div>
      </article>)}</div> : <div className="px-5 py-16 text-center"><BookOpen className="mx-auto text-[#003399]" size={30} /><h2 className="mt-3 font-display text-lg font-bold text-[#003399]">Your cart is empty</h2></div>}
      <div className="flex justify-end border-t border-[#003399]/15 bg-[#FFFFFF] px-5 py-4"><button type="button" disabled={!items.length || submitting} onClick={() => void submit()} className="h-11 rounded-xl bg-[#003399] px-6 text-sm font-bold text-[#FFFFFF] transition disabled:cursor-not-allowed disabled:bg-[#003399]/25 disabled:text-[#FFFFFF]">{submitting ? 'Submitting…' : 'Submit Borrow Request'}</button></div>
    </SectionCard>

    {receipt ? <div role="dialog" aria-modal="true" aria-labelledby="borrow-confirmation-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-[#003399]/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-[#003399]/15 bg-[#FFFFFF] shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#003399]/15 p-5"><div className="flex gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFF200] text-[#003399]"><CheckCircle2 size={22} /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#003399]">Request submitted</p><h2 id="borrow-confirmation-title" className="mt-1 font-display text-xl font-bold text-[#003399]">Books held for counter claim</h2></div></div><button aria-label="Close confirmation" onClick={() => setReceipt(null)} className="rounded-lg p-2 text-[#003399]"><X size={18} /></button></div>
        <div className="p-5"><p className="rounded-xl bg-[#FFF200] p-4 text-base font-bold text-[#003399]">Go to the library to claim and confirm books.</p><p className="mt-4 text-sm text-[#003399]/70">Bring your school ID. A librarian will scan each assigned barcode before the loan and 8:59 AM due-time rule become active.</p><p className="mt-4 font-mono text-xs text-[#003399]/60">Request: {receipt.requestGroupId}</p></div>
        <div className="flex justify-end border-t border-[#003399]/15 p-4"><button onClick={() => setReceipt(null)} className="h-10 rounded-xl bg-[#003399] px-5 text-sm font-bold text-[#FFFFFF]">Done</button></div>
      </div>
    </div> : null}
    {detailTitleId !== null ? <BookDetailDrawer titleId={detailTitleId} barcode={items.find((item) => item.titleId === detailTitleId)?.previewBarcode ?? null} onClose={() => setDetailTitleId(null)} /> : null}
  </>
}
