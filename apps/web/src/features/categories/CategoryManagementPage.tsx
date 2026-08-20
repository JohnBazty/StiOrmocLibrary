import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRightLeft, BookOpen, FileText, Pencil, Plus, Tags, Trash2, X } from 'lucide-react'
import { PageHeader, SectionCard } from '../../components/ui'
import { categoryApi, CategoryApiError } from './category-api'
import type { Category } from './types'

const inputClass = 'h-11 w-full rounded-xl border border-[#003399]/20 bg-white px-3 text-sm text-[#003399] outline-none focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10'
const cannotDeleteTooltip = 'Cannot delete category while materials are assigned to it.'

type Editor = { mode: 'create' | 'edit'; category: Category | null }

export function CategoryManagementPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [reassignTarget, setReassignTarget] = useState<Category | null>(null)
  const [targetCategoryId, setTargetCategoryId] = useState('')
  const [notice, setNotice] = useState<{ error: boolean; message: string } | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setCategories(await categoryApi.list()); setNotice(null) }
    catch (error) { setNotice({ error: true, message: error instanceof Error ? error.message : 'Categories could not be loaded.' }) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const totals = useMemo(() => categories.reduce((result, category) => ({
    books: result.books + category.totalBooksCount,
    theses: result.theses + category.totalThesisCount,
  }), { books: 0, theses: 0 }), [categories])

  async function submitEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor) return
    const form = event.currentTarget
    const data = new FormData(form)
    const payload = { categoryName: String(data.get('categoryName') ?? ''), shelfLocation: String(data.get('shelfLocation') ?? '') }
    setSaving(true); setFieldErrors({})
    try {
      if (editor.mode === 'create') await categoryApi.create(payload)
      else await categoryApi.update(editor.category!.categoryId, payload)
      setEditor(null)
      await load()
      setNotice({ error: false, message: editor.mode === 'create' ? 'Category created successfully.' : 'Category updated successfully.' })
    } catch (error) {
      const apiError = error as CategoryApiError
      setFieldErrors(apiError.errors ?? {})
      setNotice({ error: true, message: apiError.message })
    } finally { setSaving(false) }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setSaving(true)
    try {
      await categoryApi.remove(deleteTarget.categoryId)
      setDeleteTarget(null); await load(); setNotice({ error: false, message: 'Category deleted successfully.' })
    } catch (error) { setNotice({ error: true, message: error instanceof Error ? error.message : 'Category could not be deleted.' }) }
    finally { setSaving(false) }
  }

  async function confirmReassignment() {
    if (!reassignTarget || !targetCategoryId) return
    setSaving(true)
    try {
      await categoryApi.reassign(reassignTarget.categoryId, Number(targetCategoryId))
      setReassignTarget(null); setTargetCategoryId(''); await load(); setNotice({ error: false, message: 'Materials reassigned and old category removed successfully.' })
    } catch (error) { setNotice({ error: true, message: error instanceof Error ? error.message : 'Category reassignment failed.' }) }
    finally { setSaving(false) }
  }

  return <>
    <PageHeader eyebrow="Classification administration" title="Category management" description="Maintain catalog classifications, shelf locations, and active book/research assignments." action={<button onClick={() => { setFieldErrors({}); setEditor({ mode: 'create', category: null }) }} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#003399] px-4 text-sm font-bold text-white"><Plus size={16} /> Add category</button>} />

    {notice ? <div role="alert" className={`mb-5 flex items-start justify-between rounded-xl border px-4 py-3 text-sm font-semibold ${notice.error ? 'border-[#FFF200] bg-[#FFF200] text-[#003399]' : 'border-[#003399] bg-white text-[#003399]'}`}><span>{notice.message}</span><button aria-label="Dismiss alert" onClick={() => setNotice(null)}><X size={16} /></button></div> : null}

    <div className="mb-5 grid gap-3 sm:grid-cols-3"><SectionCard className="p-5"><Tags className="text-[#003399]" /><p className="mt-3 text-xs font-bold uppercase text-[#003399]/60">Categories</p><p className="mt-1 text-3xl font-black text-[#003399]">{categories.length}</p></SectionCard><SectionCard className="p-5"><BookOpen className="text-[#003399]" /><p className="mt-3 text-xs font-bold uppercase text-[#003399]/60">Active physical books</p><p className="mt-1 text-3xl font-black text-[#003399]">{totals.books}</p></SectionCard><SectionCard className="p-5"><FileText className="text-[#003399]" /><p className="mt-3 text-xs font-bold uppercase text-[#003399]/60">Active theses</p><p className="mt-1 text-3xl font-black text-[#003399]">{totals.theses}</p></SectionCard></div>

    <SectionCard className="overflow-hidden"><div className="border-b border-[#003399]/15 px-5 py-4"><h2 className="font-bold text-[#003399]">Classification directory</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-[#003399] text-white"><tr><th className="px-5 py-3">Category name</th><th className="px-5 py-3">Shelf location</th><th className="px-5 py-3">Active books</th><th className="px-5 py-3">Active theses</th><th className="px-5 py-3 text-right">Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={5} className="px-5 py-10 text-center text-[#003399]">Loading categories…</td></tr> : categories.length ? categories.map((category) => { const assigned = category.totalBooksCount + category.totalThesisCount > 0; return <tr key={category.categoryId} className="border-b border-[#003399]/10"><td className="px-5 py-4 font-bold text-[#003399]">{category.categoryName}</td><td className="px-5 py-4"><span className="rounded-full bg-[#FFF200] px-3 py-1 text-xs font-bold text-[#003399]">{category.shelfLocation}</span></td><td className="px-5 py-4 font-bold text-[#003399]">{category.totalBooksCount}</td><td className="px-5 py-4 font-bold text-[#003399]">{category.totalThesisCount}</td><td className="px-5 py-4"><div className="flex justify-end gap-1"><button title="Edit category" aria-label={`Edit ${category.categoryName}`} onClick={() => { setFieldErrors({}); setEditor({ mode: 'edit', category }) }} className="rounded-lg p-2 text-[#003399] hover:bg-[#003399]/10"><Pencil size={16} /></button>{assigned ? <button title="Reassign all materials" aria-label={`Reassign ${category.categoryName}`} onClick={() => { setReassignTarget(category); setTargetCategoryId('') }} className="rounded-lg p-2 text-[#003399] hover:bg-[#003399]/10"><ArrowRightLeft size={16} /></button> : null}<button title={assigned ? cannotDeleteTooltip : 'Delete category'} aria-label={assigned ? cannotDeleteTooltip : `Delete ${category.categoryName}`} disabled={assigned} onClick={() => setDeleteTarget(category)} className="rounded-lg p-2 text-[#003399] enabled:hover:bg-[#FFF200] disabled:cursor-not-allowed disabled:bg-[#003399]/5 disabled:text-[#003399]/25"><Trash2 size={16} /></button></div></td></tr> }) : <tr><td colSpan={5} className="px-5 py-10 text-center text-[#003399]">No categories have been registered.</td></tr>}</tbody></table></div></SectionCard>

    {editor ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#003399]/80 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-[#003399]/15 p-5"><div><p className="text-xs font-bold uppercase text-[#003399]">Category record</p><h2 className="text-xl font-black text-[#003399]">{editor.mode === 'create' ? 'Create category' : 'Edit category'}</h2></div><button aria-label="Close" onClick={() => setEditor(null)} className="p-2 text-[#003399]"><X /></button></div><form onSubmit={(event) => void submitEditor(event)} className="space-y-4 p-5"><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase text-[#003399]">Category name *</span><input name="categoryName" required defaultValue={editor.category?.categoryName ?? ''} className={inputClass} />{fieldErrors.categoryName ? <span className="mt-1 block text-xs font-semibold text-[#003399]">{fieldErrors.categoryName}</span> : null}</label><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase text-[#003399]">Shelf location *</span><input name="shelfLocation" required placeholder="Shelf A-1 or Aisle 3" defaultValue={editor.category?.shelfLocation ?? ''} className={inputClass} />{fieldErrors.shelfLocation ? <span className="mt-1 block text-xs font-semibold text-[#003399]">{fieldErrors.shelfLocation}</span> : null}</label><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setEditor(null)} className="h-11 rounded-xl border border-[#003399] bg-white px-5 font-bold text-[#003399]">Cancel</button><button disabled={saving} type="submit" className="h-11 rounded-xl bg-[#003399] px-5 font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save category'}</button></div></form></div></div> : null}

    {deleteTarget ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#003399]/80 p-4"><div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6"><Trash2 className="text-[#003399]" /><h2 className="mt-4 text-xl font-black text-[#003399]">Delete {deleteTarget.categoryName}?</h2><p className="mt-2 text-sm text-[#003399]/65">This is allowed only because no active books or theses are assigned. The server will verify again inside a transaction.</p><div className="mt-6 flex justify-end gap-2"><button onClick={() => setDeleteTarget(null)} className="h-10 rounded-xl border border-[#003399] px-4 font-bold text-[#003399]">Cancel</button><button disabled={saving} onClick={() => void confirmDelete()} className="h-10 rounded-xl bg-[#FFF200] px-4 font-bold text-[#003399]">Delete category</button></div></div></div> : null}

    {reassignTarget ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#003399]/80 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-6"><ArrowRightLeft className="text-[#003399]" /><h2 className="mt-4 text-xl font-black text-[#003399]">Reassign {reassignTarget.categoryName}</h2><p className="mt-2 text-sm text-[#003399]/65">All linked books and theses will move in one transaction, then this category will be removed.</p><label className="mt-5 block"><span className="mb-1.5 block text-xs font-bold uppercase text-[#003399]">Target category *</span><select value={targetCategoryId} onChange={(event) => setTargetCategoryId(event.target.value)} className={inputClass}><option value="">Select target</option>{categories.filter((category) => category.categoryId !== reassignTarget.categoryId).map((category) => <option key={category.categoryId} value={category.categoryId}>{category.categoryName}</option>)}</select></label><div className="mt-6 flex justify-end gap-2"><button onClick={() => setReassignTarget(null)} className="h-10 rounded-xl border border-[#003399] px-4 font-bold text-[#003399]">Cancel</button><button disabled={saving || !targetCategoryId} onClick={() => void confirmReassignment()} className="h-10 rounded-xl bg-[#003399] px-4 font-bold text-white disabled:opacity-50">Reassign materials</button></div></div></div> : null}
  </>
}
