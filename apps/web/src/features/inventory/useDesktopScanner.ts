import { useEffect, useRef } from 'react'

/** Captures keyboard-wedge barcode input without interfering with normal form typing. */
export function useDesktopScanner(onScan: (barcode: string) => void, enabled = true) {
  const callback = useRef(onScan)
  callback.current = onScan

  useEffect(() => {
    if (!enabled) return
    let buffer = ''
    let startedAt = 0
    let lastKeyAt = 0
    const reset = () => { buffer = ''; startedAt = 0; lastKeyAt = 0 }
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]') && target.dataset.scannerCapture !== 'true') return
      const now = performance.now()
      if (event.key === 'Enter') {
        const barcode = buffer.trim()
        const scannerSpeed = barcode.length >= 4 && startedAt > 0 && now - startedAt <= Math.max(500, barcode.length * 85)
        reset()
        if (scannerSpeed) { event.preventDefault(); callback.current(barcode) }
        return
      }
      if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) return
      if (lastKeyAt && now - lastKeyAt > 85) reset()
      if (!startedAt) startedAt = now
      buffer += event.key
      lastKeyAt = now
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
