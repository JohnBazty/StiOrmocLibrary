import { useEffect, useRef } from 'react'

/** Accepts fast keyboard-wedge scanner input terminated by Enter. */
export function useBarcodeScanner(onScan: (value: string) => void, enabled = true) {
  const callback = useRef(onScan)
  callback.current = onScan

  useEffect(() => {
    if (!enabled) return
    let buffer = ''
    let lastKeyAt = 0
    let startedAt = 0
    const reset = () => { buffer = ''; lastKeyAt = 0; startedAt = 0 }
    const listener = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select') && target.dataset.scannerCapture !== 'true') return
      const now = performance.now()
      if (event.key === 'Enter') {
        const value = buffer.trim()
        const isScannerSpeed = value.length >= 4 && now - startedAt <= Math.max(500, value.length * 85)
        reset()
        if (isScannerSpeed) { event.preventDefault(); callback.current(value) }
        return
      }
      if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) return
      if (lastKeyAt && now - lastKeyAt > 85) reset()
      if (!startedAt) startedAt = now
      buffer += event.key
      lastKeyAt = now
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [enabled])
}

