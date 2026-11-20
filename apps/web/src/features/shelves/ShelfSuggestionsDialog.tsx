import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../../components/ui'
import { categoryApi, type ShelfSuggestions } from '../categories/category-api'
import { MoveCopiesDialog } from './MoveCopiesDialog'

const field = 'mt-1 block min-h-11 w-full rounded-xl border border-[#0b5ea2]/20 bg-white px-3 text-sm text-[#0b5ea2] dark:bg-[#20212b] dark:text-white'

/**
 * Books that belong on a shelf: their category's shelf is this one, or their DDC number is in the
 * shelf's range. Select some and move them here; the shelf's own books are listed in call-number order.
 */
export function ShelfSuggestionsDialog({ shelfId, onClose, onChanged }: { shelfId: number; onClose: () => void; onChanged: () => Promise<void> }) {
  const [data, setData] = useState<ShelfSuggestions | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [moving, setMoving] = useState(false)
  const [range, setRange] = useState({ ddcFrom: '', ddcTo: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const load = useCallback(async () => {
    try {
      const next = await categoryApi.shelfSuggestions(shelfId)
      setData(next); setSelected([]); setError('')
      setRange({ ddcFrom: next.shelf.ddcFrom ?? '', ddcTo: next.shelf.ddcTo ?? '' })
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Shelf suggestions could not be loaded.') }
  }, [shelfId])
  useEffect(() => { void load() }, [load])

  async function saveRange(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      await categoryApi.saveShelfDdcRange(shelfId, { ddcFrom: range.ddcFrom.trim(), ddcTo: range.ddcTo.trim() })
      setNotice(range.ddcFrom.trim() ? 'DDC range saved. Suggestions now include books in that range.' : 'DDC range cleared.')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The DDC range could not be saved.') }
    finally { setBusy(false) }
  }

  const suggestions = data?.suggestions ?? []
  const allSelected = suggestions.length > 0 && selected.length === suggestions.length
  const toggle = (id: number) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  const chosen = suggestions.filter(item => selected.includes(item.physicalCopyId))

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0b5ea2]/80 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="shelf-suggestions-title" className="mx-auto my-6 w-full max-w-3xl space-y-4 rounded-2xl bg-white p-5 text-[#0b5ea2] dark:bg-[#001a4d] dark:text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="shelf-suggestions-title" className="text-xl font-bold">{data ? `Books for ${data.shelf.name}` : 'Shelf suggestions'}</h2>
            <p className="mt-1 text-sm opacity-75">Books whose category belongs on this shelf, or whose DDC number is in its range, but which sit elsewhere or have no shelf yet.</p>
          </div>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
        {error ? <p role="alert" className="auth-error rounded-xl p-3 text-sm">{error}</p> : null}
        {notice ? <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950/30 dark:text-green-200">{notice}</p> : null}

        <form onSubmit={saveRange} className="grid gap-3 rounded-xl border border-[#0b5ea2]/15 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end dark:border-white/15">
          <label className="text-sm font-semibold">First DDC number<input className={field} inputMode="decimal" placeholder="e.g. 000" value={range.ddcFrom} disabled={busy} onChange={event => setRange({ ...range, ddcFrom: event.target.value })} /></label>
          <label className="text-sm font-semibold">Last DDC number<input className={field} inputMode="decimal" placeholder="e.g. 099.999" value={range.ddcTo} disabled={busy} onChange={event => setRange({ ...range, ddcTo: event.target.value })} /></label>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save DDC range'}</Button>
          <p className="text-xs opacity-75 sm:col-span-3">Optional. Leave both blank to suggest by category only.</p>
        </form>

        {!data ? (!error ? <p role="status">Loading suggestions…</p> : null) : <>
          <section aria-label="Suggested books" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold">Suggested books ({suggestions.length})</h3>
              {suggestions.length ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label="Select all suggested books" checked={allSelected} onChange={() => setSelected(allSelected ? [] : suggestions.map(item => item.physicalCopyId))} />Select all</label> : null}
            </div>
            {suggestions.length ? <ul className="divide-y divide-[#0b5ea2]/10 rounded-xl border border-[#0b5ea2]/15 dark:divide-white/10 dark:border-white/15">
              {suggestions.map(item => (
                <li key={item.physicalCopyId}>
                  <label className="flex cursor-pointer items-start gap-3 p-3 text-sm">
                    <input type="checkbox" className="mt-1" aria-label={`Select ${item.title} (${item.accession})`} checked={selected.includes(item.physicalCopyId)} onChange={() => toggle(item.physicalCopyId)} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{item.title}</span>
                      <span className="block text-xs opacity-75">{item.accession}{item.callNumber ? ` · ${item.callNumber}` : ''}{item.ddcCode ? ` · DDC ${item.ddcCode}` : ''}</span>
                      <span className="block text-xs">Now: {item.currentShelf ?? 'Unassigned'} · Why: {item.reason === 'category' ? `Category ${item.category ?? ''}`.trim() : 'DDC range'}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul> : <p className="text-sm opacity-75">Every book that belongs here is already on this shelf.</p>}
            {suggestions.length ? <Button disabled={!chosen.length} onClick={() => setMoving(true)}>{`Move ${chosen.length} selected to ${data.shelf.name}`}</Button> : null}
          </section>

          <section aria-label="On this shelf, in call-number order" className="space-y-2">
            <h3 className="font-bold">On this shelf, in call-number order ({data.onShelf.length})</h3>
            {data.onShelf.length ? <ol className="max-h-72 list-decimal space-y-1 overflow-y-auto rounded-xl border border-[#0b5ea2]/15 py-2 pl-9 pr-3 text-sm dark:border-white/15">
              {data.onShelf.map(item => <li key={item.physicalCopyId}><span className="font-semibold">{item.title}</span><span className="opacity-75"> · {item.callNumber ?? item.ddcCode ?? 'No call number'} · {item.accession} · C{item.shelfColumn} R{item.shelfRow}</span></li>)}
            </ol> : <p className="text-sm opacity-75">No books on this shelf yet.</p>}
          </section>
        </>}
      </section>
      {moving && data ? (
        <MoveCopiesDialog
          kind="Book"
          copies={chosen.map(item => ({ id: item.physicalCopyId, accession: item.accession, shelfLocation: item.currentShelf ?? '', shelfColumn: item.shelfColumn, shelfRow: item.shelfRow }))}
          initialPlacement={{ shelfLocation: data.shelf.name, shelfColumn: 1, shelfRow: 1 }}
          onClose={() => setMoving(false)}
          onMoved={async () => { setNotice(`${chosen.length === 1 ? '1 book' : `${chosen.length} books`} moved to ${data.shelf.name}.`); await load(); await onChanged() }}
        />
      ) : null}
    </div>,
    document.body,
  )
}
