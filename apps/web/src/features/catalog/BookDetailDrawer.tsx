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

  return <div role="dialog" aria-modal="true" aria-labelledby="book-detail-title" className="fixed inset-0 z-[110] flex justify-end bg-[#003399]/55">
    <button aria-label="Close book details" onClick={onClose} className="absolute inset-0" />
    <aside className="relative z-10 h-full w-full max-w-xl overflow-y-auto bg-[#FFFFFF] shadow-2xl">
      <header className="flex items-start justify-between border-b border-[#003399]/15 p-5"><div><p className="text-xs font-bold uppercase tracking-wider text-[#003399]/60">Physical book details</p><h2 id="book-detail-title" className="mt-1 text-xl font-black text-[#003399]">Book and barcode</h2></div><button aria-label="Close" onClick={onClose} className="rounded-xl border border-[#003399]/15 p-2 text-[#003399]"><X size={19} /></button></header>
      <div className="p-5">{error ? <div role="alert" className="rounded-xl bg-[#FFF200] p-4 text-sm font-semibold text-[#003399]">{error}</div> : null}{!book && !error ? <div className="py-20 text-center text-sm font-semibold text-[#003399]">Loading book and barcode…</div> : null}{book && asset ? <><section className="rounded-2xl bg-[#003399] p-5 text-[#FFFFFF]"><div className="flex items-center gap-4"><BookCoverThumbnail title={book.title} coverImagePath={book.coverImagePath} className="h-28 w-20 border border-[#FFFFFF]/40" /><div className="min-w-0"><h3 className="text-xl font-bold">{book.title}</h3><p className="mt-1 text-sm text-[#FFFFFF]/80">{book.author}</p></div></div></section><dl className="mt-5 grid gap-3 rounded-xl border border-[#003399]/15 p-4 sm:grid-cols-2"><div><dt className="text-xs font-bold uppercase text-[#003399]/55">ISBN</dt><dd className="mt-1 text-sm font-semibold text-[#003399]">{book.isbn ?? 'Not recorded'}</dd></div><div><dt className="text-xs font-bold uppercase text-[#003399]/55">Publication year</dt><dd className="mt-1 text-sm font-semibold text-[#003399]">{book.publicationYear ?? 'Not recorded'}</dd></div><div><dt className="text-xs font-bold uppercase text-[#003399]/55">Publisher</dt><dd className="mt-1 text-sm font-semibold text-[#003399]">{book.publisher ?? 'Not recorded'}</dd></div><div><dt className="text-xs font-bold uppercase text-[#003399]/55">Book location</dt><dd className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-[#003399]"><MapPin size={14} />{asset.shelfLocation}</dd></div><div><dt className="text-xs font-bold uppercase text-[#003399]/55">Current condition</dt><dd className="mt-1 text-sm font-semibold text-[#003399]">{asset.conditionStatus ?? book.currentConditionStatus ?? 'Not recorded'}</dd></div></dl><section className="mt-5 rounded-xl border border-[#003399]/20 p-4"><h3 className="mb-3 flex items-center gap-2 font-bold text-[#003399]"><ScanBarcode size={18} /> Barcode</h3><div className="rounded-xl border border-[#003399]/15 p-4"><AssetCodeCanvas dataUri={asset.barcodeImageData} kind="Barcode" testId="book-detail-barcode" /><p className="mt-3 break-all text-center font-mono text-sm font-bold tracking-widest text-[#003399]">{asset.barcode}</p></div></section></> : null}</div>
    </aside>
  </div>
}
