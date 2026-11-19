import { useState } from 'react'
import { Button } from '../../components/ui'
import { confirmLeave } from '../../components/UnsavedChanges'
import { DeskDialog } from '../dashboard/DeskDialog'
import { CatalogDetailsPanel } from './CatalogDetailsPanel'
import { BookCoverThumbnail } from './BookCoverThumbnail'
import type { CatalogItem } from './types'

const tabs = ['Overview', 'Copies & location', 'Catalog details', 'Files & cover', 'History'] as const
type Tab = typeof tabs[number]

export function CatalogTitleDetails({ item, onClose }: { item: CatalogItem; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('Overview')
  const inventory = `/librarian/inventory?q=${encodeURIComponent(item.title)}${item.recordType === 'Research/Thesis' ? '&resource=research' : ''}`
  return <DeskDialog title={item.title} onClose={() => confirmLeave(onClose)}>
    <nav aria-label="Title detail sections" className="flex flex-wrap gap-2">
      {tabs.map(name => <Button key={name} variant={tab === name ? 'primary' : 'secondary'} aria-pressed={tab === name} onClick={() => confirmLeave(() => setTab(name))}>{name}</Button>)}
    </nav>
    {tab === 'Overview' && <div className="space-y-3">
      <p>{item.recordType === 'Book' ? 'Book' : 'Research & thesis'} · {item.availability}</p>
      <p>{item.authors.join(', ')}</p>
      <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="font-bold">ISBN / reference</dt><dd>{item.isbn || item.research?.researchCode || 'Not recorded'}</dd></div><div><dt className="font-bold">Publication year</dt><dd>{item.publicationYear ?? 'Not recorded'}</dd></div><div><dt className="font-bold">Category</dt><dd>{item.categoryName || 'Not recorded'}</dd></div><div><dt className="font-bold">Shelf</dt><dd>{item.shelfLocation || 'Not recorded'}</dd></div></dl>
      {item.recordType === 'Research/Thesis' && <a className="inline-flex min-h-11 items-center underline" href={`/librarian/maintenance?section=research-groups&titleId=${item.titleId}`}>Change this research group</a>}
    </div>}
    {tab === 'Copies & location' && <><a className="inline-flex min-h-11 items-center underline" href={inventory}>Open copy inventory</a><CatalogDetailsPanel titleId={item.titleId} editable view="copies" /></>}
    {tab === 'Catalog details' && <CatalogDetailsPanel titleId={item.titleId} editable view="metadata" />}
    {tab === 'Files & cover' && <><BookCoverThumbnail title={item.title} coverImagePath={item.coverImagePath} className="h-40 w-28 rounded-lg" /><p className="text-sm">Keep the current cover or use the saved-list cover tool to review replacements.</p><a className="inline-flex min-h-11 items-center underline" href="/librarian/catalog?tool=covers">Open bulk cover tools</a><CatalogDetailsPanel titleId={item.titleId} editable view="files" /></>}
    {tab === 'History' && <div className="space-y-3"><p className="text-sm">Open the existing source records for this title. These links keep its name as the search filter.</p><a className="block min-h-11 underline" href={`/librarian/reports?kind=circulation&q=${encodeURIComponent(item.title)}`}>Open borrowing report</a><a className="block min-h-11 underline" href={`/librarian/book-archive?q=${encodeURIComponent(item.title)}`}>Open archive history</a></div>}
  </DeskDialog>
}
