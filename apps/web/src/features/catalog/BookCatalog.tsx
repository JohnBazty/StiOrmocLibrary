import { BookOpen, ChevronLeft, ChevronRight, Eye, RefreshCw, ShoppingBag } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, SectionCard } from '../../components/ui'
import { getCurrentClaims } from '../auth/auth-storage'
import { BookOverview } from './BookOverview'
import { fetchBookCatalog, reserveBookTitle } from './book-catalog-api'
import { catalogActionLabel, validateBookCartAddition } from './book-cart'
import { useBookCart } from './book-cart-store'
import type { BookCatalogItem, BookCatalogViewer, Pagination } from './book-catalog-types'
import { CategoryFilterSearchBar } from './CategoryFilterSearchBar'
import { assertCatalogItemCanEnterLoanCart } from './catalog-cart-policy'

const EMPTY_PAGINATION: Pagination = { page: 1, limit: 24, total: 0, totalPages: 0 }

function AvailabilityBadge({ status }: { status: string }) {
  const style = status === 'Available'
    ? 'bg-[#003399] text-[#FFFFFF]'
    : status === 'Reserved'
      ? 'bg-[#FFF200] text-[#003399]'
      : 'border border-[#003399]/15 bg-[#FFFFFF] text-[#003399]/55'
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${style}`}>{status}</span>
}

export function BookCatalog() {
  const claims = getCurrentClaims()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [books, setBooks] = useState<BookCatalogItem[]>([])
  const [viewer, setViewer] = useState<BookCatalogViewer>({ role: claims?.role ?? 'Student', activeBookCount: 0, bookLimit: 2 })
  const [pagination, setPagination] = useState(EMPTY_PAGINATION)
  const [selectedTitleId, setSelectedTitleId] = useState<number | null>(null)
  const { items: cart, addItem } = useBookCart()
  const [loading, setLoading] = useState(true)
  const [reserving, setReserving] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedQuery(query.trim()); setPage(1) }, 250)
    return () => window.clearTimeout(timer)
  }, [query])

  const loadBooks = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError('')
    try {
      const result = await fetchBookCatalog({ query: debouncedQuery, categoryId: categoryId ?? undefined, page, signal })
      setBooks(result.items.filter((book) => book.currentAvailabilityStatus !== 'Unavailable'))
      setViewer(result.viewer)
      setPagination(result.pagination)
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : 'The catalog could not be loaded.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [categoryId, debouncedQuery, page])

  useEffect(() => {
    const controller = new AbortController()
    void loadBooks(controller.signal)
    return () => controller.abort()
  }, [loadBooks])

  useEffect(() => {
    const refresh = () => void loadBooks()
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(refresh, 15_000)
    return () => { window.removeEventListener('focus', refresh); window.clearInterval(timer) }
  }, [loadBooks])

  const cartBooks = useMemo(() => new Set(cart.map((item) => item.titleId)), [cart])
  const addToCart = (book: BookCatalogItem) => {
    assertCatalogItemCanEnterLoanCart({ catalogType: 'Book', id: book.titleId })
    const validation = validateBookCartAddition({ role: viewer.role, activeBookCount: viewer.activeBookCount, selectedBookCount: cart.length, alreadySelected: cartBooks.has(book.titleId) })
    if (!validation.allowed) { setNotice(''); setError(validation.message ?? 'This book cannot be added to the cart.'); return }
    if (!cartBooks.has(book.titleId)) addItem(book)
    setError('')
    setNotice(validation.message ?? `${book.title} was added to your borrow cart.`)
  }
  const reserve = async (book: BookCatalogItem) => {
    if (viewer.role === 'Student' && viewer.bookLimit !== null && viewer.activeBookCount >= viewer.bookLimit) {
      setNotice('')
      setError(`Reservation blocked: you already have ${viewer.activeBookCount} active book commitments. Cancel a waiting request or return a book before reserving another.`)
      return
    }
    setReserving(book.titleId); setError(''); setNotice('')
    try {
      const reservation = await reserveBookTitle(book.titleId)
      setNotice(`Reservation submitted. You are number ${reservation.queuePosition} in the queue.`)
      await loadBooks()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The reservation could not be submitted.')
    } finally { setReserving(null) }
  }

  return (
    <>
      <PageHeader eyebrow="Digital catalog" title="Book catalog" action={<div className="flex items-center gap-2"><Link to={viewer.role === 'Faculty' ? '/faculty/cart' : '/student/cart'} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#003399]/15 bg-[#FFFFFF] px-3 text-xs font-bold text-[#003399]"><ShoppingBag size={16} /> Cart {cart.length}</Link><button onClick={() => void loadBooks()} aria-label="Refresh catalog" className="rounded-xl border border-[#003399]/15 bg-[#FFFFFF] p-2.5 text-[#003399]"><RefreshCw size={17} /></button></div>} />

      {error ? <div role="alert" className="mb-4 rounded-xl border border-[#003399] bg-[#FFF200] p-3 text-sm font-semibold text-[#003399]">{error}</div> : null}
      {notice ? <div role="status" className="mb-4 rounded-xl bg-[#003399] p-3 text-sm font-semibold text-[#FFFFFF]">{notice}</div> : null}

      <SectionCard className="mb-5 p-4 sm:p-5">
        <CategoryFilterSearchBar
          query={query}
          selectedCategoryId={categoryId}
          onQueryChange={setQuery}
          onCategoryChange={(nextCategoryId) => { setCategoryId(nextCategoryId); setPage(1) }}
        />
      </SectionCard>

      <div className="mb-4 flex items-center justify-between"><p className="text-sm font-bold text-[#003399]">{pagination.total} books found</p>{viewer.role === 'Student' ? <p className="text-xs font-semibold text-[#003399]/65">Active + selected: {viewer.activeBookCount + cart.length} / 2</p> : null}</div>

      {loading && books.length === 0 ? <SectionCard className="p-16 text-center text-sm font-semibold text-[#003399]">Loading catalog…</SectionCard> : null}
      {!loading && books.length === 0 ? <SectionCard className="p-16 text-center"><BookOpen className="mx-auto text-[#003399]" size={30} /><p className="mt-3 font-display text-lg font-bold text-[#003399]">No books match these filters</p></SectionCard> : null}

      <div className="grid gap-4 lg:grid-cols-2">{books.map((book) => {
        const action = catalogActionLabel(book.availableCopiesCount)
        return <SectionCard key={book.titleId} className="p-4 sm:p-5"><div className="flex flex-col gap-4 sm:flex-row"><div className="flex h-24 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#003399] text-[#FFF200] sm:w-20">{book.coverImagePath ? <img src={book.coverImagePath} alt={`${book.title} cover`} className="h-full w-full object-cover" /> : <BookOpen size={28} />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-display text-lg font-bold leading-tight text-[#003399]">{book.title}</h2><p className="mt-1 text-sm text-[#003399]/70">{book.author}</p></div><AvailabilityBadge status={book.currentAvailabilityStatus} /></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#003399]/65"><span>{book.publicationYear ?? 'Year not recorded'}</span><span className="font-mono">{book.callNumber ?? book.shelfLocation ?? 'Shelf pending'}</span><span className="font-bold text-[#003399]">Copies: {book.availableCopiesCount} of {book.totalCopiesCount} available</span></div></div></div><div className="mt-4 flex gap-2"><button onClick={() => setSelectedTitleId(book.titleId)} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-[#003399]/15 bg-[#FFFFFF] text-sm font-bold text-[#003399]"><Eye size={16} /> View details</button>{action === 'Borrow' ? <button onClick={() => addToCart(book)} disabled={cartBooks.has(book.titleId)} className="h-10 flex-1 rounded-xl bg-[#003399] text-sm font-bold text-[#FFFFFF] disabled:opacity-50">{cartBooks.has(book.titleId) ? 'In cart' : 'Borrow'}</button> : <button onClick={() => void reserve(book)} disabled={reserving === book.titleId} className="h-10 flex-1 rounded-xl bg-[#FFF200] text-sm font-bold text-[#003399] disabled:opacity-50">{reserving === book.titleId ? 'Reserving…' : 'Reserve'}</button>}</div></SectionCard>
      })}</div>

      {pagination.totalPages > 1 ? <nav className="mt-5 flex items-center justify-center gap-3" aria-label="Catalog pages"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-xl border border-[#003399]/15 p-2 text-[#003399] disabled:opacity-40"><ChevronLeft size={18} /></button><span className="text-xs font-bold text-[#003399]">Page {page} of {pagination.totalPages}</span><button disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-xl border border-[#003399]/15 p-2 text-[#003399] disabled:opacity-40"><ChevronRight size={18} /></button></nav> : null}

      {selectedTitleId !== null ? <BookOverview titleId={selectedTitleId} role={viewer.role} activeBookCount={viewer.activeBookCount} selectedBookCount={cart.length} alreadySelected={cartBooks.has(selectedTitleId)} onAddToCart={addToCart} onClose={() => setSelectedTitleId(null)} /> : null}
    </>
  )
}
