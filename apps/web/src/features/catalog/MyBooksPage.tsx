import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { circulationApi } from '../circulation/circulation-api'
import type { BorrowingHistoryData } from '../circulation/types'
import { BookCoverThumbnail } from './BookCoverThumbnail'
import { getCurrentIdentity } from '../auth/auth-storage'
import { BookDetailDrawer } from './BookDetailDrawer'

export function MyBooksPage() {
  const [data, setData] = useState<Pick<BorrowingHistoryData, 'items'> | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<{ titleId: number; barcode: string | null } | null>(null)
  const running = useRef(false)
  const prefix = getCurrentIdentity()?.role === 'Faculty' ? '/faculty' : '/student'
  const load = useCallback(async () => {
    if (running.current) return
    running.current = true
    try { setData(await circulationApi.myBooks()); setError('') } catch (error) { setError(error instanceof Error ? error.message : 'Your book collection could not be loaded.') } finally { running.current = false }
  }, [])
  useEffect(() => { void load(); const timer = window.setInterval(() => { if (!document.hidden) void load() }, 5000); return () => clearInterval(timer) }, [load])
  const books = new Map<number | string, BorrowingHistoryData['items'][number]>()
  for (const item of data?.items ?? []) {
    if (!item.borrowDate || !['Borrowed', 'Overdue', 'Returned', 'Lost'].includes(item.status)) continue
    const key = item.titleId ?? item.title
    const previous = books.get(key)
    if (!previous || new Date(item.borrowDate).getTime() > new Date(previous.borrowDate!).getTime()) books.set(key, item)
  }
  const entries = [...books.values()].filter(item => `${item.title} ${item.author}`.toLowerCase().includes(search.toLowerCase()))
  return <>
    <PageHeader eyebrow="My library" title="My books" description="Your personal collection of books you have borrowed. Each title appears once, with your most recent borrowing record." />
    <p className="mb-4 text-sm"><Link className="font-semibold underline" to={`${prefix}/borrowing`}>Borrowing history</Link> shows every transaction. <Link className="font-semibold underline" to={`${prefix}/reservations`}>Requests &amp; reservations</Link> shows books you are waiting to collect.</p>
    <label className="mb-5 block text-sm font-semibold">Search my books<input className="mt-2 min-h-11 w-full rounded-xl border bg-transparent p-3" value={search} onChange={event => setSearch(event.target.value)} placeholder="Book title or author" /></label>
    {error ? <p role="alert" className="auth-error mb-4 rounded-xl p-3">{error}</p> : null}
    {!data ? error ? <SectionCard className="p-6"><p>Your book collection is temporarily unavailable.</p><button type="button" className="mt-3 min-h-11 rounded-xl border px-4 font-semibold" onClick={() => void load()}>Try again</button></SectionCard> : <p role="status">Loading your collection…</p> : !entries.length ? <SectionCard className="p-8 text-center"><p>{search ? 'No books match your search.' : 'Books will appear here after your first library handover.'}</p><Link className="mt-3 inline-block font-semibold underline" to={`${prefix}/library`}>Browse the library</Link></SectionCard> : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">{entries.map(item => <SectionCard key={item.titleId ?? item.title} className="flex min-w-0 flex-col p-3"><BookCoverThumbnail title={item.title} coverImagePath={item.coverImagePath} className="aspect-[3/4] w-full" /><h2 className="mt-3 line-clamp-2 font-bold">{item.title}</h2><p className="mt-1 text-xs opacity-70">{item.author}</p><div className="mt-3"><StatusBadge status={item.status} /></div><p className="mt-2 text-xs">Last borrowed {new Date(item.borrowDate!).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}</p>{item.titleId ? <button className="mt-auto min-h-11 pt-3 text-left text-sm font-semibold underline" onClick={() => setSelected({ titleId: Number(item.titleId), barcode: item.barcode })}>View book details</button> : null}</SectionCard>)}</div>}
    {selected ? <BookDetailDrawer {...selected} onClose={() => setSelected(null)} /> : null}
  </>
}
