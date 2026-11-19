import { useCallback, useEffect, useState } from 'react'
import { categoryApi } from '../categories/category-api'
import type { ManagedShelf } from './types'

export function useManagedShelves(includeArchived = false) {
  const [shelves, setShelves] = useState<ManagedShelf[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => {
    setLoading(true)
    try { const loaded = await categoryApi.listShelves(includeArchived); if (!Array.isArray(loaded)) throw new Error('Shelf list could not be loaded.'); setShelves(loaded); setError('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Shelves could not be loaded.') }
    finally { setLoading(false) }
  }, [includeArchived])
  useEffect(() => { void refresh() }, [refresh])
  return { shelves, error, loading, refresh }
}
