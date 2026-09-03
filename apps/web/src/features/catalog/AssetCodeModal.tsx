import { Download, QrCode, ScanBarcode, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { catalogApi } from './catalog-api'
import { AssetCodeCanvas } from './AssetCodeCanvas'
import type { AdminBookAsset } from './types'

type AssetCodeModalProps =
  | { assetType?: never; physicalCopyId: number; researchInventoryId?: never; onClose: () => void }
  | { assetType: 'research'; researchInventoryId: number; physicalCopyId?: never; onClose: () => void }

export function AssetCodeModal(props: AssetCodeModalProps) {
  const { onClose } = props
  const isResearch = props.assetType === 'research'
  const assetType = isResearch ? 'research' : 'book'
  const assetId = isResearch ? props.researchInventoryId : props.physicalCopyId
  const [asset, setAsset] = useState<AdminBookAsset | null>(null)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState<'barcode' | 'qr' | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setAsset(null); setError('')
    const load = assetType === 'research' ? catalogApi.researchAsset : catalogApi.asset
    load(assetId, controller.signal).then(setAsset).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'The asset codes could not be loaded.')
    })
    return () => controller.abort()
  }, [assetId, assetType])

  async function download(kind: 'barcode' | 'qr') {
    if (!asset || downloading) return
    setDownloading(kind); setError('')
    try {
      if (assetType === 'research') await catalogApi.downloadAssetPng(assetId, kind, 'research')
      else await catalogApi.downloadAssetPng(assetId, kind)
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The PNG file could not be downloaded.') }
    finally { setDownloading(null) }
  }

  return <div role="dialog" aria-modal="true" aria-labelledby="asset-code-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-[#003399]/65 p-4 backdrop-blur-sm">
    <button aria-label="Close asset codes" onClick={onClose} className="absolute inset-0" />
    <section className="relative z-10 max-h-[95vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-[#003399]/15 bg-[#FFFFFF] shadow-2xl">
      <header className="flex items-start justify-between border-b border-[#003399]/15 p-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#003399]/60">{assetType === 'research' ? 'Research inventory asset inspection' : 'Administrative asset inspection'}</p><h2 id="asset-code-title" className="mt-1 font-display text-xl font-black text-[#003399]">Barcode and QR code</h2></div><button aria-label="Close" onClick={onClose} className="rounded-xl border border-[#003399]/15 p-2 text-[#003399]"><X size={19} /></button></header>
      <div className="p-5 sm:p-6">
        {error ? <div role="alert" className="mb-4 rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#003399]">{error}</div> : null}
        {!asset && !error ? <div className="py-20 text-center text-sm font-semibold text-[#003399]">Loading asset codes…</div> : null}
        {asset ? <><div className="mb-5 rounded-xl bg-[#003399] p-4 text-[#FFFFFF]"><h3 className="font-display text-lg font-bold">{asset.title}</h3><p className="mt-1 text-sm text-[#FFFFFF]/80">{asset.author}</p><p className="mt-2 font-mono text-xs">{asset.accessionNumber} · {asset.barcode}</p></div>
          <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.8fr)_minmax(460px,1.4fr)]">
            <article className="rounded-xl border border-[#003399]/20 bg-[#FFFFFF] p-4"><div className="mb-3 flex items-center gap-2 font-bold text-[#003399]"><QrCode size={18} /> QR code</div><div className="flex min-h-[252px] items-center justify-center rounded-xl border border-[#003399]/15 p-4"><AssetCodeCanvas dataUri={asset.qrCodeData} kind="QR code" testId="admin-qr-code" /></div><button disabled={downloading !== null} onClick={() => void download('qr')} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#FFF200] px-4 text-sm font-bold text-[#003399] disabled:opacity-50"><Download size={16} />{downloading === 'qr' ? 'Downloading…' : 'Download QR Code PNG'}</button></article>
            <article className="rounded-xl border border-[#003399]/20 bg-[#FFFFFF] p-4"><div className="mb-3 flex items-center gap-2 font-bold text-[#003399]"><ScanBarcode size={18} /> Barcode</div><div className="flex min-h-[252px] flex-col items-center justify-center rounded-xl border border-[#003399]/15 p-4"><AssetCodeCanvas dataUri={asset.barcodeImageData} kind="Barcode" testId="admin-barcode" /><p className="mt-3 break-all text-center font-mono text-sm font-bold tracking-[0.12em] text-[#003399]">{asset.barcode}</p></div><button disabled={downloading !== null} onClick={() => void download('barcode')} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#003399] px-4 text-sm font-bold text-[#FFFFFF] disabled:opacity-50"><Download size={16} />{downloading === 'barcode' ? 'Downloading…' : 'Download Barcode PNG'}</button></article>
          </div></> : null}
      </div>
    </section>
  </div>
}
