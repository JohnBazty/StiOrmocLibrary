import { CalendarDays, RefreshCw, ShoppingBag, ListChecks } from 'lucide-react'

import { useEffect, useMemo, useState } from 'react'
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
import { fetchCartState } from './book-cart-api'
import { TitleAlreadyActiveDialog } from './TitleAlreadyActiveDialog'
import { ConfirmBookActionDialog } from './ConfirmBookActionDialog'

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

  const [activeTitleIds, setActiveTitleIds] = useState<number[] | null>(null)

  const [heldTitle, setHeldTitle] = useState<string | null>(null)

  const [waitingTitle, setWaitingTitle] = useState<string | null>(null)
  const [confirmBook, setConfirmBook] = useState<{ kind: 'borrow' | 'reserve'; book: CatalogRecord } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCartState()
      .then(state => { if (!cancelled) setActiveTitleIds(state.activeTitleIds) })
      .catch(() => { if (!cancelled) setActiveTitleIds(null) })
    return () => { cancelled = true }
  }, [refreshKey])

  const titleId = Number(params.get('titleId'))

  const selectedTitleId = Number.isSafeInteger(titleId) && titleId > 0 ? titleId : null

  const cartBooks = useMemo(() => new Set(cart.map(item => item.titleId)), [cart])

  const base = viewer.role === 'Faculty' ? '/faculty' : '/student'

  function openBook(id: number, schedule = false) {

    setError(''); setNotice('')

    const next = new URLSearchParams(params)

    next.set('titleId', String(id)); if(schedule)next.set('schedule','1');else next.delete('schedule'); setParams(next)

  }

  function closeBook() {

    const next = new URLSearchParams(params)

    next.delete('titleId'); next.delete('request'); next.delete('schedule'); setParams(next, { replace: true })

  }

  function holdIfAlreadyActive(titleId: number, title: string) {
    if (!activeTitleIds?.includes(titleId)) return false
    setError(''); setNotice(''); setHeldTitle(title)
    return true
  }

  function selectBook(book: BookCartItem) {
    if (holdIfAlreadyActive(book.titleId, book.title)) return

    const validation = validateBookCartAddition({role: viewer.role, activeBookCount: viewerReady ? viewer.activeBookCount : 0, selectedBookCount: cart.length, alreadySelected: cartBooks.has(book.titleId), bookLimit: viewer.bookLimit})

    if (!validation.allowed) { setError(validation.message ?? 'Your book limit has been reached.'); return }

    addItem(book); setError(''); setNotice(`${book.title} added to your cart. Review your cart before submitting.`)

  }

  async function reserveBook(book: { titleId: number; title: string }) {
    if (holdIfAlreadyActive(book.titleId, book.title)) return
    if (await reservations.reserve(book)) setWaitingTitle(book.title)
  }

  function addBook(book: CatalogRecord) {
    selectBook({titleId:Number(book.id),title:book.title,author:book.author || 'Author not recorded',isbn:book.isbn ?? null,coverImagePath:book.coverImagePath ?? null,shelfLocation:null,callNumber:null,previewBarcode:null})
  }

  function bookAction(book: CatalogRecord) {
    const id = Number(book.id), selected = cartBooks.has(id), unavailable = Number(book.available) === 0
    return <div className="space-y-2"><div className="flex items-center gap-1.5"><button onClick={() => { if (holdIfAlreadyActive(id, book.title)) return; setConfirmBook({ kind: unavailable ? 'reserve' : 'borrow', book }) }} disabled={Number(book.copyCount) === 0 || reservations.pending.has(id) || reservations.reserved.has(id) || (!unavailable && selected)} className="min-h-11 min-w-0 flex-1 rounded-full bg-[#0b5ea2] px-2 py-2 text-sm text-white disabled:opacity-50">
      {Number(book.copyCount) === 0 ? 'No copies available' : reservations.reserved.has(id) ? 'Reserved' : reservations.pending.has(id) ? 'Reserving…' : unavailable ? 'Reserve book' : selected ? 'In cart' : 'Borrow book'}
    </button>{Number(book.copyCount)>0?<button type="button" aria-label={`Schedule borrowing for ${book.title}`} title="Schedule borrowing" onClick={()=>{if(!holdIfAlreadyActive(id,book.title))openBook(id,true)}} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#0b5ea2]/25 text-[#0b5ea2] hover:bg-[#0b5ea2]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5ea2]"><CalendarDays size={18} aria-hidden="true"/></button>:null}</div>{reservations.errors.has(id) && <p role="alert" className="text-xs text-red-700">{reservations.errors.get(id)}</p>}</div>
  }

  return <>

    <PageHeader eyebrow="My library" title="Library catalog" description="Add available books to your cart. Reserve unavailable books to join their waiting list. Borrowing begins at staff handover." action={<div className="flex flex-wrap items-center gap-2"><Link to={`${base}/reservations`} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#0b5ea2] px-3 text-xs font-bold text-white"><ListChecks size={16}/> Requests &amp; reservations</Link>{<Link to={`${base}/cart`} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#0b5ea2]/15 px-3 text-xs font-bold"><ShoppingBag size={16}/> Book cart ({cart.length})</Link>}<button onClick={() => { setError(''); void viewerQuery.refresh(); setRefreshKey(value => value + 1) }} aria-label="Refresh catalog" className="rounded-xl border border-[#0b5ea2]/15 p-2.5"><RefreshCw size={17}/></button></div>}/>

    <p className="mb-5 text-sm opacity-70">Available books: choose Borrow book, review your cart and send it to the desk. Unavailable books: reserve and wait for a copy.</p>
    {viewerError && <p role="status" className="mb-4 rounded-xl border border-[#0b5ea2]/15 p-3 text-sm">{viewerError} You can still choose books; eligibility will be checked when you submit. Use Refresh catalog to retry the check.</p>}
    {error && <p role="alert" className="auth-error mb-4 rounded-xl p-3 text-sm font-semibold">{error}</p>}

    {notice && <p role="status" className="mb-4 rounded-xl bg-[#0b5ea2] p-3 text-sm font-semibold text-white">{notice}</p>}
    {viewerReady && viewer.bookLimit !== null && viewer.activeBookCount >= viewer.bookLimit && <p className="mb-4 rounded-xl border border-[#0b5ea2]/15 p-3 text-sm">You can prepare a cart, but your active books and requests already fill your limit of {viewer.bookLimit}. Return a book or cancel an existing request before submitting another request.</p>}

    {viewer.bookLimit!==null && <p className="mb-5 text-xs font-semibold">{viewerReady ? `Active books + requests: ${viewer.activeBookCount} / ${viewer.bookLimit}` : viewerError ? 'Borrowing check unavailable. You can still choose books.' : 'Checking borrowing eligibility… You can choose books while this loads.'}</p>}

    <div className={cart.length ? 'pb-20' : undefined}><PublicCatalogPage embedded refreshKey={refreshKey} onViewBook={openBook} renderBookAction={bookAction}/></div>

    {cart.length > 0 && <Link to={`${base}/cart`} aria-label={`Review book cart, ${cart.length} ${cart.length === 1 ? 'book' : 'books'}`} className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-30 inline-flex min-h-12 -translate-x-1/2 items-center gap-3 rounded-full bg-[#0b5ea2] px-5 py-3 text-sm font-semibold text-white shadow-lg ring-2 ring-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#0b5ea2] sm:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] sm:left-auto sm:right-6 sm:translate-x-0 dark:ring-[#20212b]">
      <ShoppingBag aria-hidden="true" size={20} /><span>Review cart</span><span aria-hidden="true" className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#FFF200] px-1.5 text-xs font-bold tabular-nums text-[#0b5ea2]">{cart.length}</span>
    </Link>}

    {selectedTitleId !== null && <BookOverview scheduleOnOpen={params.get('schedule')==='1'} titleId={selectedTitleId} role={viewer.role} activeBookCount={viewerReady ? viewer.activeBookCount : 0} bookLimit={viewer.bookLimit} selectedBookCount={cart.length} alreadySelected={cartBooks.has(selectedTitleId)} alreadyReserved={reservations.reserved.has(selectedTitleId)} onAddToCart={selectBook} onReserve={book => void reserveBook(book)} requestDisabled={reservations.pending.has(selectedTitleId)} onClose={closeBook} requestError={reservations.errors.get(selectedTitleId) ?? error} requestNotice={notice}/>}
    {confirmBook ? <ConfirmBookActionDialog kind={confirmBook.kind} title={confirmBook.book.title} onCancel={() => setConfirmBook(null)} onConfirm={() => { const choice = confirmBook; setConfirmBook(null); if (choice.kind === 'borrow') addBook(choice.book); else void reserveBook({ titleId: Number(choice.book.id), title: choice.book.title }) }} /> : null}
    {heldTitle ? <TitleAlreadyActiveDialog titles={[heldTitle]} onClose={() => setHeldTitle(null)} /> : null}
    {waitingTitle ? <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#0b5ea2]/60 p-4"><section role="dialog" aria-modal="true" aria-labelledby="waiting-list-title" className="w-full max-w-md rounded-2xl bg-white p-6 text-[#0b5ea2] shadow-2xl"><h2 id="waiting-list-title" className="font-display text-xl font-bold">On the waiting list</h2><p className="mt-3 text-sm leading-6">We will notify you when a copy of {waitingTitle} is ready.</p><div className="mt-5 flex justify-end"><button type="button" autoFocus onClick={() => setWaitingTitle(null)} className="h-11 rounded-xl bg-[#0b5ea2] px-5 text-sm font-bold text-white">OK</button></div></section></div> : null}

  </>

}
