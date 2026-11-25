import { NoticeBanner } from '../../components/ui'
import { ViewLocationButton } from '../floor-plan/ViewLocationButton'
import { MapPin, ScanBarcode, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AssetCodeCanvas } from './AssetCodeCanvas'
import { fetchBookOverview, fetchCatalogCopyAsset } from './book-catalog-api'
import type { BookCatalogItem, CatalogCopyAsset } from './book-catalog-types'
import { BookCoverThumbnail } from './BookCoverThumbnail'

export function BookDetailDrawer({ titleId, barcode, onClose }: { titleId: number; barcode: string | null; onClose: () => void }) {
  const [book, setBook] = useState<BookCatalogItem | null>(null)
  const [asset, setAsset] = useState<CatalogCopyAsset | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setBook(null); setAsset(null); setError('')
    void (async () => {
      try {
        const overview = await fetchBookOverview(titleId, controller.signal)
        const resolvedBarcode = barcode ?? overview.previewBarcode
        if (!resolvedBarcode) throw new Error('No physical barcode is assigned to this transaction.')
        const copy = await fetchCatalogCopyAsset(resolvedBarcode, controller.signal)
        setBook(overview); setAsset(copy)
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'The book details could not be loaded.')
      }
    })()
    return () => controller.abort()
  }, [barcode, titleId])

  return <div role="dialog" aria-modal="true" aria-labelledby="book-detail-title" className="fixed inset-0 z-[110] flex justify-end bg-slate-950/55">
    <button aria-label="Close book details" onClick={onClose} className="absolute inset-0" />
    <aside className="relative z-10 h-full w-full max-w-xl overflow-y-auto bg-[var(--sl-bg-elevated)] text-[var(--sl-text)] shadow-[var(--sl-shadow-l)]">
      <header className="flex items-start justify-between border-b border-[var(--sl-border)] p-5"><div><p className="text-[11px] font-bold uppercase tracking-wider text-[var(--sl-text-muted)]">Physical book details</p><h2 id="book-detail-title" className="mt-1 font-display text-xl font-bold text-[var(--sl-text-header)]">Book and barcode</h2></div><button aria-label="Close" onClick={onClose} className="rounded-[6px] border border-[var(--sl-border-strong)] p-2 text-[var(--sl-text-secondary)] hover:bg-[var(--sl-bg-hover)]"><X size={19} /></button></header>
      <div className="p-5">{error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}{!book && !error ? <div className="py-20 text-center text-sm font-medium text-[var(--sl-text-secondary)]">Loading book and barcode…</div> : null}{book && asset ? <><section className="rounded-[10px] bg-[#0b5ea2] p-5 text-white"><div className="flex items-center gap-4"><BookCoverThumbnail title={book.title} coverImagePath={book.coverImagePath} className="h-28 w-20 rounded-[6px] border border-white/40" /><div className="min-w-0"><h3 className="text-xl font-bold">{book.title}</h3><p className="mt-1 text-sm text-white/80">{book.author}</p></div></div></section><dl className="mt-5 grid gap-3 rounded-[10px] border border-[var(--sl-border)] p-4 sm:grid-cols-2"><div><dt className="text-[11px] font-semibold uppercase text-[var(--sl-text-muted)]">ISBN</dt><dd className="mt-1 text-sm font-semibold text-[var(--sl-text-header)]">{book.isbn ?? 'Not recorded'}</dd></div><div><dt className="text-[11px] font-semibold uppercase text-[var(--sl-text-muted)]">Publication year</dt><dd className="mt-1 text-sm font-semibold text-[var(--sl-text-header)]">{book.publicationYear ?? 'Not recorded'}</dd></div><div><dt className="text-[11px] font-semibold uppercase text-[var(--sl-text-muted)]">Publisher</dt><dd className="mt-1 text-sm font-semibold text-[var(--sl-text-header)]">{book.publisher ?? 'Not recorded'}</dd></div><div><dt className="text-[11px] font-semibold uppercase text-[var(--sl-text-muted)]">Book location</dt><dd className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-[var(--sl-text-header)]"><MapPin size={14} className="text-[#0f766e] dark:text-[#5eead4]" />{asset.shelfLocation}</dd></div><div><dt className="text-[11px] font-semibold uppercase text-[var(--sl-text-muted)]">Current condition</dt><dd className="mt-1 text-sm font-semibold text-[var(--sl-text-header)]">{asset.conditionStatus ?? book.currentConditionStatus ?? 'Not recorded'}</dd></div></dl><div className="mt-4"><ViewLocationButton titleId={titleId} barcode={barcode}/></div><section className="mt-5 rounded-[10px] border border-[var(--sl-border)] p-4"><h3 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold text-[var(--sl-text-header)]"><ScanBarcode size={18} className="text-[#0b5ea2] dark:text-[#93c5fd]" /> Barcode</h3><div className="rounded-[8px] border border-[var(--sl-border)] bg-white p-4"><AssetCodeCanvas dataUri={asset.barcodeImageData} kind="Barcode" testId="book-detail-barcode" /><p className="mt-3 break-all text-center font-mono text-sm font-bold tracking-widest text-[#132a3f]">{asset.barcode}</p></div></section></> : null}</div>
    </aside>
  </div>
}
