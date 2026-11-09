import { RefreshCw, ShoppingBag, ListChecks } from 'lucide-react'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { Link, useSearchParams } from 'react-router-dom'

import { PageHeader } from '../../components/ui'

import { getCurrentIdentity } from '../auth/auth-storage'

import { BookOverview } from './BookOverview'

import { PublicCatalogPage } from './PublicCatalogPage'

import { fetchBookCatalog, reserveBookTitle } from './book-catalog-api'

import { useBookCart } from './book-cart-store'

import { validateBookCartAddition } from './book-cart'

import type { BookCartItem } from './book-cart-store'

import type { BookCatalogViewer } from './book-catalog-types'

import type { CatalogRecord } from './enhanced-catalog-api'

/** Catalog selection stays local until the borrower reviews and submits the cart. */

export function BookCatalog() {

  const [params, setParams] = useSearchParams()

  const claims = getCurrentIdentity()

  const [viewer, setViewer] = useState<BookCatalogViewer>({ role: claims?.role ?? 'Student', activeBookCount: 0, bookLimit: claims?.role === 'Faculty' ? null : 2 })

  const [viewerReady, setViewerReady] = useState(false)

  const [refreshKey, setRefreshKey] = useState(0)

  const [viewerError, setViewerError] = useState('')

  const { items: cart, addItem } = useBookCart()

  const [error, setError] = useState('')

  const [notice, setNotice] = useState('')
  const [reserving, setReserving] = useState<number|null>(null)
  const [reserved, setReserved] = useState<Set<number>>(new Set())

  const titleId = Number(params.get('titleId'))

  const selectedTitleId = Number.isSafeInteger(titleId) && titleId > 0 ? titleId : null

  const cartBooks = useMemo(() => new Set(cart.map(item => item.titleId)), [cart])

  const base = viewer.role === 'Faculty' ? '/faculty' : '/student'

  const loadViewer = useCallback(async (signal?: AbortSignal) => {

    try {

      const result = await fetchBookCatalog({ signal })

      if (!signal?.aborted) { setViewer(result.viewer); setViewerReady(true); setViewerError('') }

    } catch (reason) {

      if (!signal?.aborted) {

        setViewerReady(false)

        setViewerError(reason instanceof Error ? reason.message : 'Borrowing checks are temporarily unavailable.')

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

    next.set('titleId', String(id)); setParams(next)

  }

  function closeBook() {

    const next = new URLSearchParams(params)

    next.delete('titleId'); next.delete('request'); setParams(next, { replace: true })

  }

  function selectBook(book: BookCartItem) {

    const validation = validateBookCartAddition({role: viewer.role, activeBookCount: viewerReady ? viewer.activeBookCount : 0, selectedBookCount: cart.length, alreadySelected: cartBooks.has(book.titleId), bookLimit: viewer.bookLimit})

    if (!validation.allowed) { setError(validation.message ?? 'Your book limit has been reached.'); return }

    addItem(book); setError(''); setNotice(`${book.title} added to your cart. Review your cart before submitting.`)

  }

  function addBook(book: CatalogRecord) {
    selectBook({titleId:Number(book.id),title:book.title,author:book.author || 'Author not recorded',isbn:book.isbn ?? null,coverImagePath:book.coverImagePath ?? null,shelfLocation:null,callNumber:null,previewBarcode:null})
  }

  async function reserveBook(book: { titleId: number; title: string }) {
    if (reserving !== null) return
    setReserving(book.titleId); setError(''); setNotice('')
    try {
      await reserveBookTitle(book.titleId, crypto.randomUUID())
      setReserved(previous => new Set(previous).add(book.titleId))
      setNotice(`${book.title} reserved. You are on the waiting list. We will notify you when a copy is ready.`)
      setRefreshKey(value => value + 1); void loadViewer()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The book could not be reserved.') }
    finally { setReserving(null) }
  }

  function bookAction(book: CatalogRecord) {
    const id = Number(book.id), selected = cartBooks.has(id), unavailable = Number(book.available) === 0
    return <button onClick={() => unavailable ? void reserveBook({titleId:id,title:book.title}) : addBook(book)} disabled={Number(book.copyCount) === 0 || reserving !== null || reserved.has(id) || (!unavailable && selected)} className="min-h-11 rounded-full bg-[#003399] px-3 py-2 text-white disabled:opacity-50">
      {Number(book.copyCount) === 0 ? 'Digital only' : reserved.has(id) ? 'Reserved' : reserving === id ? 'Reserving…' : unavailable ? 'Reserve book' : selected ? 'In cart' : 'Borrow book'}
    </button>
  }

  return <>

    <PageHeader eyebrow="My library" title="Library catalog" description="Add available books to your cart. Reserve unavailable books to join their waiting list. Borrowing begins at staff handover." action={<div className="flex flex-wrap items-center gap-2"><Link to={`${base}/reservations`} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#003399] px-3 text-xs font-bold text-white"><ListChecks size={16}/> Requests &amp; reservations</Link>{<Link to={`${base}/cart`} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#003399]/15 px-3 text-xs font-bold"><ShoppingBag size={16}/> Book cart ({cart.length})</Link>}<button onClick={() => { setError(''); void loadViewer(); setRefreshKey(value => value + 1) }} aria-label="Refresh catalog" className="rounded-xl border border-[#003399]/15 p-2.5"><RefreshCw size={17}/></button></div>}/>

    <p className="mb-5 text-sm opacity-70">Available books: choose Borrow book, review your cart and send it to the desk. Unavailable books: reserve and wait for a copy.</p>
    {viewerError && <p role="status" className="mb-4 rounded-xl border border-[#003399]/15 p-3 text-sm">{viewerError} You can still choose books; eligibility will be checked when you submit. Use Refresh catalog to retry the check.</p>}
    {error && <p role="alert" className="auth-error mb-4 rounded-xl p-3 text-sm font-semibold">{error}</p>}

    {notice && <p role="status" className="mb-4 rounded-xl bg-[#003399] p-3 text-sm font-semibold text-white">{notice}</p>}
    {viewerReady && viewer.bookLimit !== null && viewer.activeBookCount >= viewer.bookLimit && <p className="mb-4 rounded-xl border border-[#003399]/15 p-3 text-sm">You can prepare a cart, but your active books and requests already fill your limit of {viewer.bookLimit}. Return a book or cancel an existing request before submitting another request.</p>}

    {viewer.bookLimit!==null && <p className="mb-5 text-xs font-semibold">{viewerReady ? `Active books + requests: ${viewer.activeBookCount} / ${viewer.bookLimit}` : viewerError ? 'Borrowing check unavailable. You can still choose books.' : 'Checking borrowing eligibility… You can choose books while this loads.'}</p>}

    <PublicCatalogPage embedded refreshKey={refreshKey} onViewBook={openBook} renderBookAction={bookAction}/>

    {selectedTitleId !== null && <BookOverview titleId={selectedTitleId} role={viewer.role} activeBookCount={viewerReady ? viewer.activeBookCount : 0} bookLimit={viewer.bookLimit} selectedBookCount={cart.length} alreadySelected={cartBooks.has(selectedTitleId)} alreadyReserved={reserved.has(selectedTitleId)} onAddToCart={selectBook} onReserve={book => void reserveBook(book)} requestDisabled={reserving !== null} onClose={closeBook} requestError={error} requestNotice={notice}/>}

  </>

}
