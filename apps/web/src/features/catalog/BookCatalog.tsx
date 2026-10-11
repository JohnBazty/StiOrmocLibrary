import { RefreshCw, ShoppingBag } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../components/ui'
import { getCurrentIdentity } from '../auth/auth-storage'
import { BookOverview } from './BookOverview'
import { PublicCatalogPage } from './PublicCatalogPage'
import { fetchBookCatalog, fetchBookOverview, reserveBookTitle } from './book-catalog-api'
import { validateBookCartAddition } from './book-cart'
import { useBookCart } from './book-cart-store'
import type { BookCatalogItem, BookCatalogViewer } from './book-catalog-types'
import type { CatalogRecord } from './enhanced-catalog-api'
import { assertCatalogItemCanEnterLoanCart } from './catalog-cart-policy'

/** One authenticated catalog: browsing and borrowing use the same collection. */
export function BookCatalog() {
  const [params, setParams] = useSearchParams()
  const claims = getCurrentIdentity()
  const [viewer, setViewer] = useState<BookCatalogViewer>({ role: claims?.role ?? 'Student', activeBookCount: 0, bookLimit: 2 })
  const [viewerReady, setViewerReady] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [busyId, setBusyId] = useState<number | null>(null)
  const actionPending = useRef(false)
  const { items: cart, addItem } = useBookCart()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const titleId = Number(params.get('titleId'))
  const selectedTitleId = Number.isSafeInteger(titleId) && titleId > 0 ? titleId : null
  const cartBooks = useMemo(() => new Set(cart.map(item => item.titleId)), [cart])

  const loadViewer = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await fetchBookCatalog({ signal })
      if (!signal?.aborted) { setViewer(result.viewer); setViewerReady(true) }
    } catch (reason) {
      if (!signal?.aborted) {
        setViewerReady(false)
        setError(reason instanceof Error ? reason.message : 'Borrowing eligibility is unavailable. Please refresh.')
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void loadViewer(controller.signal)
    const refresh = () => { void loadViewer(controller.signal); setRefreshKey(value => value + 1) }
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(refresh, 15_000)
    return () => { controller.abort(); window.removeEventListener('focus', refresh); window.clearInterval(timer) }
  }, [loadViewer])

  function openBook(id: number) {
    setError(''); setNotice('')
    const next = new URLSearchParams(params)
    next.set('titleId', String(id))
    setParams(next)
  }
  function closeBook() {
    const next = new URLSearchParams(params)
    next.delete('titleId'); next.delete('request')
    setParams(next, { replace: true })
  }
  function addToCart(book: BookCatalogItem) {
    if (!viewerReady) return
    assertCatalogItemCanEnterLoanCart({ catalogType: 'Book', id: book.titleId })
    const validation = validateBookCartAddition({ role: viewer.role, activeBookCount: viewer.activeBookCount, selectedBookCount: cart.length, alreadySelected: cartBooks.has(book.titleId), bookLimit: viewer.bookLimit })
    setNotice('')
    if (!validation.allowed) { setError(validation.message ?? 'This book cannot be added to the cart.'); return }
    if (book.availableCopiesCount <= 0) { setError('This book is no longer available. Reserve it to join the waiting list.'); return }
    addItem(book)
    setError('')
    setNotice(validation.message ?? `${book.title} was added to your borrow cart.`)
  }
  async function reserve(book: BookCatalogItem) {
    if (viewer.bookLimit !== null && viewer.activeBookCount >= viewer.bookLimit) {
      throw new Error(`Reservation blocked: you already have ${viewer.activeBookCount} active book commitments. Cancel a waiting request or return a book before reserving another.`)
    }
    const result = await reserveBookTitle(book.titleId)
    setNotice(`Reservation submitted. You are number ${result.queuePosition} in the queue.`)
    await loadViewer()
    setRefreshKey(value => value + 1)
  }
  async function requestBook(id: number, reservationOnly = false) {
    if (actionPending.current || !viewerReady) return
    actionPending.current = true
    setBusyId(id); setError(''); setNotice('')
    try {
      // Recheck the authenticated record; grid stock can change while browsing.
      const book = await fetchBookOverview(id)
      if (book.availableCopiesCount > 0 && !reservationOnly) addToCart(book)
      else if (book.availableCopiesCount > 0) throw new Error('This book is now available. Add it to your borrow cart.')
      else if (reservationOnly) await reserve(book)
      else {
        openBook(id)
        setRefreshKey(value => value + 1)
        throw new Error('This book is no longer available for immediate borrowing. Choose Reserve book in its details to join the waiting list.')
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The book request could not be completed.')
    } finally { actionPending.current = false; setBusyId(null) }
  }
  function bookAction(book: CatalogRecord) {
    const selected = cartBooks.has(Number(book.id))
    const available = Number(book.available) > 0
    return <button onClick={() => void requestBook(Number(book.id), !available)} disabled={!viewerReady || busyId !== null || selected || Number(book.copyCount) === 0} className={`min-h-11 rounded-full px-3 py-2 disabled:opacity-50 ${available ? 'bg-[#003399] text-white' : 'bg-[#FFF200] text-[#003399]'}`}>
      {busyId === Number(book.id) ? 'Please wait…' : selected ? 'In cart' : Number(book.copyCount) === 0 ? 'Digital only' : available ? 'Borrow book' : 'Reserve book'}
    </button>
  }

  return <>
    <PageHeader eyebrow="My library" title="Library catalog" description="Discover books and research, view details, and request a book from one place." action={<div className="flex items-center gap-2"><Link to={viewer.role === 'Faculty' ? '/faculty/cart' : '/student/cart'} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#003399]/15 bg-white px-3 text-xs font-bold text-[#003399]"><ShoppingBag size={16} /> Book cart ({cart.length})</Link><button onClick={() => { setError(''); void loadViewer(); setRefreshKey(value => value + 1) }} aria-label="Refresh catalog" className="rounded-xl border border-[#003399]/15 bg-white p-2.5 text-[#003399]"><RefreshCw size={17} /></button></div>} />
    {error && <p role="alert" className="mb-4 rounded-xl bg-[#b42318] p-3 text-sm font-semibold text-white">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-xl bg-[#003399] p-3 text-sm font-semibold text-white">{notice}</p>}
    {viewer.role === 'Student' && <p className="mb-5 text-xs font-semibold text-[#003399]/65 dark:text-white/65">{viewerReady ? `Active + selected: ${viewer.activeBookCount + cart.length} / 2` : 'Checking borrowing eligibility…'}</p>}
    <PublicCatalogPage embedded refreshKey={refreshKey} onViewBook={openBook} renderBookAction={bookAction} />
    {selectedTitleId !== null && <BookOverview titleId={selectedTitleId} role={viewer.role} activeBookCount={viewer.activeBookCount} selectedBookCount={cart.length} alreadySelected={cartBooks.has(selectedTitleId)} onAddToCart={addToCart} onClose={closeBook} onReserve={book => void requestBook(book.titleId, true)} requestDisabled={!viewerReady || busyId !== null} requestError={error} requestNotice={notice} />}
  </>
}
