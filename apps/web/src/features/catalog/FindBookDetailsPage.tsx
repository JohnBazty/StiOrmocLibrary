import { useMemo, useState } from 'react'
import { Download, FileSearch } from 'lucide-react'
import { Button, SectionCard } from '../../components/ui'
import { UnsavedGuard } from '../../components/UnsavedChanges'
import { catalogInput } from './CatalogDetailsPanel'
import { enhancedCatalog, type FoundData, type LookupFilled, type Mapping, type Sheet } from './enhanced-catalog-api'
import { lookupSourceName } from './holdings-import-helpers'

/** Find book details (plan 2026-11-13-find-book-details): fill a book list from the lookups and download it; nothing is saved. */
type Row = { id: number; sheet: string; sourceRow: number; data: FoundData; filled: LookupFilled; checked: boolean; tried: boolean }
const FIELDS: Array<[keyof FoundData, string]> = [['title', 'Title'], ['author', 'Author'], ['isbn', 'ISBN'], ['edition', 'Edition'], ['publisher', 'Publisher'], ['publicationYear', 'Year published'], ['copyrightYear', 'Copyright year'], ['pages', 'Pages'], ['copies', 'Copies'], ['summary', 'Summary']]
const SHOWN: Array<keyof FoundData> = ['title', 'author', 'isbn', 'publisher', 'publicationYear', 'edition']
const FILLABLE: Array<keyof FoundData> = ['title', 'author', 'isbn', 'publisher', 'publicationYear']
const PAGE = 25
const BATCH = 50

const isFilled = (row: Row) => Object.keys(row.filled).length > 0
const needsFill = (row: Row) => !row.tried && FILLABLE.some((field) => !row.data[field])

