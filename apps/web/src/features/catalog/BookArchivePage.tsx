import { useEffect, useState } from 'react'
import { Archive, Search, X } from 'lucide-react'
import { PageHeader, SectionCard } from '../../components/ui'
import { catalogApi } from './catalog-api'

type Entry = Awaited<ReturnType<typeof catalogApi.archivedBooks>>[number]
type Detail = Awaited<ReturnType<typeof catalogApi.archivedBookDetail>>
type DeletedSnapshot = Awaited<ReturnType<typeof catalogApi.deletedBookSnapshots>>[number]

export function BookArchivePage() {
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [deletedSnapshots, setDeletedSnapshots] = useState<DeletedSnapshot[]>([])
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      void Promise.all([catalogApi.archivedBooks(query), catalogApi.deletedBookSnapshots(query)])
        .then(([data, snapshots]) => { if (active) { setEntries(data); setDeletedSnapshots(snapshots); setError(null) } })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Archive unavailable.') })
        .finally(() => { if (active) setLoading(false) })
    }, 200)
    return () => { active = false; window.clearTimeout(timer) }
  }, [query])

  async function open(entry: Entry) {
    try { setDetail(await catalogApi.archivedBookDetail(entry.titleId)); setError(null) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The archived record could not be loaded.') }
  }

  return <>
    <PageHeader eyebrow="Catalog records" title="Book archive" description="Search retained book titles and copies. Their borrowing and inventory history stays available." />
    {error ? <p role="alert" className="mb-4 rounded-xl bg-[#FFF200] p-4 text-[#003399]">{error}</p> : null}
    <SectionCard className="mb-5 p-5"><label className="flex items-center gap-2"><Search className="text-[#003399]" size={18} /><input aria-label="Search book archive" value={query} onChange={(event) => { setLoading(true); setQuery(event.target.value) }} placeholder="Title, ISBN, barcode, or accession" className="h-11 w-full rounded-xl border border-[#003399]/20 px-3 text-sm text-[#003399]" /></label></SectionCard>
    <SectionCard className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#003399] text-white"><tr><th className="p-4">Record</th><th className="p-4">Book</th><th className="p-4">Archived</th><th className="p-4">Reason</th><th className="p-4">Staff</th><th className="p-4">Action</th></tr></thead><tbody>{loading ? <tr><td colSpan={6} className="p-8 text-center text-[#003399]">Loading archive…</td></tr> : entries.length ? entries.map(entry => <tr key={`${entry.recordKind}-${entry.copyId ?? entry.titleId}`} className="border-b border-[#003399]/10 text-[#003399]"><td className="p-4"><span className="inline-flex items-center gap-2 font-bold"><Archive size={16} />{entry.recordKind}</span>{entry.accession ? <p className="mt-1 text-xs">{entry.accession} · {entry.barcode}</p> : <p className="mt-1 text-xs">{entry.copyCount} retained copies</p>}</td><td className="p-4"><strong>{entry.title}</strong><p className="text-xs opacity-70">{entry.authors || 'Author not recorded'} · {entry.isbn || 'No ISBN'}</p></td><td className="p-4">{entry.archivedAt ? new Date(entry.archivedAt).toLocaleString() : 'Legacy date unavailable'}</td><td className="p-4">{entry.reason || 'Legacy reason unavailable'}</td><td className="p-4">{entry.archivedBy || 'Legacy actor unavailable'}</td><td className="p-4"><button onClick={() => void open(entry)} className="rounded-xl bg-[#FFF200] px-3 py-2 font-bold">View record</button></td></tr>) : <tr><td colSpan={6} className="p-8 text-center text-[#003399]">No archived books match.</td></tr>}</tbody></table></SectionCard>
    <SectionCard className="mt-5 overflow-x-auto"><div className="p-5"><h2 className="font-bold text-[#003399]">Older deleted-copy records</h2><p className="mt-1 text-sm text-[#003399]/70">These are audit snapshots of unused copies deleted before archiving. The original book and copy cannot be opened or restored from this record.</p></div><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-[#003399] text-white"><tr><th className="p-4">Barcode</th><th className="p-4">Deleted</th><th className="p-4">Last known state</th><th className="p-4">Reason</th><th className="p-4">Staff</th></tr></thead><tbody>{loading ? <tr><td colSpan={5} className="p-6 text-center text-[#003399]">Loading records…</td></tr> : deletedSnapshots.length ? deletedSnapshots.map(item => <tr key={item.eventId} className="border-b border-[#003399]/10 text-[#003399]"><td className="p-4 font-bold">{item.barcode}</td><td className="p-4">{new Date(item.deletedAt).toLocaleString()}</td><td className="p-4">{[item.lastCondition, item.lastAvailability].filter(Boolean).join(' · ') || 'Not recorded'}</td><td className="p-4">{item.reason || 'Not recorded'}</td><td className="p-4">{item.staffLabel}</td></tr>) : <tr><td colSpan={5} className="p-6 text-center text-[#003399]">No deleted-copy snapshots match.</td></tr>}</tbody></table></SectionCard>
    {detail ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#003399]/75 p-4">
      <div role="dialog" aria-modal="true" aria-label="Archived book record" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 text-[#003399]">
        <div className="flex justify-between gap-4"><div><p className="text-xs font-bold uppercase">Retained catalog record</p><h2 className="text-2xl font-black">{detail.title}</h2><p>{detail.authors || 'Author not recorded'} · {detail.isbn || 'No ISBN'}</p></div><button aria-label="Close archived record" onClick={() => setDetail(null)}><X /></button></div>
        {detail.archivedAt ? <p className="mt-4 text-sm">Title archived {new Date(detail.archivedAt).toLocaleString()} by {detail.archivedBy || 'legacy staff'} · {detail.reason || 'No reason recorded'}</p> : null}
        <h3 className="mt-5 font-bold">Archived copies</h3>
        <div className="mt-2 space-y-3">{detail.copies.map(copy => <div key={copy.copyId} className="rounded-xl border border-[#003399]/20 p-4 text-sm"><p className="font-bold">{copy.accession} · {copy.barcode}</p><p>Shelf {copy.shelf || 'not recorded'} · Condition {copy.condition}</p><p>Archived {copy.archivedAt ? new Date(copy.archivedAt).toLocaleString() : 'date unavailable'} · {copy.reason || 'reason unavailable'}</p><p>{copy.borrowingCount} borrowing records retained</p></div>)}</div>
        <h3 className="mt-5 font-bold">Borrowing history</h3>
        <div className="mt-2 space-y-2">{detail.borrowings.length ? detail.borrowings.map(loan => <p key={loan.transactionId} className="rounded-xl border border-[#003399]/15 p-3 text-sm">#{loan.transactionId} · {loan.accession} · {loan.borrowerId} · {loan.status} · {loan.borrowedAt ? new Date(loan.borrowedAt).toLocaleString() : 'Not checked out'}{loan.returnedAt ? ` · Returned ${new Date(loan.returnedAt).toLocaleString()}` : ''}</p>) : <p className="text-sm opacity-70">No borrowing records for these copies.</p>}</div>
        <h3 className="mt-5 font-bold">Inventory history</h3>
        <div className="mt-2 space-y-2">{detail.auditEvents.length ? detail.auditEvents.map(event => <p key={event.eventId} className="rounded-xl border border-[#003399]/15 p-3 text-sm">{event.accession} · {event.eventType} · {new Date(event.createdAt).toLocaleString()} · {event.staffLabel}{event.reason ? ` · ${event.reason}` : ''}</p>) : <p className="text-sm opacity-70">No separate inventory events recorded.</p>}</div>
        <p className="mt-5 text-xs opacity-70">Permanently deleted legacy copies are separate audit snapshots and cannot be restored from this archive.</p>
      </div>
    </div> : null}
  </>
}
