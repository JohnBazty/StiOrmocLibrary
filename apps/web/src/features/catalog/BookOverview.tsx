import { ViewLocationButton } from '../floor-plan/ViewLocationButton'
import { Check, Clipboard, MapPin, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { AuthRole } from '../auth/auth-storage'
import { fetchBookOverview } from './book-catalog-api'
import { validateBookCartAddition } from './book-cart'
import { buildApaBookReference } from './book-citation'
import type { BookCatalogItem } from './book-catalog-types'
import { BookCoverThumbnail } from './BookCoverThumbnail'
import { CatalogDetailsPanel } from './CatalogDetailsPanel'

type Props = {
  titleId: number
  role: AuthRole
  activeBookCount: number
  bookLimit?: number | null
  selectedBookCount: number
  alreadySelected: boolean
  alreadyReserved?: boolean
  onAddToCart: (book: BookCatalogItem) => void
  onClose: () => void
  onReserve?: (book: BookCatalogItem) => void
  onRequest?: (book: BookCatalogItem) => void
  requestDisabled?: boolean
  requestError?: string
  requestNotice?: string
}

function Metadata({ label, value }: { label: string; value: string | number | null }) {
  return <div className="rounded-xl border border-[#0b5ea2]/10 bg-[#FFFFFF] p-3"><dt className="text-[10px] font-bold uppercase tracking-wider text-[#0b5ea2]/55">{label}</dt><dd className="mt-1 text-sm font-semibold text-[#0b5ea2]">{value || 'Not recorded'}</dd></div>
}

export function BookOverview({ titleId, role, activeBookCount, bookLimit, selectedBookCount, alreadySelected, alreadyReserved = false, onAddToCart, onClose, onReserve, onRequest, requestDisabled = false, requestError, requestNotice }: Props) {
  const [book, setBook] = useState<BookCatalogItem | null>(null)
  const [error, setError] = useState('')
  const [citationVisible, setCitationVisible] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setBook(null)
    setError('')
    fetchBookOverview(titleId, controller.signal).then(setBook).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load this book.')
    })
    return () => controller.abort()
  }, [titleId])

  const citation = useMemo(() => book ? buildApaBookReference(book) : '', [book])
  const addToCart = () => {
    if (!book) return
    const validation = validateBookCartAddition({ role, activeBookCount, bookLimit, selectedBookCount, alreadySelected })
    if (!validation.allowed) return setError(validation.message ?? 'This book cannot be added to the cart.')
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#0b5ea2]/45" role="dialog" aria-modal="true" aria-labelledby="book-overview-title">
      <button className="absolute inset-0" aria-label="Close book overview" onClick={onClose} />
      <aside className="relative z-10 h-full w-full max-w-2xl overflow-y-auto bg-[#FFFFFF] shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#0b5ea2]/10 bg-[#FFFFFF] px-5 py-4 sm:px-7">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0b5ea2]/60">Book overview</p><h2 id="book-overview-title" className="mt-1 font-display text-xl font-bold text-[#0b5ea2]">Complete catalog record</h2></div>
          <button onClick={onClose} aria-label="Close" className="rounded-xl border border-[#0b5ea2]/15 p-2 text-[#0b5ea2]"><X size={20} /></button>
        </header>

        <div className="p-5 sm:p-7">
          {requestError && <p role="alert" className="mb-4 rounded-xl bg-[#b42318] p-3 text-sm font-semibold text-white">{requestError}</p>}
          {requestNotice && <p role="status" className="mb-4 rounded-xl bg-[#0b5ea2] p-3 text-sm font-semibold text-white">{requestNotice}</p>}
          {error ? <div role="alert" className="mb-4 rounded-xl border border-[#0b5ea2] bg-[#FFF200] p-3 text-sm font-semibold text-[#0b5ea2]">{error}</div> : null}
          {!book && !error ? <div className="py-20 text-center text-sm font-semibold text-[#0b5ea2]">Loading book details…</div> : null}
          {book ? <>
            <section className="rounded-2xl border border-[#0b5ea2]/15 bg-[#FFFFFF] p-5 sm:p-7">
              <div className="flex justify-center">
                <BookCoverThumbnail
                  title={book.title}
                  coverImagePath={book.coverImagePath}
                  className="h-72 w-48 rounded-2xl border border-[#0b5ea2]/20 shadow-[0_12px_30px_rgba(11, 94, 162,0.18)] sm:h-80 sm:w-56"
                />
              </div>
              <div className="mx-auto mt-6 max-w-lg text-center">
                <h3 className="font-display text-2xl font-bold leading-tight text-[#0b5ea2]">{book.title}</h3>
                <p className="mt-2 text-sm font-semibold text-[#0b5ea2]/70">{book.author}</p>
                <span className="mt-4 inline-flex rounded-full bg-[#0b5ea2] px-3 py-1 text-xs font-bold text-[#FFFFFF]">{book.currentAvailabilityStatus}</span>
              </div>
            </section>

            <dl aria-label="Book catalog details" className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><ViewLocationButton titleId={book.titleId}/></div>
              <Metadata label="ISBN" value={book.isbn} />
              <Metadata label="Category" value={book.categoryName} />
              <Metadata label="Publication year" value={book.publicationYear} />
              <Metadata label="Publisher" value={book.publisher} />
              <Metadata label="Shelf location" value={book.shelfLocation ?? book.callNumber} />
              <Metadata label="Current condition" value={book.currentConditionStatus ?? null} />
              <Metadata label="Available stock" value={`${book.availableCopiesCount} of ${book.totalCopiesCount} copies`} />
            </dl>

            <CatalogDetailsPanel titleId={book.titleId}/>
            <section className="mt-5 rounded-2xl border border-[#0b5ea2]/10 p-4" aria-label="Individual book copies">
              <h3 className="font-bold text-[#0b5ea2]">Individual copies</h3>
              <div className="mt-3 space-y-2">{book.copies?.length ? book.copies.map(copy => <div key={copy.copyId} className="grid gap-1 rounded-xl border border-[#0b5ea2]/15 p-3 text-xs text-[#0b5ea2] sm:grid-cols-2"><strong>{copy.accessionNumber}</strong><span className="font-mono">{copy.barcode}</span><span>Availability: {copy.availability}</span><span>Condition: {copy.condition}</span><span className="sm:col-span-2">Shelf: {copy.shelf}</span></div>) : <p className="text-sm text-[#0b5ea2]/60">No active copies are recorded.</p>}</div>
            </section>

            <div className="mt-5 rounded-2xl border border-[#0b5ea2]/10 p-4">
              <button onClick={() => setCitationVisible((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#FFF200] px-4 text-sm font-bold text-[#0b5ea2]"><Clipboard size={17} /> Generate APA reference</button>
              {citationVisible ? <div className="mt-3"><label htmlFor="apa-reference" className="text-xs font-bold text-[#0b5ea2]">APA 7th Edition reference</label><textarea id="apa-reference" readOnly value={citation} className="mt-1.5 min-h-24 w-full resize-none rounded-xl border border-[#0b5ea2]/15 bg-[#FFFFFF] p-3 text-sm text-[#0b5ea2]" /><button onClick={copyCitation} className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-[#0b5ea2]">{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? 'Copied' : 'Copy to clipboard'}</button></div> : null}
            </div>

            <div className="mt-5 flex flex-col gap-3 border-t border-[#0b5ea2]/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#0b5ea2]/65"><MapPin size={15} />{book.shelfLocation ?? book.callNumber ?? 'Shelf not recorded'}</div>
              {['Student','Faculty'].includes(role) && onRequest && book.totalCopiesCount>0 ? <button onClick={()=>onRequest(book)} disabled={alreadySelected||requestDisabled} className="h-11 rounded-xl bg-[#0b5ea2] px-5 text-sm font-bold text-white disabled:opacity-50">{alreadySelected?'Requested / selected':requestDisabled?'Please wait…':book.availableCopiesCount>0?'Borrow book':'Reserve book'}</button> : null}
              {!onRequest && ['Student', 'Faculty'].includes(role) && book.availableCopiesCount > 0 ? <button onClick={addToCart} disabled={alreadySelected || requestDisabled} className="h-11 rounded-xl bg-[#0b5ea2] px-5 text-sm font-bold text-[#FFFFFF] disabled:opacity-50">{alreadySelected ? 'In borrow cart' : 'Borrow book'}</button> : null}
              {!onRequest && ['Student', 'Faculty'].includes(role) && book.totalCopiesCount > 0 && book.availableCopiesCount === 0 && onReserve ? <button onClick={() => onReserve(book)} disabled={requestDisabled || alreadyReserved} className="h-11 rounded-xl bg-[#FFF200] px-5 text-sm font-bold text-[#0b5ea2] disabled:opacity-50">{alreadyReserved ? 'Reserved' : requestDisabled ? 'Please wait…' : 'Reserve book'}</button> : null}
            </div>
          </> : null}
        </div>
      </aside>
    </div>
  )
}
