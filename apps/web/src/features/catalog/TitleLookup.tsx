import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { catalogApi } from './catalog-api'
import type { TitleCandidate, TitleLookupResult } from './types'

const SOURCE_NAMES = { google_books: 'Google Books', open_library: 'Open Library' } as const

/** Title and author lookup (ported from STI ILMS REA): search outside catalogs by the typed title, author or both, then pick a result to fill the form. */
export function TitleLookup({ title, author, disabled, onPick }: { title: string; author: string; disabled?: boolean; onPick: (candidate: TitleCandidate) => void }) {
  const [result, setResult] = useState<TitleLookupResult | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const tooShort = title.trim().length < 2 && author.trim().length < 2
  const latest = useRef(0)

  // Results belong to the words searched; once the title or author changes they could fill the form with the wrong book.
  useEffect(() => { latest.current += 1; setResult(null); setMessage(''); setState('idle') }, [title, author])

  async function search() {
    const request = ++latest.current
    setState('loading'); setMessage(''); setResult(null)
    try {
      const found = await catalogApi.searchTitles(title.trim(), author.trim())
      if (request !== latest.current) return
      setResult(found); setState('idle')
      if (!found.candidates.length) setMessage('No outside matches. Enter the details manually.')
    } catch (reason) {
      if (request !== latest.current) return
      setState('error'); setMessage((reason as Error).message || 'Book search failed. Enter the details manually.')
    }
  }

  return <div className="sm:col-span-2">
    <button type="button" disabled={disabled || tooShort || state === 'loading'} onClick={() => void search()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#003399] bg-[#FFFFFF] px-4 text-sm font-bold text-[#003399] disabled:opacity-50">
      <Search size={16} />{state === 'loading' ? 'Searching…' : 'Search by title or author'}
    </button>
    {tooShort ? <span className="ml-3 text-xs text-[#003399]/65">Type at least 2 letters of the title or the author first.</span> : null}
    {message ? <p role={state === 'error' ? 'alert' : 'status'} className="mt-2 rounded-lg bg-[#FFF200] p-2 text-xs font-bold text-[#003399]">{message}</p> : null}
    {result?.localMatches.length ? <p role="status" className="mt-2 text-xs font-semibold text-[#003399]">Already in the catalog: {result.localMatches.map((match) => match.title).join('; ')}. Add copies to that title instead of creating a new one.</p> : null}
    {result?.candidates.length ? <section aria-label="Title search results" className="mt-2 rounded-xl border border-[#003399]/20 p-3">
      <p className="mb-2 text-xs font-bold text-[#003399]">Results from {result.source ? SOURCE_NAMES[result.source] : 'outside catalogs'}. Check the details before saving.</p>
      <ul className="space-y-2">{result.candidates.map((candidate, index) => <li key={`${candidate.isbn ?? 'none'}-${index}`} className="flex flex-wrap items-center justify-between gap-2 text-sm text-[#003399]">
        <span className="min-w-0"><strong>{candidate.title}</strong>{candidate.author ? ` · ${candidate.author}` : ''}{candidate.publicationYear ? ` · ${candidate.publicationYear}` : ''}{candidate.isbn ? ` · ISBN ${candidate.isbn}` : ' · No ISBN'}{candidate.inCatalog ? ' · Already in the catalog' : ''}</span>
        <button type="button" aria-label={`Use ${candidate.title}`} onClick={() => { onPick(candidate); setResult(null) }} className="h-9 rounded-lg bg-[#003399] px-3 text-xs font-bold text-[#FFFFFF]">Use this</button>
      </li>)}</ul>
    </section> : null}
  </div>
}
