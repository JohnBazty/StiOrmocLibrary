import { type FormEvent, useState } from 'react'
import { X } from 'lucide-react'
import type { Category, CategoryPayload } from './types'

const inputClass = 'h-11 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 text-sm text-[#003399] outline-none focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10'

export function CreateCategoryModal({ category, shelves, saving, errors, onSubmit, onClose }: {
  category: Category | null
  shelves: Array<{ id: number; label: string; columnCount: number; rowCount: number }>
  saving: boolean
  errors: Record<string, string>
  onSubmit: (payload: CategoryPayload) => Promise<void>
  onClose: () => void
}) {
  const currentShelfIsManaged = !category || shelves.some((shelf) => shelf.label === category.shelfLocation)
  const [shelfLabel, setShelfLabel] = useState(currentShelfIsManaged ? category?.shelfLocation ?? '' : '')
  const selectedShelf = shelves.find((shelf) => shelf.label === shelfLabel)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void onSubmit({
      categoryName: String(data.get('categoryName') ?? ''),
      shelfLocation: String(data.get('shelfLocation') ?? ''),
      shelfColumn: Number(data.get('shelfColumn') ?? 1),
      shelfRow: Number(data.get('shelfRow') ?? 1),
    })
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#003399]/80 p-4">
    <div role="dialog" aria-modal="true" aria-labelledby="category-record-title" className="w-full max-w-lg rounded-2xl bg-[#FFFFFF] shadow-2xl">
      <header className="flex items-start justify-between border-b border-[#003399]/15 p-5"><div><p className="text-xs font-bold uppercase text-[#003399]">Category record</p><h2 id="category-record-title" className="text-xl font-black text-[#003399]">{category ? 'Edit category' : 'Create category'}</h2></div><button aria-label="Close" disabled={saving} onClick={onClose} className="p-2 text-[#003399] disabled:opacity-40"><X /></button></header>
      <form onSubmit={submit} className="space-y-4 p-5">
        <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase text-[#003399]">Category name *</span><input name="categoryName" required maxLength={100} defaultValue={category?.categoryName ?? ''} className={inputClass} />{errors.categoryName ? <span className="mt-1 block text-xs font-semibold text-[#003399]">{errors.categoryName}</span> : null}</label>
        <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase text-[#003399]">Shelf location *</span><select name="shelfLocation" required value={shelfLabel} onChange={(event) => setShelfLabel(event.target.value)} className={inputClass}><option value="">{currentShelfIsManaged ? 'Select a shelf' : `Current location “${category?.shelfLocation}” is not in Floor Plan — select a shelf`}</option>{shelves.map((shelf) => <option key={shelf.id} value={shelf.label}>{shelf.label}</option>)}</select>{errors.shelfLocation ? <span className="mt-1 block text-xs font-semibold text-[#003399]">{errors.shelfLocation}</span> : null}{!shelves.length ? <span className="mt-1 block text-xs text-[#003399]/65">Create a shelf in Floor Plan first.</span> : null}</label>
        {selectedShelf ? <div key={selectedShelf.id} className="grid grid-cols-2 gap-3"><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase text-[#003399]">Column *</span><select name="shelfColumn" defaultValue={category?.shelfLocation===shelfLabel?category.shelfColumn:1} className={inputClass}>{Array.from({length:selectedShelf.columnCount},(_,index)=><option key={index+1} value={index+1}>Column {index+1}</option>)}</select>{errors.shelfColumn?<span className="mt-1 block text-xs font-semibold">{errors.shelfColumn}</span>:null}</label><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase text-[#003399]">Row *</span><select name="shelfRow" defaultValue={category?.shelfLocation===shelfLabel?category.shelfRow:1} className={inputClass}>{Array.from({length:selectedShelf.rowCount},(_,index)=><option key={index+1} value={index+1}>Row {index+1}</option>)}</select>{errors.shelfRow?<span className="mt-1 block text-xs font-semibold">{errors.shelfRow}</span>:null}</label></div>:null}
        <div className="flex justify-end gap-2 pt-2"><button type="button" disabled={saving} onClick={onClose} className="h-11 rounded-xl border border-[#003399] bg-[#FFFFFF] px-5 font-bold text-[#003399] disabled:opacity-40">Cancel</button><button disabled={saving || !shelves.length} type="submit" className="h-11 rounded-xl bg-[#003399] px-5 font-bold text-[#FFFFFF] disabled:opacity-50">{saving ? 'Saving…' : 'Save category'}</button></div>
      </form>
    </div>
  </div>
}
