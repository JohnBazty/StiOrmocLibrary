import { CalendarDays, RefreshCw, ShoppingBag, ListChecks } from 'lucide-react'

import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { useBookReservations } from './useBookReservations'

import { Link, useSearchParams } from 'react-router-dom'

import { Button, LumoDialog, NoticeBanner } from '../../components/ui'

import { getCurrentIdentity } from '../auth/auth-storage'
import { useLibraryOpenStatus } from '../notifications/useLibraryOpenStatus'

import { BookOverview } from './BookOverview'

import { PublicCatalogPage } from './PublicCatalogPage'

import { fetchBookCatalog } from './book-catalog-api'

import { useBookCart } from './book-cart-store'

import { validateBookCartAddition } from './book-cart'
import { fetchCartState } from './book-cart-api'
import { TitleAlreadyActiveDialog } from './TitleAlreadyActiveDialog'
import { ConfirmBookActionDialog } from './ConfirmBookActionDialog'
import { FlyToCartOverlay, triggerFlyToCart } from './FlyToCartAnimation'

import type { BookCartItem } from './book-cart-store'

import type { BookCatalogViewer } from './book-catalog-types'

import type { CatalogRecord } from './enhanced-catalog-api'

/** Catalog selection stays local until the borrower reviews and submits the cart. */

