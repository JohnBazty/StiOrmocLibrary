import { AlertCircle, CheckCircle2, Download, FileSpreadsheet } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { SelectedFilePreview } from '../../components/SelectedFilePreview'
import { Button, SectionCard } from '../../components/ui'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { HoldingsFileQuestions } from './HoldingsFileQuestions'
import { ImportCleanupSummary } from './ImportCleanupSummary'
import { catalogInput } from './CatalogDetailsPanel'
import { enhancedCatalog, type Batch, type Mapping, type Options, type Sheet } from './enhanced-catalog-api'
import { HoldingsImportRow } from './HoldingsImportRow'
import { applyImportDefaults, blankImportCsv, importFileReady, importRowLabel, importSummary, unrecognizedImportHeadings } from './holdings-import-helpers'

export function HoldingsImportPage() {
  const [options, setOptions] = useState<Options | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [mapping, setMapping] = useState<Mapping[]>([])
  const [batch, setBatch] = useState<Batch | null>(null)
  const [batches, setBatches] = useState<Awaited<ReturnType<typeof enhancedCatalog.batches>>>([])
  const [busy, setBusy] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [notice, setNotice] = useState('')
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<'all' | 'attention'>('all')
  const [editing, setEditing] = useState<number | null>(null)
  const [category, setCategory] = useState('')
  const [shelf, setShelf] = useState('')
  const running = useRef(false)
  const rowWorking = useRef(false)
  const summary = batch ? importSummary(batch) : null
  const locked = busy || reviewing
  useEffect(() => {
    let active = true
    Promise.allSettled([enhancedCatalog.options(true), enhancedCatalog.batches()]).then(([settings, previous]) => {
      if (!active) return
      if (settings.status === 'fulfilled') {
        setOptions(settings.value)
        const categories = settings.value.categories.filter(item => item.status === 'Active' || !item.status), shelves = settings.value.locations.filter(item => item.status === 'Active')
        if (categories.length === 1) setCategory(String(categories[0].id))
        if (shelves.length === 1) setShelf(shelves[0].name)
      } else setError('Categories and shelves could not be loaded. Refresh this page to try again.')
      if (previous.status === 'fulfilled') setBatches(previous.value)
      else setHistoryError('Saved book lists could not be loaded. You can still add a new file.')
    })
    return () => { active = false }
  }, [])
  async function refreshSavedLists() {
    try { setBatches(await enhancedCatalog.batches()); setHistoryError('') }
    catch { setHistoryError('Saved book lists could not be loaded. Your current book list is kept; refresh to try again.') }
  }
  async function act(work: () => Promise<void>) {
    if (running.current || rowWorking.current) return
    running.current = true; setBusy(true); setError(''); setNotice('')
    try { await work() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The upload could not be completed. Please try again.') }
    finally { running.current = false; setBusy(false) }
  }
  async function reload(batchId = batch?.id) {
    if (batchId) setBatch(await enhancedCatalog.batch(Number(batchId)))
    await refreshSavedLists()
  }
  function changeMapping(name: string, patch: Partial<Mapping>) {
    setMapping(current => current.map(item => item.sheet === name ? { ...item, ...patch } : item))
  }
  const selectedMappings = applyImportDefaults(mapping, category, shelf)
  const canPrepare = importFileReady(selectedMappings)
  async function openReview(chosen: File, mappings: Mapping[]) {
    const result = await enhancedCatalog.stage(chosen, mappings)
    const loaded = await enhancedCatalog.batch(result.batchId)
    setBatch(loaded); setSheets([]); setPage(1); setEditing(null)
    setFilter(importSummary(loaded).attention.length ? 'attention' : 'all')
    setNotice(result.ignored ? `${result.ignored} blank lines, headings or totals were left out. Check your books below.` : 'Your book list is ready. Check it before adding books.')
    await refreshSavedLists()
  }
  async function chooseFile(chosen: File | undefined) {
    if (!chosen || running.current || rowWorking.current) return
    setFile(chosen); setSheets([]); setMapping([]); setBatch(null); setPage(1); setEditing(null)
    await act(async () => {
      if (!/\.(xlsx|csv)$/i.test(chosen.name)) throw new Error('Choose an Excel (.xlsx) or CSV book list. Use the template below if you need a starting file.')
      if (chosen.size > 4 * 1024 * 1024) throw new Error('This file is larger than 4 MB. Split it into smaller files and try again.')
      const result = await enhancedCatalog.inspect(chosen)
      const recognized = result.map(sheet => sheet.mapping)
      setSheets(result); setMapping(recognized)
      const ready = applyImportDefaults(recognized, category, shelf)
      if (importFileReady(ready) && result.every(sheet => !unrecognizedImportHeadings(sheet).length)) await openReview(chosen, ready)
    })
  }
  async function prepare() {
    if (!file || !canPrepare) return
    await act(() => openReview(file, selectedMappings))
  }
  async function addBooks() {
    if (!batch || !summary || !summary.ready.length || summary.failedReady) return
    const batchId = batch.id
    await act(async () => {
      // Only unambiguous valid new books share the user's final review. Other choices remain explicit.
      let reviewed = 0
      for (let start = 0; start < summary.together.length; start += 4) {
        const results = await Promise.allSettled(summary.together.slice(start, start + 4).map(row => enhancedCatalog.review({ ...row, decision: 'new' })))
        const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        reviewed += results.filter(result => result.status === 'fulfilled').length
        setNotice(`Checking books: ${reviewed} of ${summary.together.length} ready.`)
        if (failures.length) {
          await reload(batchId)
          throw new Error(`No books were added in this attempt. ${failures.map(result => result.reason instanceof Error ? result.reason.message : 'A book needs another look.').join(' ')} Your saved choices are kept.`)
        }
      }
      let saved = 0
      let remaining = 1
      while (remaining > 0) {
        let result: Awaited<ReturnType<typeof enhancedCatalog.commit>>
        try { result = await enhancedCatalog.commit(Number(batchId)) }
        catch (reason) {
          try { await reload(batchId) } catch { /* Keep the original failure; the saved upload remains resumable. */ }
          throw new Error(`The connection was interrupted while adding books. Check the saved upload before continuing; completed books will not be added twice. ${reason instanceof Error ? reason.message : ''}`)
        }
        saved += result.imported; remaining = result.remaining
        setNotice(`Adding books: ${saved} saved in this attempt${remaining ? `; ${remaining} still waiting.` : '.'}`)
        if (result.errors.length) {
          await reload(batchId)
          throw new Error(`${saved} books were saved in this attempt. ${result.errors.map(issue => {
            const row = batch.rows.find(row => Number(row.id) === Number(issue.rowId))
            return `${row?.data.title || 'Book'}${row ? ` (${row.sheet}, line ${row.sourceRow})` : ''}: ${issue.message}`
          }).join(' ')} Correct these books before continuing. Books already added will not be added twice.`)
        }
        if (remaining && result.imported === 0) {
          await reload(batchId)
          throw new Error('Some books are still waiting. Review the saved upload before continuing; completed books are protected from duplication.')
        }
      }
      await reload(batchId)
      setFilter('all'); setPage(1); setEditing(null)
      setNotice(`${saved} ${saved === 1 ? 'book entry' : 'book entries'} saved in this attempt. Completed books will not be added again from this upload.`)
    })
  }
  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([blankImportCsv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = 'library-books-template.csv'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const displayed = batch?.rows.filter(row => filter === 'all' || importRowLabel(row).startsWith('Needs')) ?? []
  const pages = Math.max(1, Math.ceil(displayed.length / 20))
  const currentPage = Math.min(page, pages)
  const finished = Boolean(batch && summary && summary.added.length + summary.skipped.length === batch.rows.length)

  const sourcePreview = file ? <details className="rounded-xl border border-slate-200 p-3 dark:border-white/15"><summary className="cursor-pointer break-all text-sm font-semibold">View file preview: {file.name}</summary><div className="mt-3"><SelectedFilePreview file={file} disabled={locked} onRemove={() => { setFile(null); setSheets([]); setMapping([]); setBatch(null); setEditing(null); setError(''); setNotice('') }} /></div></details> : null
  const resetFile = () => { setBatch(null); setSheets([]); setMapping([]); setFile(null); setEditing(null); setError(''); setNotice(''); setPage(1) }
  const rowEditor = (row: Batch['rows'][number], expanded = false) => options && batch ? <HoldingsImportRow key={row.id} row={row} options={options} batch={batch} disabled={locked} expanded={expanded} onClearError={() => { setError(''); setNotice('') }} onWorking={working => { rowWorking.current = working; setReviewing(working) }} onSaved={async () => { await reload(); setEditing(null); setNotice('Your choice was saved. Check the updated totals below before adding books.') }} /> : null

  return <div className="min-w-0 space-y-5 text-slate-900 dark:text-slate-100">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-balance text-2xl font-bold">Add books from Excel or CSV</h2><p className="mt-2 max-w-2xl text-pretty text-sm text-slate-600 dark:text-slate-300">Choose your list, check the books and copy total, then add them together.</p></div><Button variant="secondary" onClick={downloadTemplate}><Download size={16} /> Download template</Button></div>
    <ol aria-label="Import steps" className="grid grid-cols-3 gap-2">{['Choose file', 'Check books', 'Add books'].map((label, index) => <li key={label} aria-current={(finished ? 2 : batch ? 1 : 0) === index ? 'step' : undefined} className={`rounded-xl px-3 py-3 text-xs font-semibold sm:text-sm ${(finished ? 2 : batch ? 1 : 0) === index ? 'bg-[#0b5ea2] text-white' : 'border border-slate-200 bg-white text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-slate-300'}`}>{index + 1}. {label}</li>)}</ol>
    {error ? <p role="alert" className="auth-error rounded-xl p-4 text-sm">{error}</p> : null}
    {notice ? <p role="status" data-tone={finished ? 'success' : undefined} className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100">{notice}</p> : null}
    {batch && summary ? <ImportCleanupSummary batch={batch} needsHelp={summary.attention.length} /> : null}
    {historyError ? <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">{historyError}</p> : null}
    {!batch ? <SectionCard className="space-y-5 p-5 sm:p-6">
      <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-6 text-center dark:border-blue-800 dark:bg-blue-950/20"><FileSpreadsheet aria-hidden size={32} className="mx-auto mb-3 text-[#0b5ea2] dark:text-blue-300"/><span className="mb-2 block text-lg font-bold">Choose your book list</span><span className="mb-4 block text-sm text-slate-600 dark:text-slate-300">Excel (.xlsx) or CSV, up to 4 MB. We will recognize the book details for you.</span><input aria-label="Book list file" type="file" accept=".xlsx,.csv" disabled={locked || !options} onChange={event => { void chooseFile(event.target.files?.[0]); event.target.value = '' }} className="max-w-full rounded-lg text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-[#0b5ea2] file:px-4 file:font-semibold file:text-white" /></label>
      {busy ? <p role="status" className="text-sm font-semibold">Reading your file and checking the books…</p> : null}
      {!file ? <div className="rounded-xl border border-slate-200 p-4 dark:border-white/15"><h3 className="text-sm font-semibold">New to this? Start with three columns.</h3><p className="mb-3 mt-1 text-sm text-slate-600 dark:text-slate-300">Download the template, enter your books, then choose the saved file above. Each row is one book title.</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Example only; these books are not included in the template.</caption><thead><tr>{['Title', 'Author', 'Copies'].map(label => <th key={label} className="border-b border-slate-200 px-2 py-2 dark:border-white/15">{label}</th>)}</tr></thead><tbody><tr><td className="px-2 py-2">Harry Potter</td><td className="px-2 py-2">J. K. Rowling</td><td className="px-2 py-2 tabular-nums">5</td></tr><tr><td className="px-2 py-2">1984</td><td className="px-2 py-2">George Orwell</td><td className="px-2 py-2 tabular-nums">3</td></tr></tbody></table></div><p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Example only. ISBN, publisher and other details can also be included in your own file.</p></div> : sourcePreview}
      {sheets.length && options ? <>
        <p className="flex items-center gap-2 text-sm font-semibold text-green-800 dark:text-green-300"><CheckCircle2 aria-hidden size={18}/>Your file was read. Answer any questions below to see your book list.</p>
        <HoldingsFileQuestions sheets={sheets} mapping={mapping} options={options} category={category} shelf={shelf} disabled={locked} onCategory={setCategory} onShelf={setShelf} onMapping={changeMapping} onInclude={(sheet, include) => setMapping(current => include ? [...current, sheet.mapping] : current.filter(item => item.sheet !== sheet.name))}/>
        {!canPrepare ? <p className="text-sm text-slate-600 dark:text-slate-300">Answer the questions above for every included sheet to continue.</p> : null}
        <Button disabled={locked || !canPrepare} onClick={() => void prepare()}>Show my book list</Button>
      </> : null}
    </SectionCard> : null}
    {batch && options && summary ? <>
      <SectionCard className="space-y-4 p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500 dark:text-slate-400">CHECK YOUR BOOK LIST</p><h3 className="mt-1 text-xl font-bold">{batch.rows.length} book {batch.rows.length === 1 ? 'entry' : 'entries'} found</h3><p className="mt-1 break-all text-sm text-slate-600 dark:text-slate-300">{batch.filename}</p></div><Button variant="secondary" disabled={locked} onClick={resetFile}>Choose another file</Button></div>
        <div className="grid grid-cols-2 gap-3">{[[finished ? 'Books added' : 'Books ready', finished ? summary.added.length : summary.ready.length], [finished ? 'Copies added' : 'Copies to add', finished ? summary.added.reduce((sum, row) => sum + (row.result?.copyIds.length ?? 0), 0) : summary.copies]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-white/5"><p className="text-xs text-slate-600 dark:text-slate-300">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p></div>)}</div>
        {summary.missing > 0 ? <p className="text-sm">{summary.missing} of these copies will be marked missing, not available for borrowing.</p> : null}
        {summary.added.length && !finished ? <p className="text-sm text-green-800 dark:text-green-300">{summary.added.length} book entries were already added and will not be added again.</p> : null}
        {summary.skipped.length ? <p className="text-sm text-slate-600 dark:text-slate-300">{summary.skipped.length} book entries left out.</p> : null}
        {sourcePreview}
      </SectionCard>
      {summary.attention.length ? <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"><AlertCircle aria-hidden size={20} className="mt-0.5 shrink-0"/><div><h3 className="font-semibold">{summary.attention.length} {summary.attention.length === 1 ? 'book needs' : 'books need'} your help</h3><p className="mt-1 text-sm">Check missing details or possible duplicates. These books will stay out until you choose what to do.</p></div></div> : null}
      <div role="group" aria-label="Books to review" className="flex flex-wrap gap-2"><Button disabled={locked} variant={filter === 'all' ? 'primary' : 'secondary'} onClick={() => { setFilter('all'); setPage(1); setEditing(null) }}>All books ({batch.rows.length})</Button>{summary.attention.length || filter === 'attention' ? <Button disabled={locked} variant={filter === 'attention' ? 'primary' : 'secondary'} onClick={() => { setFilter('attention'); setPage(1); setEditing(null) }}>Questions ({summary.attention.length})</Button> : null}</div>
      {filter === 'all' ? <SectionCard className="overflow-hidden"><ResponsiveTable label="Books from your file"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-slate-300"><tr>{['Book', 'Author', 'Copies', 'Category / shelf', 'Review'].map(label => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>{displayed.slice((currentPage - 1) * 20, currentPage * 20).map(row => <tr key={row.id} className="border-b border-slate-100 dark:border-white/10"><td className="px-4 py-3 font-semibold">{row.data.title || 'Title missing'}</td><td className="px-4 py-3">{row.data.author || 'Author missing'}</td><td className="px-4 py-3 tabular-nums">{['link', 'reuse', 'skip'].includes(row.decision ?? '') ? '0 to add' : row.data.copies || 'Not given'}</td><td className="px-4 py-3"><p>{options.categories.find(item => Number(item.id) === Number(row.data.categoryId))?.name || 'Category needed'}</p><p className="text-xs text-slate-500 dark:text-slate-400">{row.data.location || 'Shelf needed'}</p></td><td className="px-4 py-3"><p className="mb-1 text-xs font-semibold">{importRowLabel(row)}</p><Button variant="secondary" disabled={locked} onClick={() => setEditing(row.id)}>{summary.attention.some(item => item.id === row.id) ? 'Answer question' : row.status === 'Imported' ? 'View saved book' : 'Edit details'}</Button></td></tr>)}</tbody></table></ResponsiveTable></SectionCard> : <div className="space-y-3">{displayed.slice((currentPage - 1) * 20, currentPage * 20).map(row => rowEditor(row, displayed.length === 1))}{!displayed.length ? <p className="rounded-xl bg-green-50 p-4 text-sm text-green-900 dark:bg-green-950/30 dark:text-green-100">No questions left. View all books and check the totals before adding.</p> : null}</div>}
      {editing !== null && filter === 'all' ? <section className="space-y-3"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Review this book</h3><Button variant="secondary" disabled={locked} onClick={() => setEditing(null)}>Close book details</Button></div>{batch.rows.filter(row => row.id === editing).map(row => rowEditor(row, true))}</section> : null}
      {pages > 1 ? <div className="flex flex-wrap items-center gap-3"><Button variant="secondary" disabled={locked || currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous books</Button><span className="text-sm">Page {currentPage} of {pages}</span><Button variant="secondary" disabled={locked || currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next books</Button></div> : null}
      <SectionCard className="space-y-4 p-5 sm:p-6">{finished ? <><CheckCircle2 aria-hidden size={28} className="text-green-700 dark:text-green-300"/><h3 className="text-xl font-bold">This upload is finished</h3><p className="text-sm">{summary.added.length} book entries completed; {summary.skipped.length} left out. Completed books will not be added again.</p><Button disabled={locked} onClick={resetFile}>Add another file</Button></> : <><h3 className="text-xl font-bold">Ready to add these books?</h3><p className="text-sm">Check the list above. <strong>{summary.ready.length} book {summary.ready.length === 1 ? 'entry' : 'entries'}</strong> will be saved, adding <strong>{summary.copies} physical copies</strong>.</p>{summary.attention.length ? <p className="text-sm text-amber-900 dark:text-amber-200">Only ready books will be added. The {summary.attention.length} {summary.attention.length === 1 ? 'book with an unanswered question' : 'books with unanswered questions'} will stay in this saved list for later.</p> : null}{summary.failedReady ? <p className="auth-error rounded-xl p-3 text-sm">Correct the books with save errors before continuing.</p> : null}<Button disabled={locked || !summary.ready.length || summary.failedReady} onClick={() => void addBooks()}>{busy ? 'Saving your books…' : summary.copies ? `Add ${summary.copies} ${summary.copies === 1 ? 'copy' : 'copies'}` : 'Save reviewed choices'}</Button><p className="text-xs text-slate-500 dark:text-slate-400">Nothing is added to the library until you press this button.</p></>}</SectionCard>
    </> : null}
    {batches.length ? <details className="rounded-2xl border border-slate-200 p-4 dark:border-white/15"><summary className="cursor-pointer text-sm font-semibold">Continue a saved book list</summary><p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Your completed books are remembered, so continuing will not add them twice.</p><label className="mt-3 block text-sm">Choose your file<select className={catalogInput} value={batch?.id ?? ''} disabled={locked} onChange={event => { const chosen = Number(event.target.value); if (chosen) void act(async () => { const loaded = await enhancedCatalog.batch(chosen); setBatch(loaded); setFile(null); setSheets([]); setEditing(null); setPage(1); setFilter(importSummary(loaded).attention.length ? 'attention' : 'all') }) }}><option value="">Select a saved book list</option>{batches.map(previous => <option key={previous.id} value={previous.id}>{previous.filename} — {previous.imported} of {previous.total} book entries added</option>)}</select></label></details> : null}
  </div>
}
