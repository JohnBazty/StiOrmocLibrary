import { createPortal } from 'react-dom'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui'
import { enhancedCatalog } from '../catalog/enhanced-catalog-api'
import { ShelfPlacementFields, placementFits } from './ShelfPlacementFields'
import { useManagedShelves } from './useManagedShelves'
import type { PlacementValue } from './types'

export function RestoreCopiesDialog({ title, titleId, copyIds, quantity, onClose, onRestored }: { title: string; titleId?: number; copyIds?: number[]; quantity: number; onClose: () => void; onRestored: () => Promise<void> }) {
  const [choose, setChoose] = useState(false)
  const [placement, setPlacement] = useState<PlacementValue>({ shelfLocation: '', shelfColumn: 1, shelfRow: 1 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { shelves, loading, error: loadError, refresh } = useManagedShelves()
  const shelf = shelves.find(item => item.label === placement.shelfLocation)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || choose && !placementFits(shelves, placement, quantity)) return
    setSaving(true); setError('')
    try {
      await enhancedCatalog.restoreCopies({ kind: 'Book', ...(copyIds ? { copyIds } : { titleId }), ...(choose && shelf ? { locationId: shelf.id, shelfColumn: placement.shelfColumn, shelfRow: placement.shelfRow } : {}) })
      await onRestored(); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The archived record could not be restored.'); await refresh() }
    finally { setSaving(false) }
  }
  return createPortal(<div className="fixed inset-0 z-50 overflow-y-auto bg-[#0b5ea2]/80 p-4"><section role="dialog" aria-modal="true" aria-labelledby="restore-copies-title" className="mx-auto my-6 w-full max-w-2xl rounded-2xl bg-white p-5 text-[#0b5ea2] dark:bg-[#001a4d] dark:text-white"><h2 id="restore-copies-title" className="text-xl font-bold">Restore archived books</h2><p className="mt-2 text-sm">Restore <strong>{title}</strong>{copyIds ? ' — selected copy' : ' and its archived copies'} to active inventory. The system checks shelf capacity before restoring.</p>{error ? <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">{error}</p> : null}<form onSubmit={submit} className="mt-4 space-y-4"><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={choose} disabled={saving} onChange={event=>setChoose(event.target.checked)}/>Choose another compartment instead of the original location</label>{choose ? <ShelfPlacementFields shelves={shelves} value={placement} onChange={setPlacement} quantity={quantity} loading={loading} error={loadError} disabled={saving}/> : <p className="text-sm opacity-75">Copies will return to their saved compartments only if enough space remains.</p>}<div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving || choose && !placementFits(shelves,placement,quantity)}>{saving ? 'Restoring…' : 'Restore to inventory'}</Button></div></form></section></div>, document.body)
}
