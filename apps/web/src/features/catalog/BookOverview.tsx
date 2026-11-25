import { Check, Clipboard, MapPin, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { Button, NoticeBanner, StatusBadge } from '../../components/ui'
import type { AuthRole } from '../auth/auth-storage'
import { ViewLocationButton } from '../floor-plan/ViewLocationButton'
import { ScheduleBorrowingForm } from '../reservations/ScheduleBorrowingForm'
import { BookAvailabilityInfo } from './BookAvailabilityInfo'
import { BookCoverThumbnail } from './BookCoverThumbnail'
import { CatalogDetailsPanel } from './CatalogDetailsPanel'
import { ConfirmBookActionDialog } from './ConfirmBookActionDialog'
import { validateBookCartAddition } from './book-cart'
import { fetchBookOverview } from './book-catalog-api'
import type { BookCatalogItem } from './book-catalog-types'
import { buildApaBookReference } from './book-citation'

type Props = {
  scheduleOnOpen?: boolean
  titleId: number
  role: AuthRole
  activeBookCount: number
  bookLimit?: number | null
  selectedBookCount: number
  alreadySelected: boolean
  alreadyReserved?: boolean
  libraryClosed?: boolean
  hasUnpaidFines?: boolean
  onAddToCart: (book: BookCatalogItem) => void
  onClose: () => void
  onReserve?: (book: BookCatalogItem) => void
  onRequest?: (book: BookCatalogItem) => void
  requestDisabled?: boolean
  requestError?: string
  requestNotice?: string
}

function Metadata({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/45 p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sl-text-muted)]">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-[var(--sl-text-header)]">
        {value || 'Not recorded'}
      </dd>
    </div>
  )
}

