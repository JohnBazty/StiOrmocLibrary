import { createPortal } from 'react-dom'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui'
import { useConfirmSave } from '../../components/ConfirmSaveDialog'
import { confirmLeave, UnsavedGuard } from '../../components/UnsavedChanges'
import { enhancedCatalog } from '../catalog/enhanced-catalog-api'
import { ShelfPlacementFields, selectedCompartment } from './ShelfPlacementFields'
import { useManagedShelves } from './useManagedShelves'
import type { PlacementValue } from './types'

export type MovableCopy = { id: number; accession: string; shelfLocation: string; shelfColumn: number; shelfRow: number }
export function MoveCopiesDialog({ kind, copies, onClose, onMoved }: { kind: 'Book' | 'Research/Thesis'; copies: MovableCopy[]; onClose: () => void; onMoved: () => Promise<void> }) {
  const { shelves, error: loadError, loading, refresh } = useManagedShelves()
  const [placement, setPlacement] = useState<PlacementValue>({ shelfLocation: copies[0]?.shelfLocation ?? '', shelfColumn: copies[0]?.shelfColumn ?? 1, shelfRow: copies[0]?.shelfRow ?? 1 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { ask, dialog } = useConfirmSave()
  const shelf = shelves.find(item => item.label === placement.shelfLocation)
  const cell = selectedCompartment(shelves, placement)
  const returning = copies.filter(copy => copy.shelfLocation === placement.shelfLocation && copy.shelfColumn === placement.shelfColumn && copy.shelfRow === placement.shelfRow).length
  const enough = Boolean(cell && cell.capacity !== null && cell.remaining !== null && cell.remaining + returning >= copies.length)
  async function save() {
    if (saving || !enough || !shelf) return
    setSaving(true); setError('')
    try {
      await enhancedCatalog.moveCopies({ kind, copyIds: copies.map(copy => copy.id), locationId: shelf.id, shelfColumn: placement.shelfColumn, shelfRow: placement.shelfRow })
      await onMoved(); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Copies could not be moved.'); await refresh() }
    finally { setSaving(false) }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !enough || !shelf) return
    const count = copies.length === 1 ? '1 copy' : `${copies.length} copies`
    ask(`Move ${count} to ${shelf.label}, Column ${placement.shelfColumn}, Row ${placement.shelfRow}.`, () => { void save() })
  }
  return createPortal(<div className="fixed inset-0 z-50 overflow-y-auto bg-[#0b5ea2]/80 p-4"><section role="dialog" aria-modal="true" aria-labelledby="move-copies-title" className="mx-auto my-6 w-full max-w-2xl rounded-2xl bg-white p-5 text-[#0b5ea2] dark:bg-[#001a4d] dark:text-white"><h2 id="move-copies-title" className="text-xl font-bold">Move copies</h2><p className="mt-2 text-sm">Choose the home compartment for {copies.length} selected {copies.length === 1 ? 'copy' : 'copies'}. Borrowing status and category stay unchanged.</p><ul className="my-3 max-h-36 list-inside list-disc overflow-y-auto text-xs">{copies.map(copy => <li key={copy.id}>{copy.accession}: {copy.shelfLocation}, Column {copy.shelfColumn}, Row {copy.shelfRow}</li>)}</ul>{error ? <p role="alert" className="my-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">{error}</p> : null}<UnsavedGuard cleanOnSubmit><form onSubmit={submit} className="space-y-4"><ShelfPlacementFields shelves={shelves} value={placement} onChange={setPlacement} quantity={copies.length} disabled={saving} loading={loading} error={loadError} credits={copies}/>{shelf ? <p className="rounded-xl border p-3 text-sm">Move <strong>{copies.length} {copies.length === 1 ? 'copy' : 'copies'}</strong> to <strong>{shelf.label}, Column {placement.shelfColumn}, Row {placement.shelfRow}</strong>.</p> : null}<div className="flex justify-end gap-3"><Button type="button" variant="secondary" disabled={saving} onClick={() => confirmLeave(onClose)}>Cancel</Button><Button type="submit" disabled={saving || !enough}>{saving ? 'Moving…' : `Move ${copies.length} ${copies.length === 1 ? 'copy' : 'copies'}`}</Button></div></form></UnsavedGuard>{dialog}</section></div>, document.body)
}
