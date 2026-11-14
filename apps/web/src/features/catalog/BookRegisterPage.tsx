import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { Button, PageHeader, SectionCard } from '../../components/ui'
import { catalogApi } from './catalog-api'
import type { RegisterRow } from './types'

/** Same list as the API's FUND_SOURCES (bulk-book.validation.ts). */
const FUND_SOURCES = ['Purchase', 'Donation', 'Government grant', 'Other']
const SORTS = [['accession', 'No.'], ['received', 'Date received'], ['title', 'Title'], ['cost', 'Cost price']] as const
const COLUMNS = ['No.', 'Date received', 'Class', 'Author', 'Title', 'Edition', 'Volumes', 'Pages', 'Source of fund', 'Cost price', 'Publisher', 'Year', 'Remarks']
const PAGE_SIZE = 50
const field = 'h-11 w-full rounded-xl border border-[#0b5ea2]/20 bg-[#FFFFFF] px-3 text-sm text-[#0b5ea2] dark:border-white/20 dark:bg-[#22232e] dark:text-[#f2f6ff]'
const label = 'mb-1.5 block text-xs font-bold uppercase tracking-wide'

type Filters = { from: string; to: string; unknownDate: boolean; fund: string; sort: string; dir: 'asc' | 'desc' }
const EMPTY: Filters = { from: '', to: '', unknownDate: false, fund: '', sort: 'accession', dir: 'asc' }

function paramsOf(filters: Filters, page: number) {
  const params = new URLSearchParams({ sort: filters.sort, dir: filters.dir, page: String(page), limit: String(PAGE_SIZE) })
  if (filters.unknownDate) params.set('unknownDate', 'true')
  else { if (filters.from) params.set('from', filters.from); if (filters.to) params.set('to', filters.to) }
  if (filters.fund === 'none') params.set('noFundSource', 'true')
  else if (filters.fund) params.set('fundSource', filters.fund)
  return params
}

const peso = (value: string | null) => (value === null ? '' : `₱${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const cells = (row: RegisterRow) => [
  row.accessionNumber, row.receivedOn ?? 'Unknown', row.classification, row.authors, row.title, row.edition, row.volumes, row.pages,
  [row.fundSource, row.fundDetail].filter(Boolean).join(': '), peso(row.costPhp), row.publisher, row.publicationYear, row.remarks,
]

export function BookRegisterPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<{ rows: RegisterRow[]; total: number } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const params = useMemo(() => paramsOf(filters, page), [filters, page])

  useEffect(() => {
    let active = true
    setError(''); setLoading(true)
    catalogApi.bookRegister(params)
      .then((result) => { if (active) setData(result) })
      .catch((reason: Error) => { if (active) { setData(null); setError(reason.message || 'The book register could not be loaded.') } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [params])

  const change = (next: Partial<Filters>) => { setFilters((current) => ({ ...current, ...next })); setPage(1) }
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  async function download() {
    setBusy(true); setError('')
    try { await catalogApi.downloadBookRegister(paramsOf(filters, 1)) } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }

  return <div className="space-y-5">
    <PageHeader eyebrow="Catalog" title="Book register" action={<Button disabled={busy} onClick={() => void download()}><Download size={16} />{busy ? 'Preparing CSV…' : 'Download CSV'}</Button>} />
    <SectionCard className="grid gap-3 p-4 text-[#0b5ea2] sm:grid-cols-2 lg:grid-cols-6 dark:text-[#f2f6ff]">
      <label><span className={label}>Received from</span><input type="date" className={field} value={filters.from} disabled={filters.unknownDate} onChange={(e) => change({ from: e.target.value })} /></label>
      <label><span className={label}>Received to</span><input type="date" className={field} value={filters.to} disabled={filters.unknownDate} onChange={(e) => change({ to: e.target.value })} /></label>
      <label className="flex items-end gap-2 pb-3 text-sm font-semibold"><input type="checkbox" checked={filters.unknownDate} onChange={(e) => change({ unknownDate: e.target.checked, from: '', to: '' })} />Date received unknown</label>
      <label><span className={label}>Source of fund</span><select className={field} value={filters.fund} onChange={(e) => change({ fund: e.target.value })}><option value="">All</option>{FUND_SOURCES.map((source) => <option key={source}>{source}</option>)}<option value="none">Not recorded</option></select></label>
      <label><span className={label}>Sort by</span><select className={field} value={filters.sort} onChange={(e) => change({ sort: e.target.value })}>{SORTS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
      <label><span className={label}>Order</span><select className={field} value={filters.dir} onChange={(e) => change({ dir: e.target.value as Filters['dir'] })}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
    </SectionCard>
    {error ? <p role="alert" className="rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#0b5ea2]">{error}</p> : null}
    <p role="status" className="text-sm text-[#0b5ea2] dark:text-[#f2f6ff]">{loading ? 'Loading the register…' : data ? `${data.total} ${data.total === 1 ? 'copy' : 'copies'} · Page ${page} of ${pages}` : ''}</p>
    <SectionCard className="overflow-hidden"><ResponsiveTable><table aria-busy={loading} className="w-full min-w-[1400px] text-left text-sm">
      <caption className="sr-only">Book register, one row per copy</caption>
      <thead className="bg-[#0b5ea2] text-[#FFFFFF]"><tr>{COLUMNS.map((column) => <th key={column} scope="col" className="px-3 py-3 text-xs uppercase">{column}</th>)}</tr></thead>
      <tbody className="divide-y divide-[#0b5ea2]/10 text-[#0b5ea2] dark:text-[#f2f6ff]">
        {data && !data.rows.length ? <tr><td colSpan={COLUMNS.length} className="p-8 text-center font-semibold">No copies match these filters.</td></tr> : null}
        {data?.rows.map((row) => <tr key={row.physicalCopyId}>{cells(row).map((value, index) => <td key={COLUMNS[index]} className="px-3 py-2 align-top">{value ?? ''}</td>)}</tr>)}
      </tbody>
    </table></ResponsiveTable></SectionCard>
    <div className="flex gap-3"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button></div>
  </div>
}
