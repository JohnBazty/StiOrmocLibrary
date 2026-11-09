import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchBookCategories } from './book-catalog-api'
import type { BookCategory } from './book-catalog-types'

type CategoryFilterSearchBarProps = {
  query: string
  selectedCategoryId: number | null
  onQueryChange: (query: string) => void
  onCategoryChange: (categoryId: number | null) => void
}

export function CategoryFilterSearchBar({
  query,
  selectedCategoryId,
  onQueryChange,
  onCategoryChange,
}: CategoryFilterSearchBarProps) {
  const [categories, setCategories] = useState<BookCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetchBookCategories(controller.signal)
      .then((rows) => setCategories(rows))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Categories could not be loaded.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!loading && selectedCategoryId !== null && !categories.some((category) => category.categoryId === selectedCategoryId)) {
      onCategoryChange(null)
    }
  }, [categories, loading, onCategoryChange, selectedCategoryId])

  const pillClass = (active: boolean) => `whitespace-nowrap rounded-full border px-4 py-2 text-xs font-bold transition focus:outline-none focus:ring-4 focus:ring-[#003399]/15 ${
    active
      ? 'border-[#003399] bg-[#003399] text-[#FFFFFF]'
      : 'border-[#003399]/15 bg-[#FFFFFF] text-[#003399] hover:border-[#003399]'
  }`

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
      <label className="relative block w-full lg:max-w-md lg:flex-none">
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#003399]/55" size={18} />
        <input
          aria-label="Search books"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search title, author, ISBN, category, or year…"
          className="h-12 w-full rounded-xl border border-[#003399]/15 bg-[#FFFFFF] pl-11 pr-4 text-sm text-[#003399] outline-none focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10"
        />
      </label>

      <div className="min-w-0 flex-1">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:justify-end" aria-label="Book categories">
          <button type="button" onClick={() => onCategoryChange(null)} aria-pressed={selectedCategoryId === null} className={pillClass(selectedCategoryId === null)}>All</button>
          {categories.map((category) => (
            <button
              type="button"
              key={category.categoryId}
              onClick={() => onCategoryChange(category.categoryId)}
              aria-pressed={selectedCategoryId === category.categoryId}
              className={pillClass(selectedCategoryId === category.categoryId)}
            >
              {category.categoryName}
            </button>
          ))}
          {loading ? <span className="whitespace-nowrap px-3 py-2 text-xs font-semibold text-[#003399]/60">Loading categories…</span> : null}
        </div>
        {error ? <p role="alert" className="mt-2 text-right text-xs font-semibold text-[#003399]">{error}</p> : null}
      </div>
    </div>
  )
}
