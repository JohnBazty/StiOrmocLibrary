import { BookOpen, CheckCircle2, Eye, MapPin, ShoppingBag, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConfirmSave } from '../../components/ConfirmSaveDialog'
import { RefreshButton } from '../../components/RefreshButton'
import { Button, EmptyState, LumoDialog, NoticeBanner, SectionCard, StatusBadge } from '../../components/ui'
import { ViewLocationButton } from '../floor-plan/ViewLocationButton'
import { useLibraryOpenStatus } from '../notifications/useLibraryOpenStatus'
import { usePaymentUpdates } from '../payments/payment-updates'
import { BookCoverThumbnail } from './BookCoverThumbnail'
import { BookDetailDrawer } from './BookDetailDrawer'
import { BookCartApiError, fetchCartState, submitBorrowRequest, type BorrowRequestReceipt } from './book-cart-api'
import { readBookCart, useBookCart } from './book-cart-store'
import { fetchBookOverview } from './book-catalog-api'
import { TitleAlreadyActiveDialog } from './TitleAlreadyActiveDialog'

export function BookCart() {
  const requestKey = useRef('')
  const selectionKey = useRef('')
  const saving = useRef(false)
  const { items, updateItem, removeItem, removeItems } = useBookCart()
  const [selectedIds, setSelectedIds] = useState<number[]>(() => items.map((item) => item.titleId))
  const knownIds = useRef<Set<number>>(new Set(items.map((item) => item.titleId)))
  const [syncNotice, setSyncNotice] = useState('')
  const { ask, dialog: confirmSave } = useConfirmSave()
  const [heldTitles, setHeldTitles] = useState<string[]>([])
  const [outstanding, setOutstanding] = useState<number | null>(null)
  const [unavailableIds, setUnavailableIds] = useState<number[]>([])
  const [syncError, setSyncError] = useState('')
  const cartFlight = useRef<Promise<void> | null>(null)
  const mounted = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submitNotice, setSubmitNotice] = useState('')
  const [receipt, setReceipt] = useState<BorrowRequestReceipt | null>(null)
  const [detailTitleId, setDetailTitleId] = useState<number | null>(null)
  const hydratedTitleIds = useRef(new Set<number>())
  const selectAllRef = useRef<HTMLInputElement | null>(null)
  const hasItems = items.length > 0

  // Auto-select newly added cart items and prune removed ones
  useEffect(() => {
    const currentIdSet = new Set(items.map((item) => item.titleId))
    const newlyAdded = items.filter((item) => !knownIds.current.has(item.titleId)).map((item) => item.titleId)
    knownIds.current = currentIdSet
    setSelectedIds((prev) => {
      const kept = prev.filter((id) => currentIdSet.has(id))
      return newlyAdded.length ? [...kept, ...newlyAdded] : kept
    })
  }, [items])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedItems = useMemo(() => items.filter((item) => selectedSet.has(item.titleId)), [items, selectedSet])
  const allSelected = items.length > 0 && selectedItems.length === items.length
  const someSelected = selectedItems.length > 0 && selectedItems.length < items.length

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  const toggleItem = (titleId: number) => {
    setSelectedIds((prev) =>
      prev.includes(titleId) ? prev.filter((id) => id !== titleId) : [...prev, titleId],
    )
  }

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([])
    } else {
      setSelectedIds(items.map((item) => item.titleId))
    }
  }

  const refreshCart = useCallback(() => {
    if (!hasItems || saving.current) return Promise.resolve()
    if (cartFlight.current) return cartFlight.current
    cartFlight.current = (async () => {
      try {
        const state = await fetchCartState()
        if (!mounted.current || saving.current) return
        setOutstanding(state.outstandingBalance ?? 0)
        setSyncError('')
        const removed = readBookCart().filter((item) => state.activeTitleIds.includes(item.titleId))
        if (removeItems(state.activeTitleIds) > 0) {
          setHeldTitles(removed.map((item) => item.title))
          setSyncNotice('')
          setDetailTitleId(null)
        }
      } catch (reason) {
        /* Keep local selections when the authoritative check is unavailable. */
        if (mounted.current) {
          setSyncError(reason instanceof Error ? reason.message : 'Your current library balance could not be checked.')
        }
      } finally {
        cartFlight.current = null
      }
    })()
    return cartFlight.current
  }, [hasItems, removeItems])

  useEffect(() => {
    mounted.current = true
    void refreshCart()
    return () => {
      mounted.current = false
    }
  }, [refreshCart])
  usePaymentUpdates(refreshCart, 15000)

  useEffect(() => {
    const activeIds = new Set(items.map((item) => item.titleId))
    setUnavailableIds((prev) => prev.filter((id) => activeIds.has(id)))
    for (const item of items) {
      if (hydratedTitleIds.current.has(item.titleId)) continue
      hydratedTitleIds.current.add(item.titleId)
      void Promise.resolve(fetchBookOverview(item.titleId))
        .then((book) => {
          if (!book) return
          if (mounted.current && typeof book.availableCopiesCount === 'number') {
            setUnavailableIds((prev) =>
              book.availableCopiesCount <= 0
                ? prev.includes(item.titleId)
                  ? prev
                  : [...prev, item.titleId]
                : prev.filter((id) => id !== item.titleId),
            )
          }
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
        .catch(() => {
          /* Keep the locally saved cart record when refresh fails. */
        })
    }
  }, [items, updateItem])

  async function submit(targetIds: number[]) {
    if (!targetIds.length || saving.current) return
    saving.current = true
    const selection = [...targetIds].sort((a, b) => a - b).join(',')
    if (selection !== selectionKey.current) {
      requestKey.current = ''
      selectionKey.current = selection
    }
    setSubmitting(true)
    setError('')
    setSubmitNotice('')
    try {
      requestKey.current ||= crypto.randomUUID()
      const submittedCount = targetIds.length
      const result = await submitBorrowRequest(targetIds, requestKey.current)
      requestKey.current = ''
      removeItems(targetIds)
      setSelectedIds((prev) => prev.filter((id) => !targetIds.includes(id)))
      setSubmitNotice(
        `Checkout submitted for ${submittedCount} ${submittedCount === 1 ? 'book' : 'books'}. ${result.instructions}`,
      )
      setReceipt(result)
    } catch (reason) {
      const blockers =
        reason instanceof BookCartApiError && reason.code === 'CIRCULATION_ELIGIBILITY_BLOCKED'
          ? (reason.details as { blockers?: unknown })?.blockers
          : null
      if (Array.isArray(blockers) && blockers.every((value) => typeof value === 'string')) {
        const balanceBannerVisible = outstanding !== null && outstanding > 0
        const filtered = balanceBannerVisible
          ? blockers.filter((value) => !value.startsWith('Settle the outstanding library balance of '))
          : blockers
        setError((filtered.length ? filtered : blockers).join(' '))
      } else if (reason instanceof BookCartApiError && reason.code === 'STUDENT_BORROW_LIMIT_REACHED') {
        const specific = reason.message.startsWith('You have ')
        setError(
          specific
            ? `${reason.message} Your cart has been kept.`
            : `${reason.message} Return a book or cancel an existing request, then try again. Your cart has been kept.`,
        )
      } else {
        setError(reason instanceof Error ? reason.message : 'The borrow request could not be submitted.')
      }
    } finally {
      saving.current = false
      setSubmitting(false)
      void refreshCart()
    }
  }

  const libraryStatus = useLibraryOpenStatus()
  const hasUnpaidBalance = outstanding !== null && outstanding > 0
  const hasUnavailable = items.some((item) => unavailableIds.includes(item.titleId))
  const selectedHasUnavailable = selectedItems.some((item) => unavailableIds.includes(item.titleId))
  const checkoutBlocked =
    !selectedItems.length || submitting || libraryStatus.closed || hasUnpaidBalance || selectedHasUnavailable

  function requestCheckout(targetItems: typeof items) {
    const count = targetItems.length
    const targetIds = targetItems.map((item) => item.titleId)
    const label = count === 1 ? `"${targetItems[0].title}"` : `${count} books`
    ask(
      `Send ${label} to the library desk. The loan starts when staff hand over the copy.`,
      () => {
        void submit(targetIds)
      },
      {
        title: 'Send borrow request to the library desk?',
        confirmLabel: 'Send borrow request',
      },
    )
  }

  return (
    <div className="space-y-5">
      {confirmSave}

      <header className="flex flex-col gap-3 rounded-[12px] border border-[var(--sl-border)] border-t-[3px] border-t-[#0b5ea2] bg-gradient-to-r from-[#f0f7ff] via-[var(--sl-bg-elevated)] to-[#fffdf0] p-5 shadow-[var(--sl-shadow-xs)] dark:from-[#16253b] dark:via-[#1a2232] dark:to-[#24251c] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0b5ea2]/14 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#0b5ea2] dark:bg-[#0b5ea2]/25 dark:text-[#93c5fd]">
            <ShoppingBag size={12} />
            My library
          </span>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[var(--sl-text-header)] sm:text-[1.75rem]">
            Book cart
          </h1>
          <p className="mt-1 text-sm text-[var(--sl-text-secondary)]">
            Check out books one by one, select specific titles, or select all to send to the library desk.
          </p>
        </div>
      </header>

      {libraryStatus.closed ? (
        <NoticeBanner tone="warning">
          The library is currently closed ({libraryStatus.reason}). Checking out borrow requests is disabled until the library reopens.
        </NoticeBanner>
      ) : null}
      {heldTitles.length > 0 && <TitleAlreadyActiveDialog titles={heldTitles} onClose={() => setHeldTitles([])} />}
      {syncNotice ? <NoticeBanner tone="info">{syncNotice}</NoticeBanner> : null}
      {syncError ? (
        <NoticeBanner
          tone="error"
          action={<RefreshButton label="Refresh balance" onRefresh={() => refreshCart()} variant="ghost" size="sm" />}
        >
          {syncError}
        </NoticeBanner>
      ) : null}
      {hasUnpaidBalance && hasItems ? (
        <NoticeBanner
          tone="error"
          action={
            <a className="inline-flex min-h-8 items-center text-xs font-semibold underline" href="../fines">
              View fines
            </a>
          }
        >
          Settle the outstanding library balance of ₱{outstanding.toFixed(2)} before borrowing.
        </NoticeBanner>
      ) : null}
      {hasUnavailable ? (
        <NoticeBanner tone="warning">
          One or more books in your cart no longer have an available copy. Uncheck or remove unavailable books before checking out.
        </NoticeBanner>
      ) : null}
      {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
      {submitNotice ? (
        <NoticeBanner
          tone="success"
          action={
            <a className="inline-flex min-h-8 items-center text-xs font-semibold underline" href="../reservations">
              View requests &amp; reservations
            </a>
          }
        >
          {submitNotice}
        </NoticeBanner>
      ) : null}

      <SectionCard className="overflow-hidden border-t-[3px] border-t-[#0f766e]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/35 px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-3">
            {items.length ? (
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[var(--sl-text-header)]">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  disabled={submitting}
                  onChange={toggleAll}
                  className="size-4 rounded border-[var(--sl-border-strong)] accent-[#0b5ea2]"
                />
                Select all
              </label>
            ) : null}
            <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">
              Review your selected books
            </h2>
          </div>
          {items.length ? (
            <span className="rounded-full bg-[#0b5ea2]/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-[#0b5ea2] dark:bg-[#0b5ea2]/25 dark:text-[#93c5fd]">
              {selectedItems.length} of {items.length} {items.length === 1 ? 'book' : 'books'} selected
            </span>
          ) : null}
        </div>

        {items.length ? (
          <div className="divide-y divide-[var(--sl-border)]">
            {items.map((item) => {
              const isUnavailable = unavailableIds.includes(item.titleId)
              const isChecked = selectedSet.has(item.titleId)
              const singleBlocked = submitting || libraryStatus.closed || hasUnpaidBalance || isUnavailable
              return (
                <article
                  key={item.titleId}
                  className={`grid grid-cols-[auto_auto_1fr] items-start gap-3 px-4 py-4 transition-colors sm:grid-cols-[auto_auto_1fr_auto] sm:items-center sm:gap-4 sm:px-5 ${
                    isChecked ? 'bg-[#f0f7ff]/45 dark:bg-[#0b5ea2]/10' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={submitting}
                    aria-label={`Select ${item.title} for checkout`}
                    onChange={() => toggleItem(item.titleId)}
                    className="mt-1 size-4 cursor-pointer rounded border-[var(--sl-border-strong)] accent-[#0b5ea2] sm:mt-0"
                  />
                  <BookCoverThumbnail title={item.title} coverImagePath={item.coverImagePath} className="h-20 w-14 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-semibold text-[var(--sl-text-header)]">
                        {item.title}
                      </h3>
                      {isUnavailable ? <StatusBadge status="Unavailable" /> : null}
                    </div>
                    <p className="mt-0.5 text-sm text-[var(--sl-text-secondary)]">{item.author}</p>
                    <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-[var(--sl-text-muted)]">
                      <span>ISBN: {item.isbn ?? 'Not recorded'}</span>
                      <span className="inline-flex items-center gap-1 font-medium text-[var(--sl-text-secondary)]">
                        <MapPin size={13} aria-hidden="true" />
                        {item.shelfLocation ?? item.callNumber ?? 'Shelf pending'}
                      </span>
                    </div>
                    {isUnavailable ? (
                      <p className="field-error mt-1.5 text-xs font-medium">
                        No copies are currently available. Remove this book or reserve it from the catalog instead.
                      </p>
                    ) : null}
                  </div>
                  <div className="col-span-full flex flex-wrap items-center justify-end gap-2 border-t border-[var(--sl-border)]/60 pt-3 sm:col-span-1 sm:border-t-0 sm:pt-0">
                    <ViewLocationButton titleId={item.titleId} availableOnly />
                    <Button variant="secondary" size="sm" onClick={() => setDetailTitleId(item.titleId)}>
                      <Eye size={15} aria-hidden="true" /> View details
                    </Button>
                    <Button
                      size="sm"
                      aria-label={`Check out ${item.title}`}
                      disabled={singleBlocked}
                      onClick={() => requestCheckout([item])}
                    >
                      Check out
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${item.title}`}
                      disabled={submitting}
                      onClick={() => removeItem(item.titleId)}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon={BookOpen}
            title="Your cart is empty"
            description="Browse the library catalog to add available books before visiting the desk."
            action={
              <a
                href="../library"
                className="inline-flex min-h-[38px] items-center justify-center rounded-[6px] bg-[#0b5ea2] px-4 text-sm font-semibold text-white hover:bg-[#094e87]"
              >
                Browse catalog
              </a>
            }
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] px-5 py-3.5">
          <p className="text-xs font-medium text-[var(--sl-text-secondary)]">
            {items.length
              ? selectedItems.length
                ? `Ready to send ${selectedItems.length} ${selectedItems.length === 1 ? 'book' : 'books'} to the library desk.`
                : 'Select one or more books above, or use Check out on an individual book.'
              : 'Add books from the catalog to check out.'}
          </p>
          <Button disabled={checkoutBlocked} onClick={() => requestCheckout(selectedItems)}>
            {submitting ? 'Submitting…' : 'Check Out'}
          </Button>
        </div>
      </SectionCard>

      {receipt ? (
        <LumoDialog
          eyebrow="Request submitted"
          title="Cart sent to library desk"
          onClose={() => setReceipt(null)}
          footer={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <a
                href="../reservations"
                className="inline-flex min-h-[38px] items-center justify-center rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3.5 text-sm font-semibold text-[var(--sl-text-header)] hover:bg-[var(--sl-bg-subtle)]"
              >
                View requests &amp; reservations
              </a>
              <Button onClick={() => setReceipt(null)}>Done</Button>
            </div>
          }
        >
          <NoticeBanner tone="success" className="mb-4">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 size={16} aria-hidden="true" />
              {receipt.instructions}
            </span>
          </NoticeBanner>
          <p className="text-sm text-[var(--sl-text-secondary)]">
            These available books are awaiting staff handover and are not in the reservation queue. Your loan starts only after staff confirm the physical handover.
          </p>
          <div className="mt-4 divide-y divide-[var(--sl-border)] rounded-[8px] border border-[var(--sl-border)]">
            {receipt.items.map((item) => (
              <div key={item.reservationId ?? item.titleId} className="flex items-center justify-between gap-2 px-3 py-2.5">
                <span className="text-sm font-semibold text-[var(--sl-text-header)]">
                  {item.title}
                  {item.statusLabel ? ` · ${item.statusLabel}` : ''}
                </span>
                <ViewLocationButton titleId={item.titleId} copyId={item.physicalCopyId ?? undefined} />
              </div>
            ))}
          </div>
          <p className="mt-3 font-mono text-xs text-[var(--sl-text-muted)]">Request: {receipt.requestGroupId}</p>
        </LumoDialog>
      ) : null}
      {detailTitleId !== null ? (
        <BookDetailDrawer
          titleId={detailTitleId}
          barcode={items.find((item) => item.titleId === detailTitleId)?.previewBarcode ?? null}
          onClose={() => setDetailTitleId(null)}
        />
      ) : null}
    </div>
  )
}
