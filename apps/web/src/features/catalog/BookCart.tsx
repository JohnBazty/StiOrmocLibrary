import { usePaymentUpdates } from '../payments/payment-updates'
import { ViewLocationButton } from '../floor-plan/ViewLocationButton'
import { BookOpen, CheckCircle2, Eye, MapPin, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, EmptyState, LumoDialog, NoticeBanner, PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { BookCartApiError, fetchCartState, submitBorrowRequest, type BorrowRequestReceipt } from './book-cart-api'
import { readBookCart, useBookCart } from './book-cart-store'
import { BookDetailDrawer } from './BookDetailDrawer'
import { BookCoverThumbnail } from './BookCoverThumbnail'
import { fetchBookOverview } from './book-catalog-api'
import { TitleAlreadyActiveDialog } from './TitleAlreadyActiveDialog'
import { useConfirmSave } from '../../components/ConfirmSaveDialog'
import { RefreshButton } from '../../components/RefreshButton'

export function BookCart() {
  const requestKey = useRef('')
  const selectionKey = useRef('')
  const saving = useRef(false)
  const { items, updateItem, removeItem, removeItems, clear } = useBookCart()
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
  const [receipt, setReceipt] = useState<BorrowRequestReceipt | null>(null)
  const [detailTitleId, setDetailTitleId] = useState<number | null>(null)
  const hydratedTitleIds = useRef(new Set<number>())
  const hasItems = items.length > 0

  const refreshCart = useCallback(() => {
    if (!hasItems || saving.current) return Promise.resolve()
    if (cartFlight.current) return cartFlight.current
    cartFlight.current = (async () => {
      try {
        const state = await fetchCartState()
        if (!mounted.current || saving.current) return
        setOutstanding(state.outstandingBalance ?? 0)
        setSyncError('')
        const removed = readBookCart().filter(item => state.activeTitleIds.includes(item.titleId))
        if (removeItems(state.activeTitleIds) > 0) {
          setHeldTitles(removed.map(item => item.title))
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
    const activeIds = new Set(items.map(item => item.titleId))
    setUnavailableIds(prev => prev.filter(id => activeIds.has(id)))
    for (const item of items) {
      if (hydratedTitleIds.current.has(item.titleId)) continue
      hydratedTitleIds.current.add(item.titleId)
      void Promise.resolve(fetchBookOverview(item.titleId))
        .then(book => {
          if (!book) return
          if (mounted.current && typeof book.availableCopiesCount === 'number') {
            setUnavailableIds(prev =>
              book.availableCopiesCount <= 0
                ? prev.includes(item.titleId) ? prev : [...prev, item.titleId]
                : prev.filter(id => id !== item.titleId),
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

  async function submit() {
    if (!items.length || saving.current) return
    saving.current = true
    const selection = items.map(item => item.titleId).sort((a, b) => a - b).join(',')
    if (selection !== selectionKey.current) {
      requestKey.current = ''
      selectionKey.current = selection
    }
    setSubmitting(true)
    setError('')
    try {
      requestKey.current ||= crypto.randomUUID()
      const result = await submitBorrowRequest(
        items.map(item => item.titleId),
        requestKey.current,
      )
      requestKey.current = ''
      clear()
      setReceipt(result)
    } catch (reason) {
      const blockers =
        reason instanceof BookCartApiError && reason.code === 'CIRCULATION_ELIGIBILITY_BLOCKED'
          ? (reason.details as { blockers?: unknown })?.blockers
          : null
      if (Array.isArray(blockers) && blockers.every(value => typeof value === 'string')) {
        const balanceBannerVisible = outstanding !== null && outstanding > 0
        const filtered = balanceBannerVisible
          ? blockers.filter(value => !value.startsWith('Settle the outstanding library balance of '))
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

  const hasUnavailable = items.some(item => unavailableIds.includes(item.titleId))
  const checkoutBlocked = !items.length || submitting || (outstanding !== null && outstanding > 0) || hasUnavailable

  return (
    <>
      {confirmSave}
      <PageHeader
        eyebrow="My library"
        title="Book cart"
        description="Review available books before sending them to the library desk. Bring the selected copies to staff to start your loan."
      />
      {heldTitles.length > 0 && <TitleAlreadyActiveDialog titles={heldTitles} onClose={() => setHeldTitles([])} />}
      {syncNotice ? <NoticeBanner tone="info">{syncNotice}</NoticeBanner> : null}
      {syncError ? (
        <NoticeBanner
          tone="error"
          action={
            <RefreshButton label="Refresh balance" onRefresh={() => refreshCart()} variant="ghost" size="sm" />
          }
        >
          {syncError}
        </NoticeBanner>
      ) : null}
      {outstanding !== null && outstanding > 0 && hasItems ? (
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
          One or more books in your cart no longer have an available copy. Remove unavailable books before checking out.
        </NoticeBanner>
      ) : null}
      {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}

      <SectionCard className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sl-border)] px-5 py-3.5">
          <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Review your selected books</h2>
          {items.length ? (
            <span className="text-xs font-medium text-[var(--sl-text-muted)] tabular-nums">
              {items.length} {items.length === 1 ? 'book' : 'books'} selected
            </span>
          ) : null}
        </div>
        {items.length ? (
          <div className="divide-y divide-[var(--sl-border)]">
            {items.map(item => {
              const isUnavailable = unavailableIds.includes(item.titleId)
              return (
                <article
                  key={item.titleId}
                  className="grid gap-4 px-5 py-4 sm:grid-cols-[auto_1fr_auto] sm:items-center"
                >
                  <BookCoverThumbnail title={item.title} coverImagePath={item.coverImagePath} className="h-20 w-14" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-semibold text-[var(--sl-text-header)]">{item.title}</h3>
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
                  <div className="flex flex-wrap items-center gap-2">
                    <ViewLocationButton titleId={item.titleId} availableOnly />
                    <Button variant="secondary" size="sm" onClick={() => setDetailTitleId(item.titleId)}>
                      <Eye size={15} aria-hidden="true" /> View details
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
        <div className="flex justify-end border-t border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] px-5 py-3.5">
          <Button
            disabled={checkoutBlocked}
            onClick={() =>
              ask(
                `Send ${items.length} ${items.length === 1 ? 'book' : 'books'} to the library desk. The loan starts when staff hand over the copy.`,
                () => {
                  void submit()
                },
              )
            }
          >
            {submitting ? 'Submitting…' : 'Check Out'}
          </Button>
        </div>
      </SectionCard>

      {receipt ? (
        <LumoDialog
          eyebrow="Request submitted"
          title="Cart sent to library desk"
          onClose={() => setReceipt(null)}
          footer={<Button onClick={() => setReceipt(null)}>Done</Button>}
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
            {receipt.items.map(item => (
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
          barcode={items.find(item => item.titleId === detailTitleId)?.previewBarcode ?? null}
          onClose={() => setDetailTitleId(null)}
        />
      ) : null}
    </>
  )
}
