import { BookOpen, MapPin, ScanBarcode, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AssetCodeCanvas } from './AssetCodeCanvas'
import { fetchBookOverview, fetchCatalogCopyAsset } from './book-catalog-api'
import type { CatalogCopyAsset } from './book-catalog-types'

export function CartAssetOverview({ titleId, barcode, onClose }: { titleId: number; barcode: string | null; onClose: () => void }) {
  const [asset, setAsset] = useState<CatalogCopyAsset | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setAsset(null); setError('')
    void (async () => {
      try {
        const resolvedBarcode = barcode ?? (await fetchBookOverview(titleId, controller.signal)).previewBarcode
        if (!resolvedBarcode) throw new Error('No available physical barcode is assigned to this cart item.')
        setAsset(await fetchCatalogCopyAsset(resolvedBarcode, controller.signal))
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'The book details could not be loaded.')
      }
    })()
    return () => controller.abort()
  }, [barcode, titleId])

  return <div role="dialog" aria-modal="true" aria-labelledby="cart-asset-title" className="fixed inset-0 z-[100] flex justify-end bg-[#003399]/55 backdrop-blur-sm">
    <button aria-label="Close cart details" onClick={onClose} className="absolute inset-0" />
    <aside className="relative z-10 h-full w-full max-w-xl overflow-y-auto bg-[#FFFFFF] shadow-2xl">
      <header className="flex items-start justify-between border-b border-[#003399]/15 p-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#003399]/60">Cart copy details</p><h2 id="cart-asset-title" className="mt-1 font-display text-xl font-black text-[#003399]">Book barcode</h2></div><button aria-label="Close" onClick={onClose} className="rounded-xl border border-[#003399]/15 p-2 text-[#003399]"><X size={19} /></button></header>
      <div className="p-5 sm:p-6">
        {error ? <div role="alert" className="rounded-xl bg-[#FFF200] p-4 text-sm font-semibold text-[#003399]">{error}</div> : null}
        {!asset && !error ? <div className="py-20 text-center text-sm font-semibold text-[#003399]">Loading barcode…</div> : null}
        {asset ? <><div className="rounded-2xl bg-[#003399] p-5 text-[#FFFFFF]"><div className="flex gap-3"><span className="rounded-xl bg-[#FFF200] p-3 text-[#003399]"><BookOpen size={22} /></span><div><h3 className="font-display text-xl font-bold">{asset.title}</h3><p className="mt-1 text-sm text-[#FFFFFF]/80">{asset.author}</p></div></div><p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold"><MapPin size={16} />{asset.shelfLocation}</p></div>
          <section className="mt-5 rounded-xl border border-[#003399]/20 p-4"><h3 className="mb-3 flex items-center gap-2 font-bold text-[#003399]"><ScanBarcode size={18} /> Physical copy barcode</h3><div className="flex min-h-[252px] flex-col items-center justify-center rounded-xl border border-[#003399]/15 p-4"><AssetCodeCanvas dataUri={asset.barcodeImageData} kind="Barcode" testId="cart-barcode-canvas" /><p className="mt-3 break-all text-center font-mono text-sm font-bold tracking-[0.12em] text-[#003399]">{asset.barcode}</p></div></section>
        </> : null}
      </div>
    </aside>
  </div>
}
