import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, SectionCard } from '../../components/ui'
import { categoryApi } from '../categories/category-api'
import { ShelfEditor } from './ShelfEditor'
import { ShelfSuggestionsDialog } from './ShelfSuggestionsDialog'
import { useManagedShelves } from './useManagedShelves'
import type { ManagedShelf, ShelfPayload } from './types'

export function ShelfManagement({ shelves, loading = false, onRefresh }: { shelves: ManagedShelf[]; loading?: boolean; onRefresh: () => Promise<void> }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [editor, setEditor] = useState<{ shelf: ManagedShelf | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [suggestFor, setSuggestFor] = useState<number | null>(null)
  // ?suggestShelf=<name> (Category -> Manage category & shelves) opens that shelf's suggestions.
  useEffect(() => {
    const requested = searchParams.get('suggestShelf')
    if (!requested || loading) return
    const shelf = shelves.find(item => item.label === requested)
    if (shelf) setSuggestFor(shelf.id)
    const params = new URLSearchParams(searchParams)
    params.delete('suggestShelf')
    setSearchParams(params, { replace: true })
  }, [loading, searchParams, setSearchParams, shelves])
  useEffect(() => {
    if (searchParams.get('addShelf') !== '1') return
    setError('')
    setEditor({ shelf: null })
    const params = new URLSearchParams(searchParams)
    params.delete('addShelf')
    setSearchParams(params, { replace: true })
  }, [searchParams, setSearchParams])
  useEffect(() => {
    const requested = searchParams.get('editShelf')
    if (!requested || loading) return
    const shelf = shelves.find(item => item.id === Number(requested)) ?? null
    setError('')
    if (shelf) setEditor({ shelf })
    const params = new URLSearchParams(searchParams)
    params.delete('editShelf')
    setSearchParams(params, { replace: true })
  }, [loading, searchParams, setSearchParams, shelves])
  async function save(payload: ShelfPayload) {
    if (!editor) return
    setSaving(true); setError(''); setNotice('')
    try {
      if (editor.shelf) await categoryApi.updateShelf(editor.shelf.id, payload)
      else await categoryApi.addShelf(payload)
      await onRefresh()
      setEditor(null); setNotice(`Shelf ${payload.label} saved.`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Shelf could not be saved.') }
    finally { setSaving(false) }
  }
  return <SectionCard className="mb-5 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold">Managed shelves</h2><p className="mt-1 text-sm opacity-75">Set real shelf dimensions and copy limits before assigning books. Borrowed copies keep their home space.</p></div><Button onClick={() => { setError(''); setEditor({ shelf: null }) }}>Add shelf</Button></div>{notice ? <div role="status" data-tone="success" className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950/30 dark:text-green-200">{notice}<button aria-label="Dismiss shelf notice" className="min-h-11 px-3 underline" onClick={() => setNotice('')}>Dismiss</button></div> : null}<p className="mt-3 text-xs opacity-65">{shelves.length} shelves</p><div className="mt-4 space-y-3">{shelves.map(shelf => <details key={shelf.id} className="rounded-xl border border-[#0b5ea2]/15 dark:border-white/15"><summary className="cursor-pointer p-3"><strong>{shelf.label}</strong><span className="ml-3 text-xs">{shelf.columnCount} columns × {shelf.rowCount} rows · {shelf.status ?? 'Active'}</span><p className="mt-1 text-sm">{shelf.capacityConfigured ? `${shelf.used} used · ${Math.max(0, shelf.remaining ?? 0)} remaining · ${shelf.capacity} capacity` : 'Capacity not configured'}</p></summary><div className="border-t border-[#0b5ea2]/10 p-3 dark:border-white/10"><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setError(''); setEditor({ shelf }) }}>Edit shelf {shelf.label}</Button><Button variant="secondary" aria-label={`Suggested books for ${shelf.label}`} onClick={() => setSuggestFor(shelf.id)}>Suggested books</Button></div><div className="mt-3 max-w-full overflow-x-auto"><div className="grid gap-2" style={{gridTemplateColumns:`repeat(${shelf.columnCount}, minmax(150px, 1fr))`,minWidth:`${shelf.columnCount * 160}px`}}>{shelf.compartments?.map(cell => <div key={`${cell.column}-${cell.row}`} className={`rounded-lg border p-3 text-sm ${cell.status === 'Over capacity' || cell.status === 'Full' ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200' : cell.status === 'Nearly full' ? 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100' : 'border-[#0b5ea2]/15 dark:border-white/15'}`}><p className="font-semibold">Column {cell.column}, Row {cell.row}</p><p className="mt-1">{cell.used} used · {cell.remaining === null ? 'Unknown' : Math.max(0, cell.remaining)} remaining · {cell.capacity ?? 'Unset'} capacity</p><p className="mt-1 text-xs font-semibold">{cell.status}</p></div>)}</div></div></div></details>)}</div>{editor ? <ShelfEditor shelf={editor.shelf} saving={saving} error={error} onSave={save} onCancel={() => setEditor(null)}/> : null}{suggestFor !== null ? <ShelfSuggestionsDialog shelfId={suggestFor} onClose={() => setSuggestFor(null)} onChanged={onRefresh} /> : null}</SectionCard>
}

export function ShelfManagementPage() {
  const { shelves, error, loading, refresh } = useManagedShelves(true)
  return <>{error ? <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-red-800 dark:bg-red-950/30 dark:text-red-200">{error}</p> : null}{loading ? <p className="mb-3 text-sm">Loading shelves…</p> : null}<ShelfManagement shelves={shelves} loading={loading} onRefresh={refresh}/></>
}
