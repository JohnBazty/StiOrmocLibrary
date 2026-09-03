import { type FormEvent } from 'react'
import { X } from 'lucide-react'
import type { Category, CategoryPayload } from './types'

const inputClass = 'h-11 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 text-sm text-[#003399] outline-none focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10'

export function CreateCategoryModal({ category, saving, errors, onSubmit, onClose }: {
  category: Category | null
  saving: boolean
  errors: Record<string, string>
  onSubmit: (payload: CategoryPayload) => Promise<void>
  onClose: () => void
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    void onSubmit({
      categoryName: String(data.get('categoryName') ?? ''),
      shelfLocation: String(data.get('shelfLocation') ?? ''),
    })
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#003399]/80 p-4">
    <div role="dialog" aria-modal="true" aria-labelledby="category-record-title" className="w-full max-w-lg rounded-2xl bg-[#FFFFFF] shadow-2xl">
      <header className="flex items-start justify-between border-b border-[#003399]/15 p-5"><div><p className="text-xs font-bold uppercase text-[#003399]">Category record</p><h2 id="category-record-title" className="text-xl font-black text-[#003399]">{category ? 'Edit category' : 'Create category'}</h2></div><button aria-label="Close" disabled={saving} onClick={onClose} className="p-2 text-[#003399] disabled:opacity-40"><X /></button></header>
      <form onSubmit={submit} className="space-y-4 p-5">
        <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase text-[#003399]">Category name *</span><input name="categoryName" required maxLength={100} defaultValue={category?.categoryName ?? ''} className={inputClass} />{errors.categoryName ? <span className="mt-1 block text-xs font-semibold text-[#003399]">{errors.categoryName}</span> : null}</label>
        <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase text-[#003399]">Shelf location *</span><input name="shelfLocation" required maxLength={100} placeholder="Shelf A-1 or Aisle 3" defaultValue={category?.shelfLocation ?? ''} className={inputClass} />{errors.shelfLocation ? <span className="mt-1 block text-xs font-semibold text-[#003399]">{errors.shelfLocation}</span> : null}</label>
        <div className="flex justify-end gap-2 pt-2"><button type="button" disabled={saving} onClick={onClose} className="h-11 rounded-xl border border-[#003399] bg-[#FFFFFF] px-5 font-bold text-[#003399] disabled:opacity-40">Cancel</button><button disabled={saving} type="submit" className="h-11 rounded-xl bg-[#003399] px-5 font-bold text-[#FFFFFF] disabled:opacity-50">{saving ? 'Saving…' : 'Save category'}</button></div>
      </form>
    </div>
  </div>
}
