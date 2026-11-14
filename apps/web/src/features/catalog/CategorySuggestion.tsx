import { useEffect, useRef, useState } from 'react'
import { CategoryApiError, categoryApi } from '../categories/category-api'
import { CreateCategoryModal } from '../categories/CreateCategoryModal'
import type { CategoryPayload } from '../categories/types'
import { matchCategory } from './category-match'
import type { Category } from './types'

type Shelf = { id: number; label: string; columnCount: number; rowCount: number }

/**
 * Category help from a book lookup's subjects: picks the matching library category when staff have not chosen one,
 * or offers to create a category named after the first subject. Staff can always change the choice.
 */
export function CategorySuggestion({ subjects, categories, categoryId, onSelect }: {
  subjects: string[]
  categories: Category[]
  categoryId: string
  onSelect: (category: Category, created: boolean) => void
}) {
  const [note, setNote] = useState('')
  const [creating, setCreating] = useState<{ name: string; shelves: Shelf[] } | null>(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const chosen = useRef(categoryId)
  chosen.current = categoryId
  const match = matchCategory(subjects, categories)

  // Only new subjects trigger a suggestion; a category staff already chose is never changed.
  useEffect(() => {
    setNote(''); setError('')
    if (!match || chosen.current) return
    onSelect(match.category, false)
    setNote(`Category set to ${match.category.categoryName} from the subject “${match.subject}”. Change it if it is wrong.`)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per lookup result, not on every category edit
  }, [subjects])

  async function openCreate() {
    setError('')
    try { setCreating({ name: subjects[0].slice(0, 100), shelves: await categoryApi.listShelves() }) } catch (reason) { setError((reason as Error).message || 'Shelves could not be loaded.') }
  }

  async function create(payload: CategoryPayload) {
    setSaving(true); setErrors({})
    try {
      const saved = await categoryApi.create(payload)
      setCreating(null)
      onSelect({ categoryId: saved.categoryId, categoryName: saved.categoryName, shelfLocation: saved.shelfLocation, shelfColumn: saved.shelfColumn, shelfRow: saved.shelfRow }, true)
      setNote(`Category ${saved.categoryName} created and selected.`)
    } catch (reason) {
      const apiError = reason as CategoryApiError
      setErrors(apiError.errors ?? {}); setError(apiError.message)
    } finally { setSaving(false) }
  }

  if (!subjects.length) return null
  return <div className="text-xs text-[#0b5ea2] sm:col-span-2">
    <p><span className="font-bold">Subjects from the lookup:</span> {subjects.join('; ')}</p>
    {note ? <p role="status" className="mt-1 font-semibold">{note}</p> : null}
    {!match && !categoryId ? <button type="button" onClick={() => void openCreate()} className="mt-2 h-9 rounded-lg border border-[#0b5ea2] bg-[#FFFFFF] px-3 font-bold">Create category “{subjects[0].slice(0, 100)}”</button> : null}
    {error ? <p role="alert" className="mt-1 rounded-lg bg-[#FFF200] p-2 font-bold">{error}</p> : null}
    {creating ? <CreateCategoryModal category={null} initialName={creating.name} shelves={creating.shelves} saving={saving} errors={errors} onSubmit={create} onClose={() => setCreating(null)} /> : null}
  </div>
}