export function BookOverview({
  scheduleOnOpen = false,
  titleId,
  role,
  activeBookCount,
  bookLimit,
  selectedBookCount,
  alreadySelected,
  alreadyReserved = false,
  libraryClosed = false,
  hasUnpaidFines = false,
  onAddToCart,
  onClose,
  onReserve,
  onRequest,
  requestDisabled = false,
  requestError,
  requestNotice,
}: Props) {
  const [book, setBook] = useState<BookCatalogItem | null>(null)
  const [error, setError] = useState('')
  const [citationVisible, setCitationVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pending, setPending] = useState<'borrow' | 'reserve' | null>(null)
  const [scheduling, setScheduling] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setBook(null)
    setScheduling(scheduleOnOpen)
    setError('')
    let running = false
    const load = async () => {
      if (running) return
      running = true
      try {
        const result = await fetchBookOverview(titleId, controller.signal)
        if (!controller.signal.aborted) {
          setBook(result)
          setError('')
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Unable to refresh this book.')
        }
      } finally {
        running = false
      }
    }
    void load()
    const refresh = () => {
      if (!document.hidden) void load()
    }
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      controller.abort()
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [titleId, scheduleOnOpen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, pending])

  const citation = useMemo(() => (book ? buildApaBookReference(book) : ''), [book])

  const addToCart = () => {
    if (!book) return
    const validation = validateBookCartAddition({
      role,
      activeBookCount,
      bookLimit,
      selectedBookCount,
      alreadySelected,
    })
    if (!validation.allowed) {
      return setError(validation.message ?? 'This book cannot be added to the cart.')
    }
    onAddToCart(book)
    setError(validation.message ?? '')
  }

  const copyCitation = async () => {
    try {
      await navigator.clipboard.writeText(citation)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Clipboard access is unavailable. Select and copy the reference manually.')
    }
  }

  const availabilityTone =
    book && book.availableCopiesCount > 0
      ? 'success'
      : book && book.totalCopiesCount === 0
        ? 'error'
        : 'warning'

  return (
    <>
      <div
        className="sl-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-[#132a3f]/65 p-2.5 backdrop-blur-[3px] sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-overview-title"
      >
        <button className="absolute inset-0" aria-label="Close book overview" onClick={onClose} />
        <div className="sl-book-modal-in relative z-10 flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-[16px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] shadow-2xl">
          <header className="flex shrink-0 items-center justify-between border-b border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] px-5 py-4 sm:px-7">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0f766e] dark:text-[#5eead4]">
                Book overview
              </p>
              <h2 id="book-overview-title" className="mt-0.5 font-display text-lg font-bold text-[var(--sl-text-header)] sm:text-xl">
                Complete catalog record
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-[8px] border border-[var(--sl-border-strong)] p-2 text-[var(--sl-text-secondary)] transition-colors hover:bg-[var(--sl-bg-hover)] hover:text-[var(--sl-text-header)]"
            >
              <X size={18} />
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_310px] lg:overflow-hidden">
            {/* LEFT SIDE: Complete Book Details */}
            <div className="min-w-0 space-y-5 p-4 sm:p-7 lg:overflow-y-auto">
              {requestError ? <NoticeBanner tone="error">{requestError}</NoticeBanner> : null}
              {requestNotice ? <NoticeBanner tone="success">{requestNotice}</NoticeBanner> : null}
              {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
              {!book && !error ? (
                <div className="py-20 text-center text-sm font-medium text-[var(--sl-text-secondary)]">
                  Loading book details…
                </div>
              ) : null}

              {book ? (
                <>
                  {scheduleOnOpen && scheduling ? (
                    <div className="rounded-[10px] border border-[#0b5ea2]/25 bg-[#f0f7ff]/70 p-4 dark:bg-[#16253b]/70">
                      <p className="font-semibold text-[var(--sl-text-header)]">{book.title}</p>
                      <ScheduleBorrowingForm
                        key={titleId}
                        titleId={titleId}
                        title={book.title}
                        role={role}
                        onClose={() => setScheduling(false)}
                      />
                    </div>
                  ) : null}

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      {book.categoryName ? (
                        <span className="inline-flex items-center rounded-full bg-[#0b5ea2]/12 px-2.5 py-0.5 text-[11px] font-semibold text-[#0b5ea2] dark:bg-[#0b5ea2]/25 dark:text-[#93c5fd]">
                          {book.categoryName}
                        </span>
                      ) : null}
                      <StatusBadge status={book.currentAvailabilityStatus} tone={availabilityTone} />
                    </div>
                    <h3 className="mt-2.5 font-display text-2xl font-bold leading-tight text-[var(--sl-text-header)]">
                      {book.title}
                    </h3>
                    <p className="mt-1 text-sm font-medium text-[var(--sl-text-secondary)]">
                      {book.author}
                    </p>
                  </div>

                  <dl aria-label="Book catalog details" className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <ViewLocationButton titleId={book.titleId} />
                    </div>
                    <Metadata label="ISBN" value={book.isbn} />
                    <Metadata label="Category" value={book.categoryName} />
                    <Metadata label="Publication year" value={book.publicationYear} />
                    <Metadata label="Publisher" value={book.publisher} />
                    <Metadata label="Shelf location" value={book.shelfLocation ?? book.callNumber} />
                    <Metadata label="Current condition" value={book.currentConditionStatus ?? null} />
                    <Metadata
                      label="Available stock"
                      value={`${book.availableCopiesCount} of ${book.totalCopiesCount} copies`}
                    />
                  </dl>

                  <BookAvailabilityInfo
                    available={book.availableCopiesCount}
                    total={book.totalCopiesCount}
                    borrowed={book.borrowedCopiesCount}
                    reserved={book.reservedCopiesCount}
                  />

                  <CatalogDetailsPanel titleId={book.titleId} />

                  {['Student', 'Faculty'].includes(role) && book.totalCopiesCount > 0 ? (
                    scheduling && !libraryClosed && !hasUnpaidFines ? (
                      scheduleOnOpen ? null : (
                        <ScheduleBorrowingForm
                          key={titleId}
                          titleId={titleId}
                          title={book.title}
                          role={role}
                          onClose={() => setScheduling(false)}
                        />
                      )
                    ) : (
                      <Button
                        variant="secondary"
                        disabled={libraryClosed || hasUnpaidFines}
                        title={
                          libraryClosed
                            ? 'Library is currently closed'
                            : hasUnpaidFines
                              ? 'Settle unpaid fines before scheduling'
                              : undefined
                        }
                        onClick={() => setScheduling(true)}
                      >
                        Schedule borrowing
                      </Button>
                    )
                  ) : null}

                  <section
                    className="overflow-hidden rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]"
                    aria-label="Individual book copies"
                  >
                    <div className="border-b border-[var(--sl-border)] px-4 py-3">
                      <h3 className="font-display text-sm font-semibold text-[var(--sl-text-header)]">
                        Individual copies
                      </h3>
                    </div>
                    {book.copies?.length ? (
                      <ResponsiveTable label="Individual book copies">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
                            <tr>
                              <th scope="col" className="px-3 py-2.5">
                                Accession &amp; barcode
                              </th>
                              <th scope="col" className="px-3 py-2.5">
                                Availability
                              </th>
                              <th scope="col" className="px-3 py-2.5">
                                Condition
                              </th>
                              <th scope="col" className="px-3 py-2.5">
                                Shelf / Dewey
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--sl-border)]">
                            {book.copies.map((copy) => (
                              <tr key={copy.copyId}>
                                <td className="px-3 py-2.5">
                                  <strong className="block text-[var(--sl-text-header)]">
                                    {copy.accessionNumber}
                                  </strong>
                                  <span className="font-mono text-[var(--sl-text-muted)]">
                                    {copy.barcode}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5">
                                  <StatusBadge status={copy.availability} />
                                </td>
                                <td className="px-3 py-2.5 text-[var(--sl-text-secondary)]">
                                  {copy.condition}
                                </td>
                                <td className="px-3 py-2.5 text-[var(--sl-text-secondary)]">
                                  <span className="block">{copy.shelf}</span>
                                  <span className="text-[11px] text-[var(--sl-text-muted)]">
                                    Dewey: {copy.deweyCode ?? 'Not assigned'} {copy.deweyDescription}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </ResponsiveTable>
                    ) : (
                      <p className="p-4 text-sm text-[var(--sl-text-muted)]">
                        No active copies are recorded.
                      </p>
                    )}
                  </section>

                  <div className="rounded-[10px] border border-[var(--sl-border)] p-4">
                    <Button variant="secondary" onClick={() => setCitationVisible((value) => !value)}>
                      <Clipboard size={16} aria-hidden="true" />
                      Generate APA reference
                    </Button>
                    {citationVisible ? (
                      <div className="mt-3">
                        <label
                          htmlFor="apa-reference"
                          className="text-xs font-semibold text-[var(--sl-text-header)]"
                        >
                          APA 7th Edition reference
                        </label>
                        <textarea
                          id="apa-reference"
                          readOnly
                          value={citation}
                          className="sl-input mt-1.5 min-h-24 resize-none"
                        />
                        <button
                          onClick={copyCitation}
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0b5ea2] hover:underline dark:text-[#93c5fd]"
                        >
                          {copied ? <Check size={15} /> : <Clipboard size={15} />}
                          {copied ? 'Copied' : 'Copy to clipboard'}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-3 border-t border-[var(--sl-border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-xs font-medium text-[var(--sl-text-secondary)]">
                      <MapPin size={15} className="text-[#0f766e] dark:text-[#5eead4]" />
                      {book.shelfLocation ?? book.callNumber ?? 'Shelf not recorded'}
                    </div>
                    {['Student', 'Faculty'].includes(role) && onRequest && book.totalCopiesCount > 0 ? (
                      <Button onClick={() => onRequest(book)} disabled={alreadySelected || requestDisabled}>
                        {alreadySelected
                          ? 'Requested / selected'
                          : requestDisabled
                            ? 'Please wait…'
                            : book.availableCopiesCount > 0
                              ? 'Borrow book'
                              : 'Reserve book'}
                      </Button>
                    ) : null}
                    {!onRequest && ['Student', 'Faculty'].includes(role) && book.availableCopiesCount > 0 ? (
                      <Button onClick={() => setPending('borrow')} disabled={alreadySelected || requestDisabled}>
                        {alreadySelected ? 'In borrow cart' : 'Borrow book'}
                      </Button>
                    ) : null}
                    {!onRequest &&
                    ['Student', 'Faculty'].includes(role) &&
                    book.totalCopiesCount > 0 &&
                    book.availableCopiesCount === 0 &&
                    onReserve ? (
                      <Button onClick={() => setPending('reserve')} disabled={requestDisabled || alreadyReserved}>
                        {alreadyReserved ? 'Reserved' : requestDisabled ? 'Please wait…' : 'Reserve book'}
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>

            {/* RIGHT SIDE: Animated 3D Pop-Up Book Showcase */}
            <aside className="order-first relative flex shrink-0 flex-col items-center justify-center border-b border-[var(--sl-border)] bg-gradient-to-br from-[#132a3f] via-[#0b5ea2] to-[#0f766e] p-5 text-white lg:order-last lg:border-b-0 lg:border-l lg:p-6">
              <div
                className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#FFF200]/15 blur-2xl"
                aria-hidden="true"
              />
              {book ? (
                <div className="relative z-10 flex flex-col items-center text-center">
                  <div className="sl-book-pop relative">
                    <BookCoverThumbnail
                      title={book.title}
                      coverImagePath={book.coverImagePath}
                      className="h-48 w-32 rounded-[10px] border-2 border-white/25 shadow-[0_24px_45px_-12px_rgba(7,20,36,0.65)] sm:h-64 sm:w-44 lg:h-72 lg:w-48"
                    />
                  </div>
                  <div className="mt-5 w-full rounded-[10px] bg-white/10 px-4 py-3 text-center ring-1 ring-white/15 backdrop-blur-xs">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#FFF200]">
                      Availability
                    </p>
                    <p className="mt-1 font-display text-lg font-bold tabular-nums text-white">
                      {book.availableCopiesCount} / {book.totalCopiesCount} copies
                    </p>
                    <p className="mt-0.5 text-xs text-white/80">
                      {book.shelfLocation ?? book.callNumber ?? 'Ask desk for shelf location'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="h-64 w-44 animate-pulse rounded-[10px] bg-white/15" />
              )}
            </aside>
          </div>
        </div>
      </div>

      {pending && book ? (
        <ConfirmBookActionDialog
          kind={pending}
          title={book.title}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const choice = pending
            setPending(null)
            if (choice === 'borrow') addToCart()
            else onReserve?.(book)
          }}
        />
      ) : null}
    </>
  )
}
