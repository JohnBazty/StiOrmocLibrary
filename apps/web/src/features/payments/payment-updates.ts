import { useEffect, useRef } from 'react'

export const PAYMENT_UPDATE_EVENT = 'library-payments-updated'
export const PAYMENT_UPDATE_KEY = 'sti-library-payment-update'

/** Broadcast an invalidation only. Never store payment details or wallet inputs. */
export function notifyPaymentUpdate() {
  window.dispatchEvent(new Event(PAYMENT_UPDATE_EVENT))
  try { localStorage.setItem(PAYMENT_UPDATE_KEY, `${Date.now()}:${Math.random()}`) } catch { /* Same-tab updates still work without storage. */ }
}

/** Refresh data in place; inputs and open forms remain owned by their page. */
export function usePaymentUpdates(refresh: () => unknown | Promise<unknown>, interval = 30_000) {
  const latest = useRef(refresh)
  latest.current = refresh
  useEffect(() => {
    let active = true, running = false, queued = false
    const run = async () => {
      if (!active || document.hidden) return
      if (running) { queued = true; return }
      running = true
      try {
        do {
          queued = false
          await latest.current()
        } while (queued && active && !document.hidden)
      } catch { /* The page retains its last confirmed data and reports read failures. */ }
      finally { running = false }
    }
    const changed = () => { void run() }
    const storage = (event: StorageEvent) => { if (event.key === PAYMENT_UPDATE_KEY) changed() }
    window.addEventListener(PAYMENT_UPDATE_EVENT, changed)
    window.addEventListener('storage', storage)
    window.addEventListener('focus', changed)
    document.addEventListener('visibilitychange', changed)
    const timer = window.setInterval(changed, interval)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener(PAYMENT_UPDATE_EVENT, changed)
      window.removeEventListener('storage', storage)
      window.removeEventListener('focus', changed)
      document.removeEventListener('visibilitychange', changed)
    }
  }, [interval])
}
