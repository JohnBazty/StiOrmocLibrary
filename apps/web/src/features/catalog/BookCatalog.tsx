import { RefreshCw, ShoppingBag, ListChecks } from 'lucide-react'

import { useMemo, useState } from 'react'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useBookReservations } from './useBookReservations'

import { Link, useSearchParams } from 'react-router-dom'

import { PageHeader } from '../../components/ui'

import { getCurrentIdentity } from '../auth/auth-storage'

import { BookOverview } from './BookOverview'

import { PublicCatalogPage } from './PublicCatalogPage'

import { fetchBookCatalog } from './book-catalog-api'

import { useBookCart } from './book-cart-store'

import { validateBookCartAddition } from './book-cart'

import type { BookCartItem } from './book-cart-store'

import type { BookCatalogViewer } from './book-catalog-types'

import type { CatalogRecord } from './enhanced-catalog-api'

/** Catalog selection stays local until the borrower reviews and submits the cart. */

export function BookCatalog() {

  const [params, setParams] = useSearchParams()

  const claims = getCurrentIdentity()

  const viewerQuery = useLiveQuery(`catalog-viewer:${claims?.userId ?? 'current'}`, signal => fetchBookCatalog({ signal, viewerOnly: true }))
  const viewer = viewerQuery.data?.viewer ?? { role: claims?.role ?? 'Student', activeBookCount: 0, bookLimit: claims?.role === 'Faculty' ? null : 2 }
  const viewerReady = Boolean(viewerQuery.data)
  const viewerError = viewerQuery.error?.message ?? ''
  const [refreshKey, setRefreshKey] = useState(0)
  const reservations = useBookReservations(() => { void viewerQuery.refresh() })

  const { items: cart, addItem } = useBookCart()

  const [error, setError] = useState('')

  const [notice, setNotice] = useState('')

  const titleId = Number(params.get('titleId'))

  const selectedTitleId = Number.isSafeInteger(titleId) && titleId > 0 ? titleId : null

  const cartBooks = useMemo(() => new Set(cart.map(item => item.titleId)), [cart])

  const base = viewer.role === 'Faculty' ? '/faculty' : '/student'

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

  function bookAction(book: CatalogRecord) {
    const id = Number(book.id), selected = cartBooks.has(id), unavailable = Number(book.available) === 0
    return <div className="space-y-2"><button onClick={() => unavailable ? void reservations.reserve({titleId:id,title:book.title}) : addBook(book)} disabled={Number(book.copyCount) === 0 || reservations.pending.has(id) || reservations.reserved.has(id) || (!unavailable && selected)} className="min-h-11 rounded-full bg-[#0b5ea2] px-3 py-2 text-white disabled:opacity-50">
      {Number(book.copyCount) === 0 ? 'Digital only' : reservations.reserved.has(id) ? 'Reserved' : reservations.pending.has(id) ? 'Reserving…' : unavailable ? 'Reserve book' : selected ? 'In cart' : 'Borrow book'}
    </button>{reservations.errors.has(id) && <p role="alert" className="text-xs text-red-700">{reservations.errors.get(id)}</p>}{reservations.reserved.has(id) && <p role="status" className="text-xs text-green-700">On the waiting list. We will notify you when a copy is ready.</p>}</div>
  }

  return <>

    <PageHeader eyebrow="My library" title="Library catalog" description="Add available books to your cart. Reserve unavailable books to join their waiting list. Borrowing begins at staff handover." action={<div className="flex flex-wrap items-center gap-2"><Link to={`${base}/reservations`} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#0b5ea2] px-3 text-xs font-bold text-white"><ListChecks size={16}/> Requests &amp; reservations</Link>{<Link to={`${base}/cart`} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#0b5ea2]/15 px-3 text-xs font-bold"><ShoppingBag size={16}/> Book cart ({cart.length})</Link>}<button onClick={() => { setError(''); void viewerQuery.refresh(); setRefreshKey(value => value + 1) }} aria-label="Refresh catalog" className="rounded-xl border border-[#0b5ea2]/15 p-2.5"><RefreshCw size={17}/></button></div>}/>

    <p className="mb-5 text-sm opacity-70">Available books: choose Borrow book, review your cart and send it to the desk. Unavailable books: reserve and wait for a copy.</p>
    {viewerError && <p role="status" className="mb-4 rounded-xl border border-[#0b5ea2]/15 p-3 text-sm">{viewerError} You can still choose books; eligibility will be checked when you submit. Use Refresh catalog to retry the check.</p>}
    {error && <p role="alert" className="auth-error mb-4 rounded-xl p-3 text-sm font-semibold">{error}</p>}

    {notice && <p role="status" className="mb-4 rounded-xl bg-[#0b5ea2] p-3 text-sm font-semibold text-white">{notice}</p>}
    {viewerReady && viewer.bookLimit !== null && viewer.activeBookCount >= viewer.bookLimit && <p className="mb-4 rounded-xl border border-[#0b5ea2]/15 p-3 text-sm">You can prepare a cart, but your active books and requests already fill your limit of {viewer.bookLimit}. Return a book or cancel an existing request before submitting another request.</p>}

    {viewer.bookLimit!==null && <p className="mb-5 text-xs font-semibold">{viewerReady ? `Active books + requests: ${viewer.activeBookCount} / ${viewer.bookLimit}` : viewerError ? 'Borrowing check unavailable. You can still choose books.' : 'Checking borrowing eligibility… You can choose books while this loads.'}</p>}

    <PublicCatalogPage embedded refreshKey={refreshKey} onViewBook={openBook} renderBookAction={bookAction}/>

    {selectedTitleId !== null && <BookOverview titleId={selectedTitleId} role={viewer.role} activeBookCount={viewerReady ? viewer.activeBookCount : 0} bookLimit={viewer.bookLimit} selectedBookCount={cart.length} alreadySelected={cartBooks.has(selectedTitleId)} alreadyReserved={reservations.reserved.has(selectedTitleId)} onAddToCart={selectBook} onReserve={book => void reservations.reserve(book)} requestDisabled={reservations.pending.has(selectedTitleId)} onClose={closeBook} requestError={reservations.errors.get(selectedTitleId) ?? error} requestNotice={reservations.reserved.has(selectedTitleId) ? 'Reserved. We will notify you when a copy is ready.' : notice}/>}

  </>

}