export function FindBookDetailsPage() {
  const [file, setFile] = useState<File | null>(null)
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [mapping, setMapping] = useState<Mapping[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [changed, setChanged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [view, setView] = useState<'all' | 'check' | 'missing'>('all')
  const [page, setPage] = useState(1)
  const [confirmAll, setConfirmAll] = useState(false)
  const [downloads, setDownloads] = useState(0)

  const toFill = useMemo(() => rows.filter(needsFill), [rows])
  const unchecked = rows.filter((row) => isFilled(row) && !row.checked)
  const shown = rows.filter((row) => view === 'all' || (view === 'check' ? isFilled(row) && !row.checked : row.tried && !isFilled(row) && FILLABLE.some((field) => !row.data[field])))
  const pages = Math.max(1, Math.ceil(shown.length / PAGE))

  async function act(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await work() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Something went wrong. Please try again.') } finally { setBusy(false) }
  }

  const choose = (chosen: File | null) => act(async () => {
    setFile(chosen); setRows([]); setSheets([]); setMapping([]); setChanged(false)
    if (!chosen) return
    const found = await enhancedCatalog.inspect(chosen)
    setSheets(found); setMapping(found.map((sheet) => sheet.mapping))
  })
  const read = () => act(async () => {
    if (!file) return
    const result = await enhancedCatalog.findRead(file, mapping)
    setRows(result.rows.map((row) => ({ ...row, filled: {}, checked: false, tried: false })))
    setPage(1); setView('all')
    setNotice(`${result.rows.length} books read from ${file.name}.`)
  })
  const fill = () => act(async () => {
    const batch = toFill.slice(0, BATCH)
    const result = await enhancedCatalog.findFill(batch.map(({ id, data }) => ({ id, data })))
    const byId = new Map(result.rows.map((row) => [row.id, row.filled]))
    setRows((current) => current.map((row) => {
      const filled = byId.get(row.id)
      if (!filled) return row
      const data = { ...row.data }
      for (const [field, value] of Object.entries(filled)) if (!data[field as keyof FoundData]) data[field as keyof FoundData] = value.value
      return { ...row, data, filled, tried: true }
    }))
    const count = result.rows.filter((row) => Object.keys(row.filled).length).length
    if (count) setChanged(true)
    if (count) setView('check')
    setPage(1)
    if (result.unavailable) throw new Error(`The book lookup is unavailable right now. ${count} filled before it stopped; try again later.`)
    setNotice(`${count} ${count === 1 ? 'book' : 'books'} filled, ${result.rows.length - count} not found.${result.notReached.length ? ` ${result.notReached.length} not reached; click again to continue.` : ''} Check each filled book.`)
  })
  const edit = (id: number, field: keyof FoundData, value: string) => {
    setChanged(true)
    // An edit after checking means the row changed since it was checked.
    setRows((current) => current.map((row) => row.id === id ? { ...row, checked: false, data: { ...row.data, [field]: value } } : row))
  }
  const check = (id: number, checked: boolean) => { setChanged(true); setRows((current) => current.map((row) => row.id === id ? { ...row, checked } : row)) }
  async function download(format: 'csv' | 'xlsx') {
    let ok = false
    await act(async () => {
      await enhancedCatalog.findExport(rows.map(({ sheet, sourceRow, data, filled, checked }) => ({ sheet, sourceRow, data, filled, checked })), format)
      setChanged(false); setDownloads((count) => count + 1); ok = true
      setNotice(`Downloaded ${rows.length} books as ${format === 'csv' ? 'CSV' : 'Excel'}.${unchecked.length ? ` ${unchecked.length} filled ${unchecked.length === 1 ? 'book is' : 'books are'} marked "Checked: No".` : ''}`)
    })
    return ok
  }

  return <UnsavedGuard dirty={changed} resetKey={downloads} onSave={() => download('csv')}>
    <div className="space-y-5 text-[#003399] dark:text-white">
      <div><h2 className="text-2xl font-bold">Find book details</h2><p className="mt-1 max-w-2xl text-sm">Upload a book list, let the book lookups fill missing details, check them, then download the list as CSV or Excel. Nothing is added to the library.</p></div>
      {error ? <p role="alert" className="auth-error rounded-xl p-3 text-sm">{error}</p> : null}
      {notice ? <p role="status" className="rounded-xl border border-[#003399]/20 p-3 text-sm">{notice}</p> : null}
      <SectionCard className="space-y-4 p-5">
        {/* Choosing a file or columns is not work to lose; the list itself is guarded once read. */}
        <div data-unsaved-ignore className="space-y-4">
        <label className="block text-sm font-semibold">Book list (Excel or CSV)<input type="file" accept=".xlsx,.csv" disabled={busy} onChange={(event) => void choose(event.target.files?.[0] ?? null)} className="mt-2 block text-sm" /></label>
        {sheets.length ? <>
          <details className="rounded-xl border border-[#003399]/15 p-3"><summary className="cursor-pointer text-sm font-semibold">Columns (change only if a heading was read wrongly)</summary>
            {sheets.map((sheet) => { const selected = mapping.find((item) => item.sheet === sheet.name); if (!selected) return null; const headings = sheet.preview[selected.headerRow - 1] ?? sheet.headers
              return <fieldset key={sheet.name} disabled={busy} className="mt-3 grid gap-3 sm:grid-cols-3"><legend className="text-sm font-bold">{sheet.name}</legend>{FIELDS.map(([field, label]) => <label key={field} className="text-sm">{label}<select className={catalogInput} value={selected.columns[field] ?? ''} onChange={(event) => setMapping((current) => current.map((item) => item.sheet === sheet.name ? { ...item, columns: { ...item.columns, [field]: Number(event.target.value) || 0 } } : item))}><option value="">Not in this sheet</option>{sheet.headers.map((_, index) => <option key={index} value={index + 1}>{headings[index] || `Column ${index + 1}`}</option>)}</select></label>)}</fieldset> })}
          </details>
          <Button disabled={busy} onClick={() => void read()}><FileSearch size={16} />{rows.length ? 'Read the list again' : 'Read my list'}</Button>
        </> : null}
        </div>
      </SectionCard>
      {rows.length ? <SectionCard className="space-y-4 p-5">
        <p className="text-sm">{rows.length} books · {rows.filter(isFilled).length} filled from the lookup · {unchecked.length} not checked yet · {toFill.length} with blanks still to look up</p>
        <div className="flex flex-wrap gap-2">
          {toFill.length ? <Button disabled={busy} onClick={() => void fill()}>{busy ? 'Looking up books…' : `Find missing details${toFill.length > BATCH ? ` (next ${BATCH})` : ''}`}</Button> : null}
          {unchecked.length > 1 ? (confirmAll
            ? <Button variant="secondary" disabled={busy} onClick={() => { setRows((current) => current.map((row) => isFilled(row) ? { ...row, checked: true } : row)); setChanged(true); setConfirmAll(false) }}>Yes, I checked all {unchecked.length} filled books</Button>
            : <Button variant="secondary" disabled={busy} onClick={() => setConfirmAll(true)}>Mark all filled books checked</Button>) : null}
        </div>
        <div role="group" aria-label="Show books" className="flex flex-wrap gap-2">{([['all', `All (${rows.length})`], ['check', `To check (${unchecked.length})`], ['missing', 'Not found']] as const).map(([key, label]) => <Button key={key} variant={view === key ? 'primary' : 'secondary'} onClick={() => { setView(key); setPage(1) }}>{label}</Button>)}</div>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><caption className="sr-only">Books in the list</caption>
          <thead><tr>{['Row', ...SHOWN.map((field) => FIELDS.find(([key]) => key === field)![1]), 'Checked'].map((heading) => <th key={heading} scope="col" className="px-2 py-2 text-xs uppercase">{heading}</th>)}</tr></thead>
          <tbody className="divide-y divide-[#003399]/10">{shown.slice((page - 1) * PAGE, page * PAGE).map((row) => <tr key={row.id}>
            <td className="px-2 py-2 align-top text-xs">{row.sheet}, line {row.sourceRow}</td>
            {SHOWN.map((field) => <td key={field} className={`px-2 py-2 align-top ${row.filled[field] ? 'bg-[#003399]/10' : ''}`}><input aria-label={`${FIELDS.find(([key]) => key === field)![1]}, line ${row.sourceRow}`} className="w-full rounded border border-[#003399]/20 bg-transparent px-2 py-1" value={row.data[field]} onChange={(event) => edit(row.id, field, event.target.value)} />{row.filled[field] ? <span className="text-xs">from {lookupSourceName(row.filled[field].source)}</span> : null}</td>)}
            <td className="px-2 py-2 align-top">{isFilled(row) ? <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={row.checked} onChange={(event) => check(row.id, event.target.checked)} />Checked</label> : <span className="text-xs opacity-60">—</span>}</td>
          </tr>)}</tbody></table></div>
        {pages > 1 ? <div className="flex items-center gap-3"><Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-sm">Page {page} of {pages}</span><Button variant="secondary" disabled={page === pages} onClick={() => setPage(page + 1)}>Next</Button></div> : null}
        {unchecked.length ? <p className="rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#003399]">{unchecked.length} filled {unchecked.length === 1 ? 'book is' : 'books are'} not checked yet; the download marks {unchecked.length === 1 ? 'it' : 'them'} “Checked: No”.</p> : null}
        <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void download('csv')}><Download size={16} />Download CSV</Button><Button variant="secondary" disabled={busy} onClick={() => void download('xlsx')}><Download size={16} />Download Excel</Button></div>
      </SectionCard> : null}
    </div>
  </UnsavedGuard>
}
