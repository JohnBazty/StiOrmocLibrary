import { type FormEvent, useState } from 'react'
import { Search } from 'lucide-react'
import { SectionCard } from '../../components/ui'
import { catalogApi } from '../catalog/catalog-api'
import { PredictionList, usePredictions } from '../catalog/usePredictions'

/** Searches Open Library subjects so a new category can take a standard subject name. Creating still needs a shelf. */
export function SubjectFinder({ existing, onCreate }: { existing: string[]; onCreate: (name: string) => void }) {
  const [query, setQuery] = useState('')
  const [subjects, setSubjects] = useState<Array<{ name: string; workCount: number }> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const predictions = usePredictions('subject', query)
  const taken = new Set(existing.map((name) => name.trim().toLocaleLowerCase('en-US')))

  async function search(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setSubjects(null)
    try { setSubjects((await catalogApi.searchSubjects(query.trim())).subjects) } catch (reason) { setError((reason as Error).message || 'Subject search failed.') } finally { setBusy(false) }
  }

  return <SectionCard className="mb-5 p-5">
    <h2 className="font-bold text-[#003399]">Find a subject</h2>
    <p className="mt-1 text-sm text-[#003399]/70">Search Open Library's subjects to name a new category the way catalogs do. You still choose its shelf.</p>
    <form onSubmit={search} className="mt-3 flex flex-wrap gap-2">
      <label className="min-w-0 flex-1"><span className="sr-only">Subject to search</span><input value={query} list="subject-predictions" autoComplete="off" onChange={(event) => setQuery(event.target.value)} maxLength={100} placeholder="For example: computer programming" className="h-11 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 text-sm text-[#003399]" /></label>
      <button type="submit" disabled={busy || query.trim().length < 2} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#003399] px-4 text-sm font-bold text-[#FFFFFF] disabled:opacity-50"><Search size={16} />{busy ? 'Searching…' : 'Search subjects'}</button>
      <PredictionList id="subject-predictions" suggestions={predictions} />
    </form>
    {error ? <p role="alert" className="mt-2 rounded-lg bg-[#FFF200] p-2 text-sm font-bold text-[#003399]">{error}</p> : null}
    {subjects && !subjects.length ? <p role="status" className="mt-2 text-sm text-[#003399]">No subjects found.</p> : null}
    {subjects?.length ? <ul aria-label="Subject results" className="mt-3 divide-y divide-[#003399]/10">{subjects.map((subject) => {
      const exists = taken.has(subject.name.toLocaleLowerCase('en-US'))
      return <li key={subject.name} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm text-[#003399]">
        <span><strong>{subject.name}</strong> · {subject.workCount.toLocaleString('en-PH')} books on Open Library</span>
        {exists ? <span className="text-xs font-semibold">Already a category</span> : <button type="button" aria-label={`Create category ${subject.name}`} onClick={() => onCreate(subject.name.slice(0, 100))} className="h-9 rounded-lg border border-[#003399] px-3 text-xs font-bold">Create category</button>}
      </li>
    })}</ul> : null}
  </SectionCard>
}
