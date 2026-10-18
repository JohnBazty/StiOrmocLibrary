import { useEffect, useId, useRef, useState } from 'react'
import type { Html5Qrcode } from 'html5-qrcode'
import { Button } from '../../components/ui'
import { STRINGS, type Lang } from './i18n'

/**
 * Tablet kiosk scanner: the camera starts automatically and decodes the code
 * (QR, or copy barcodes when qr is false). Manual entry is the fallback when
 * the camera is unavailable.
 */
export function KioskScanner({ qr = false, label, onScan, lang }: { qr?: boolean; label: string; onScan: (value: string) => void; lang: Lang }) {
  const t = STRINGS[lang]
  const readerId = `kiosk-scan-${useId().replace(/:/g, '')}`
  const scanner = useRef<Html5Qrcode | null>(null)
  const done = useRef(false)
  const [manual, setManual] = useState('')
  const [error, setError] = useState('')

  const stop = async () => {
    const instance = scanner.current
    scanner.current = null
    if (!instance) return
    try { if (instance.isScanning) await instance.stop(); await instance.clear() } catch { /* already released */ }
  }

  const emit = async (value: string) => {
    if (done.current) return
    done.current = true
    await stop()
    onScan(value)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats: F } = await import('html5-qrcode')
        const instance = new Html5Qrcode(readerId, {
          formatsToSupport: qr ? [F.QR_CODE] : [F.CODE_128, F.CODE_39, F.EAN_13, F.EAN_8, F.QR_CODE],
          verbose: false,
        })
        scanner.current = instance
        if (cancelled) { await stop(); return }
        await instance.start({ facingMode: 'environment' }, { fps: 10, qrbox: qr ? { width: 240, height: 240 } : { width: 280, height: 120 } }, text => void emit(text), () => {})
      } catch {
        setError(t.cameraUnavailable)
      }
    })()
    return () => { cancelled = true; void stop() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qr])

  const submitManual = () => { if (manual.trim()) void emit(manual.trim()) }

  return (
    <div className="space-y-3">
      <p className="font-bold">{label}</p>
      <div id={readerId} className="kiosk-scanner" />
      {error && <p role="alert">{error}</p>}
      <details className="rounded-xl border border-[#003399]/15 p-3">
        <summary className="cursor-pointer text-sm font-semibold opacity-70">{t.manualEntry}</summary>
        <div className="mt-2 flex gap-2">
          <input aria-label={t.manualEntry} value={manual} onChange={e => setManual(e.target.value)} autoComplete="off"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitManual() } }}
            className="w-full rounded-xl border border-[#003399]/20 bg-white p-3 text-[#003399]" />
          <Button onClick={submitManual} disabled={!manual.trim()}>{t.enter}</Button>
        </div>
      </details>
    </div>
  )
}