export function BookCatalog() {

  const [params, setParams] = useSearchParams()

  const claims = getCurrentIdentity()
  const libraryStatus = useLibraryOpenStatus()
  const libraryClosed = libraryStatus.closed

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
  const [outstandingBalance, setOutstandingBalance] = useState<number>(0)

  const [heldTitle, setHeldTitle] = useState<string | null>(null)

  const [waitingTitle, setWaitingTitle] = useState<string | null>(null)
  const [confirmBook, setConfirmBook] = useState<{ kind: 'borrow' | 'reserve'; book: CatalogRecord } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchCartState()
      .then(state => {
        if (!cancelled) {
          setActiveTitleIds(state.activeTitleIds)
          setOutstandingBalance(state.outstandingBalance ?? 0)
        }
      })
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
    if (libraryClosed) { setError(`The library is currently closed (${libraryStatus.reason}). Borrowing is unavailable until it reopens.`); return }
    if (holdIfAlreadyActive(book.titleId, book.title)) return

    const validation = validateBookCartAddition({role: viewer.role, activeBookCount: viewerReady ? viewer.activeBookCount : 0, selectedBookCount: cart.length, alreadySelected: cartBooks.has(book.titleId), bookLimit: viewer.bookLimit})

    if (!validation.allowed) { setError(validation.message ?? 'Your book limit has been reached.'); return }

    addItem(book)
    triggerFlyToCart({ title: book.title, coverImagePath: book.coverImagePath })
    setError(''); setNotice(`${book.title} added to your cart. Review your cart before submitting.`)

  }

  async function reserveBook(book: { titleId: number; title: string }) {
    if (libraryClosed) { setError(`The library is currently closed (${libraryStatus.reason}). Reservations are unavailable until it reopens.`); return }
    if (holdIfAlreadyActive(book.titleId, book.title)) return
    if (await reservations.reserve(book)) setWaitingTitle(book.title)
  }

  function addBook(book: CatalogRecord) {
    selectBook({titleId:Number(book.id),title:book.title,author:book.author || 'Author not recorded',isbn:book.isbn ?? null,coverImagePath:book.coverImagePath ?? null,shelfLocation:null,callNumber:null,previewBarcode:null})
  }

  const atBorrowLimit = viewerReady && viewer.bookLimit !== null && viewer.activeBookCount >= viewer.bookLimit
  const hasUnpaidFines = outstandingBalance > 0

  function bookAction(book: CatalogRecord) {
    const id = Number(book.id), selected = cartBooks.has(id), unavailable = Number(book.available) === 0
    const reserveBlocked = unavailable && (hasUnpaidFines || atBorrowLimit)
    const borrowBlocked = !unavailable && hasUnpaidFines
    const actionBlocked = reserveBlocked || borrowBlocked
    return <div className="space-y-2"><div className="flex items-center gap-1.5"><button onClick={() => { if (libraryClosed || actionBlocked || holdIfAlreadyActive(id, book.title)) return; setConfirmBook({ kind: unavailable ? 'reserve' : 'borrow', book }) }} disabled={libraryClosed || Number(book.copyCount) === 0 || reservations.pending.has(id) || reservations.reserved.has(id) || (!unavailable && selected) || actionBlocked} title={libraryClosed ? 'Library is currently closed' : actionBlocked ? (hasUnpaidFines ? 'Settle unpaid fines before borrowing or reserving' : 'Borrowing limit reached') : undefined} className="min-h-10 min-w-0 flex-1 rounded-[6px] bg-[#0b5ea2] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#094e87] disabled:cursor-not-allowed disabled:opacity-45">
      {Number(book.copyCount) === 0 ? 'No copies available' : reservations.reserved.has(id) ? 'Reserved' : reservations.pending.has(id) ? 'Reserving…' : unavailable ? 'Reserve book' : selected ? 'In cart' : 'Borrow book'}
    </button>{Number(book.copyCount)>0?<button type="button" disabled={libraryClosed || hasUnpaidFines} aria-label={`Schedule borrowing for ${book.title}`} title={libraryClosed ? 'Library is currently closed' : hasUnpaidFines ? 'Settle unpaid fines before scheduling' : 'Schedule borrowing'} onClick={()=>{if(!libraryClosed&&!hasUnpaidFines&&!holdIfAlreadyActive(id,book.title))openBook(id,true)}} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] text-[#0b5ea2] transition-colors hover:bg-[var(--sl-bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b5ea2] disabled:cursor-not-allowed disabled:opacity-45 dark:text-[#93c5fd]"><CalendarDays size={17} aria-hidden="true"/></button>:null}</div>{reservations.errors.has(id) && <p role="alert" className="field-error text-xs font-medium">{reservations.errors.get(id)}</p>}</div>
  }

  const limitTone =
    viewer.bookLimit !== null && viewer.activeBookCount >= viewer.bookLimit
      ? 'border-[#eab308]/45 bg-[#fef9c3]/80 text-[#92400e] dark:border-[#eab308]/40 dark:bg-[#854d0e]/25 dark:text-[#fde047]'
      : 'border-[#16a34a]/30 bg-[#dcfce7]/70 text-[#166534] dark:border-[#16a34a]/40 dark:bg-[#166534]/25 dark:text-[#86efac]'

  return <>
    <header className="mb-5 flex flex-col gap-4 rounded-[12px] border border-[var(--sl-border)] border-t-[3px] border-t-[#0b5ea2] bg-gradient-to-r from-[#f0f7ff] via-[var(--sl-bg-elevated)] to-[#fffdf0] p-5 shadow-[var(--sl-shadow-xs)] dark:from-[#16253b] dark:via-[#1a2232] dark:to-[#24251c] lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-[#0b5ea2]/14 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#0b5ea2] dark:bg-[#0b5ea2]/25 dark:text-[#93c5fd]">
            My library
          </span>
          {viewer.bookLimit !== null ? (
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${limitTone}`}>
              {viewerReady
                ? `Active books + requests: ${viewer.activeBookCount} / ${viewer.bookLimit}`
                : viewerError
                  ? 'Borrowing check unavailable. You can still choose books.'
                  : 'Checking borrowing eligibility… You can choose books while this loads.'}
            </span>
          ) : null}
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[var(--sl-text-header)] sm:text-[1.75rem]">
          Library catalog
        </h1>
        <p className="mt-1 text-sm text-[var(--sl-text-secondary)]">
          Add available books to your cart and send them to the desk, or reserve unavailable books to join the waiting list.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
        <Link to={`${base}/reservations`} className="inline-flex min-h-[38px] items-center gap-2 rounded-[6px] bg-[#0b5ea2] px-3.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-[#094e87]">
          <ListChecks size={15}/> Requests &amp; reservations
        </Link>
        <Link to={`${base}/cart`} data-cart-target="true" className={`inline-flex min-h-[38px] items-center gap-2 rounded-[6px] border px-3.5 text-xs font-semibold transition-colors ${cart.length > 0 ? 'border-[#e0d400] bg-[#FFF200] text-[#132a3f] hover:bg-[#f2e500]' : 'border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text-header)] hover:bg-[var(--sl-bg-subtle)]'}`}>
          <ShoppingBag size={15}/> Book cart ({cart.length})
        </Link>
        <Button variant="secondary" size="sm" onClick={() => { setError(''); void viewerQuery.refresh(); setRefreshKey(value => value + 1) }} aria-label="Refresh catalog">
          <RefreshCw size={16}/>
        </Button>
      </div>
    </header>

    {libraryClosed && <NoticeBanner tone="warning">The library is currently closed ({libraryStatus.reason}). You can browse the catalog, but borrowing, reservations, and scheduling are disabled until the library reopens.</NoticeBanner>}

    {hasUnpaidFines && <NoticeBanner tone="error" action={<Link to={`${base}/fines`} className="inline-flex min-h-8 items-center text-xs font-semibold underline">View fines</Link>}>Settle your unpaid library balance of ₱{outstandingBalance.toFixed(2)} before borrowing or reserving.</NoticeBanner>}
    {viewerError && <NoticeBanner tone="warning">{viewerError} You can still choose books; eligibility will be checked when you submit. Use Refresh catalog to retry the check.</NoticeBanner>}
    {error && <NoticeBanner tone="error">{error}</NoticeBanner>}

    {notice && <NoticeBanner tone="success">{notice}</NoticeBanner>}
    {atBorrowLimit && <NoticeBanner tone="warning" action={<Link to={`${base}/my-books`} className="inline-flex min-h-8 items-center text-xs font-semibold underline">View my books</Link>}>You can prepare a cart, but your active books and requests already fill your limit of {viewer.bookLimit}. Return a book or cancel an existing request before submitting another request.</NoticeBanner>}

    <div className={cart.length ? 'pb-20' : undefined}><PublicCatalogPage embedded refreshKey={refreshKey} onViewBook={openBook} renderBookAction={bookAction}/></div>

    {cart.length > 0 && <Link to={`${base}/cart`} data-cart-target="true" aria-label={`Review book cart, ${cart.length} ${cart.length === 1 ? 'book' : 'books'}`} className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-30 inline-flex min-h-12 -translate-x-1/2 items-center gap-3 rounded-full bg-[#0b5ea2] px-5 py-3 text-sm font-semibold text-white shadow-lg ring-2 ring-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[#0b5ea2] sm:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] sm:left-auto sm:right-6 sm:translate-x-0 dark:ring-[#20212b]">
      <ShoppingBag aria-hidden="true" size={20} /><span>Review cart</span><span aria-hidden="true" className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#FFF200] px-1.5 text-xs font-bold tabular-nums text-[#0b5ea2]">{cart.length}</span>
    </Link>}
    <FlyToCartOverlay />

    {selectedTitleId !== null && <BookOverview scheduleOnOpen={!libraryClosed && params.get('schedule')==='1'} titleId={selectedTitleId} role={viewer.role} activeBookCount={viewerReady ? viewer.activeBookCount : 0} bookLimit={viewer.bookLimit} selectedBookCount={cart.length} alreadySelected={cartBooks.has(selectedTitleId)} alreadyReserved={reservations.reserved.has(selectedTitleId)} libraryClosed={libraryClosed} hasUnpaidFines={hasUnpaidFines} onAddToCart={selectBook} onReserve={book => void reserveBook(book)} requestDisabled={libraryClosed || hasUnpaidFines || reservations.pending.has(selectedTitleId)} onClose={closeBook} requestError={reservations.errors.get(selectedTitleId) ?? error} requestNotice={notice}/>}
    {confirmBook ? <ConfirmBookActionDialog kind={confirmBook.kind} title={confirmBook.book.title} onCancel={() => setConfirmBook(null)} onConfirm={() => { const choice = confirmBook; setConfirmBook(null); if (choice.kind === 'borrow') addBook(choice.book); else void reserveBook({ titleId: Number(choice.book.id), title: choice.book.title }) }} /> : null}
    {heldTitle ? <TitleAlreadyActiveDialog titles={[heldTitle]} onClose={() => setHeldTitle(null)} /> : null}
    {waitingTitle ? <LumoDialog size="sm" title="On the waiting list" onClose={() => setWaitingTitle(null)} footer={<Button onClick={() => setWaitingTitle(null)}>Done</Button>}><p className="text-sm text-[var(--sl-text)]">We will notify you when a copy of {waitingTitle} is ready.</p></LumoDialog> : null}

  </>

}
