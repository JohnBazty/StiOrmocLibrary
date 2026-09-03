import { Download, Printer, X } from 'lucide-react'
import { useState } from 'react'
import type { BulkBookResult } from './types'
import { AssetCodeCanvas, downloadCanvasPng } from './AssetCodeCanvas'

export function BookLabelSheet({ batch, onClose }: { batch: BulkBookResult; onClose?: () => void }) {
  const [downloading, setDownloading] = useState<string | null>(null)
  const [error, setError] = useState('')
  async function download(physicalCopyId: number, kind: 'barcode' | 'qr') {
    const key = `${physicalCopyId}-${kind}`
    if (downloading) return
    setDownloading(key); setError('')
    try {
      const copy = batch.copies.find((item) => item.physicalCopyId === physicalCopyId)
      if (!copy) throw new Error('The requested label could not be found.')
      await downloadCanvasPng(`label-${kind}-${physicalCopyId}`, `${copy.accessionNumber}-${kind}.png`)
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The PNG file could not be downloaded.') }
    finally { setDownloading(null) }
  }
  return <section className="mb-5 rounded-2xl border border-[#003399]/15 bg-[#FFFFFF] shadow-sm">
    <style>{`@media print {
      @page { size: A4 portrait; margin: 10mm; }
      body * { visibility: hidden !important; }
      #book-label-sheet, #book-label-sheet * { visibility: visible !important; }
      #book-label-sheet { position: absolute; inset: 0; width: 100%; padding: 0 !important; }
      .smartlib-print-label { break-inside: avoid; page-break-inside: avoid; box-shadow: none !important; }
      #book-label-sheet .smartlib-no-print { display: none !important; }
    }`}</style>
    <div className="flex flex-col gap-3 border-b border-[#003399]/15 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#003399]">Generated copy labels</p><h2 className="mt-1 font-display text-lg font-bold text-[#003399]">{batch.numberOfCopies} labels ready to print</h2></div>
      <div className="flex gap-2"><button onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#003399] px-4 text-sm font-bold text-[#FFFFFF]"><Printer size={16} /> Print labels</button>{onClose ? <button aria-label="Close labels" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#003399]/20 bg-[#FFFFFF] text-[#003399]"><X size={17} /></button> : null}</div>
    </div>
    {error ? <div role="alert" className="mx-4 mt-4 rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#003399]">{error}</div> : null}
    <div id="book-label-sheet" className="grid gap-4 p-4 xl:grid-cols-2">{batch.copies.map((copy) => <article key={copy.physicalCopyId} className="smartlib-print-label rounded-xl border border-[#003399]/20 bg-[#FFFFFF] p-3">
      <div className="flex items-center gap-4 bg-[#FFFFFF] p-4">
        <div className="flex aspect-square w-[34%] min-w-[130px] items-center justify-center rounded-lg border border-[#003399]/20 bg-[#FFFFFF] p-2">
          <AssetCodeCanvas canvasId={`label-qr-${copy.physicalCopyId}`} dataUri={copy.qrCodeData} kind="QR code" testId={`label-qr-${copy.physicalCopyId}`} />
        </div>
        <div className="flex min-h-[150px] min-w-0 flex-1 flex-col items-center justify-center rounded-lg border border-[#003399]/20 bg-[#FFFFFF] px-4 py-3">
          <AssetCodeCanvas canvasId={`label-barcode-${copy.physicalCopyId}`} dataUri={copy.barcodeImageData} kind="Barcode" testId={`label-barcode-${copy.physicalCopyId}`} heading="STI COLLEGE ORMOC" footer={copy.barcode} />
        </div>
      </div>
      <div className="smartlib-no-print grid gap-2 px-4 pb-3 sm:grid-cols-2"><button type="button" disabled={downloading !== null} onClick={() => void download(copy.physicalCopyId, 'qr')} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-[#FFF200] px-3 text-xs font-bold text-[#003399] disabled:opacity-50"><Download size={14} />{downloading === `${copy.physicalCopyId}-qr` ? 'Downloading…' : 'Download QR Code PNG'}</button><button type="button" disabled={downloading !== null} onClick={() => void download(copy.physicalCopyId, 'barcode')} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-[#003399] px-3 text-xs font-bold text-[#FFFFFF] disabled:opacity-50"><Download size={14} />{downloading === `${copy.physicalCopyId}-barcode` ? 'Downloading…' : 'Download Barcode PNG'}</button></div>
      <div className="flex flex-wrap justify-between gap-2 border-t border-[#003399]/15 px-4 py-2 text-[10px] font-semibold text-[#003399]"><span>{copy.accessionNumber}</span><span>{copy.shelfLocation}</span></div>
    </article>)}</div>
  </section>
}
