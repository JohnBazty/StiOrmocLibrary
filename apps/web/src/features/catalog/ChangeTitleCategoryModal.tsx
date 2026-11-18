import { ArrowRight, MapPin, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { CatalogItem, Category } from './types'

type Props = {
  item: CatalogItem
  categories: Category[]
  saving: boolean
  error: string | null
  onClose: () => void
  onConfirm: (categoryId: number) => void
}

const selectClass = 'h-12 w-full rounded-xl border border-[#0b5ea2]/25 bg-white px-4 text-sm font-semibold text-[#0b5ea2] outline-none focus:border-[#0b5ea2] focus:ring-4 focus:ring-[#0b5ea2]/10'

export function ChangeTitleCategoryModal({ item, categories, saving, error, onClose, onConfirm }: Props) {
  const choices = useMemo(() => categories.filter((category) => category.categoryId !== item.categoryId), [categories, item.categoryId])
  const [selectedId, setSelectedId] = useState(choices[0]?.categoryId ?? 0)
  const selected = choices.find((category) => category.categoryId === selectedId) ?? null
  const recordLabel = item.recordType === 'Book' ? 'book' : 'research'
  const inventoryLabel = item.recordType === 'Book'
    ? `${item.activeInventoryCount} active book ${item.activeInventoryCount === 1 ? 'copy' : 'copies'}`
    : `${item.activeInventoryCount} active research ${item.activeInventoryCount === 1 ? 'copy' : 'copies'}`

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b5ea2]/70 p-4" role="dialog" aria-modal="true" aria-labelledby="change-category-title">
    <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
      <div className="flex items-start justify-between border-b border-[#0b5ea2]/15 px-6 py-5">
        <div><p className="text-xs font-bold uppercase tracking-widest text-[#0b5ea2]/60">Catalog assignment</p><h2 id="change-category-title" className="mt-1 text-2xl font-black text-[#0b5ea2]">Change {recordLabel} category</h2></div>
        <button type="button" aria-label="Close" disabled={saving} onClick={onClose} className="rounded-lg p-1 text-[#0b5ea2] disabled:opacity-40"><X /></button>
      </div>
      <div className="space-y-4 p-6">
        <div className="rounded-2xl bg-[#0b5ea2]/5 p-4">
          <p className="font-bold text-[#0b5ea2]">{item.title}</p>
          <p className="mt-1 text-sm text-[#0b5ea2]/65">Current: {item.categoryName ?? 'Uncategorized'} · {item.shelfLocation ?? 'No shelf'}</p>
        </div>
        <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#0b5ea2]">Move to category</span>
          <select aria-label="Move to category" className={selectClass} value={selectedId} onChange={(event) => setSelectedId(Number(event.target.value))}>
            {choices.length ? choices.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.categoryName}</option>) : <option value={0}>No other category available</option>}
          </select>
        </label>
        {selected ? <div className="flex items-center gap-3 rounded-2xl border border-[#0b5ea2]/15 p-4 text-[#0b5ea2]">
          <span className="rounded-xl bg-[#FFF200] p-2"><MapPin size={18} /></span>
          <div className="min-w-0"><p className="text-xs font-bold uppercase text-[#0b5ea2]/55">New shelf position</p><p className="font-bold">{selected.shelfLocation} · Column {selected.shelfColumn??1} · Row {selected.shelfRow??1}</p></div>
        </div> : null}
        <p className="text-sm leading-6 text-[#0b5ea2]/70">This moves this {recordLabel} and {inventoryLabel} to the selected category and its shelf. Loan, reservation, and availability records stay unchanged.</p>
        {error ? <p role="alert" className="rounded-xl bg-[#FFF200] px-4 py-3 text-sm font-semibold text-[#0b5ea2]">{error}</p> : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-[#0b5ea2]/15 px-6 py-4">
        <button type="button" disabled={saving} onClick={onClose} className="h-11 rounded-xl border border-[#0b5ea2]/25 px-5 text-sm font-bold text-[#0b5ea2] disabled:opacity-40">Cancel</button>
        <button type="button" disabled={saving || !selected} onClick={() => selected && onConfirm(selected.categoryId)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0b5ea2] px-5 text-sm font-bold text-white disabled:opacity-40">{saving ? `Moving ${recordLabel}…` : <>Move {recordLabel} <ArrowRight size={16} /></>}</button>
      </div>
    </div>
  </div>
}
