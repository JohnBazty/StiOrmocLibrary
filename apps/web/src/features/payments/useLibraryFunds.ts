import { useCallback, useEffect, useRef, useState } from 'react'
import { moneyOutApi, type FundsOverview } from './money-out-api'

export function useLibraryFunds() {
  const [data, setData] = useState<FundsOverview | null>(null), [error, setError] = useState(''), [refreshing, setRefreshing] = useState(false)
  const version = useRef(0), flight = useRef<Promise<void> | null>(null), current = useRef<FundsOverview | null>(null)
  const refresh = useCallback(() => {
    if (flight.current) return flight.current
    const request = ++version.current
    setRefreshing(true); setError('')
    const run = (async () => {
      try {
        await moneyOutApi.recover()
        const result = await moneyOutApi.overview()
        if (request === version.current) { current.current = result; setData(result) }
      } catch (cause) { if (request === version.current) setError(cause instanceof Error ? cause.message : 'Library funds could not load.') }
      finally { if (request === version.current) { flight.current = null; setRefreshing(false) } }
    })()
    flight.current = run; return run
  }, [])
  const refreshAfterChange = useCallback(async () => {
    // A mutation must not reuse a read that began before the action completed.
    if (flight.current) await flight.current
    await refresh()
  }, [refresh])
  useEffect(() => {
    void refresh()
    const poll = () => {
      if (document.hidden || !current.current?.operations.some(row => ['Processing', 'Review'].includes(row.state)
        || row.state === 'Succeeded' && row.rail === 'Transfer' && Date.now() - Date.parse(row.createdAt) < 24 * 60 * 60_000)) return
      void refresh()
    }
    const focus = () => { if (!document.hidden) void refresh() }
    const timer = window.setInterval(poll, 10_000)
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', focus)
    return () => { version.current++; flight.current = null; window.clearInterval(timer); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus) }
  }, [refresh])
  return { data, error, setError, refreshing, refresh, refreshAfterChange }
}
