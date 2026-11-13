import { AlertCircle, CheckCircle2, Download, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { enhancedCatalog } from './enhanced-catalog-api'
import { researchImportApi, type ResearchImportPreview } from './research-import-api'

/** The template columns, in the order the server reads them (same names as `RESEARCH_IMPORT_HEADERS` in the API). */
const templateCsv = '﻿Copy numbers,Authors,Year,Title,Program,Adviser,Abstract,Keywords,Research code,Shelf\r\n'
const fieldClass = 'h-11 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 text-sm text-[#003399] outline-none focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10'
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#003399]'

/** Research import from Excel/CSV: check the file first (nothing is saved), then import every row at once. */
export function ResearchImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [shelves, setShelves] = useState<string[]>([])
  const [shelf, setShelf] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ResearchImportPreview | null>(null)
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [rowErrors, setRowErrors] = useState<Array<{ row: number; errors: string[] }>>([])
  const working = useRef(false)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !working.current) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => {
    enhancedCatalog.options(true).then((options) => setShelves(options.locations.filter((location) => location.status === 'Active').map((location) => location.name)))
      .catch(() => setError('Shelves could not be loaded. Close this window and try again.'))
  }, [])
  async function act(work: () => Promise<void>) {
    if (working.current) return
    working.current = true; setBusy(true); setError(''); setRowErrors([])
    try { await work() } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The request could not be completed.')
      const rows = (reason as { details?: { rows?: Array<{ row: number; errors: string[] }> } }).details?.rows
      if (Array.isArray(rows)) setRowErrors(rows)
    } finally { working.current = false; setBusy(false) }
  }
  const check = () => act(async () => { if (file) setPreview(await researchImportApi.preview(file, shelf)) })
  const importRows = () => act(async () => {
    if (!preview) return
    const result = await researchImportApi.save({ shelf, rows: [...preview.rows].sort((a, b) => a.row - b.row).map((row) => ({ ...row.fields, row: row.row })) })
    setDone(`${result.titles} research titles with ${result.copies} copies were imported.`); setPreview(null); onImported()
  })
  const addProgram = (name: string) => act(async () => {
    await enhancedCatalog.saveFoundation('programs', null, { name, code: (codes[name] ?? '').trim().toUpperCase() })
    if (file) setPreview(await researchImportApi.preview(file, shelf))
  })
  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([templateCsv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = 'research-import-template.csv'
    document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const count = preview?.total ?? 0
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#003399]/80 p-4"><div role="dialog" aria-modal="true" aria-labelledby="research-import-title" className="mx-auto my-6 max-w-5xl rounded-2xl bg-[#FFFFFF] text-[#003399] shadow-2xl">
    <header className="flex items-center justify-between border-b border-[#003399]/15 p-5"><div><p className="text-xs font-bold uppercase">Catalog entry</p><h2 id="research-import-title" className="text-xl font-black">Import research from Excel or CSV</h2></div><button aria-label="Close" disabled={busy} onClick={onClose} className="p-2 disabled:opacity-40"><X /></button></header>
    <div className="space-y-4 p-5">
      <p className="text-sm">One row per research title. Columns: Copy numbers (for example 1-2, 81-83, 25 or 1, 2), Authors (separate with ;), Year, Title, Program (name or code), and optional Adviser, Abstract, Keywords, Research code and Shelf. Copy numbers are saved with the program code, such as BSHM-1.</p>
      <Button variant="secondary" onClick={downloadTemplate}><Download size={16} /> Download template</Button>
      {error ? <div role="alert" className="flex gap-2 rounded-xl bg-[#FFF200] p-3 text-sm font-semibold"><AlertCircle size={18} />{error}</div> : null}
      {rowErrors.length ? <ul className="list-inside list-disc rounded-xl bg-[#FFF200] p-3 text-sm">{rowErrors.map((item) => <li key={item.row}>Row {item.row}: {item.errors.join(' ')}</li>)}</ul> : null}
      {done ? <div role="status" className="flex gap-2 rounded-xl border border-[#003399] p-3 text-sm font-semibold"><CheckCircle2 size={18} />{done}</div> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className={labelClass}>Research list file</span><input type="file" accept=".xlsx,.csv" disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setDone('') }} className={`${fieldClass} pt-2`} /></label>
        <label><span className={labelClass}>Shelf for these research titles</span><select value={shelf} disabled={busy} onChange={(event) => { setShelf(event.target.value); setPreview(null) }} className={fieldClass}><option value="">Select shelf</option>{shelves.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      </div>
      <Button onClick={() => void check()} disabled={busy || !file || !shelf}>{busy && !preview ? 'Checking…' : 'Check file'}</Button>
      {preview ? <>
        <p role="status" className="text-sm font-semibold">{preview.errorCount ? `${preview.errorCount} ${preview.errorCount === 1 ? 'row needs' : 'rows need'} attention. Fix the file and check it again; nothing is imported until every row is ready.` : `All ${count} rows are ready.`}</p>
        {preview.unknownPrograms.map((name) => <div key={name} className="flex flex-wrap items-end gap-2 rounded-xl border border-[#003399]/20 p-3 text-sm"><p className="basis-full font-semibold">Program &quot;{name}&quot; does not exist yet.</p>
          <label><span className={labelClass}>Code for {name}</span><input value={codes[name] ?? ''} onChange={(event) => setCodes((current) => ({ ...current, [name]: event.target.value }))} className={fieldClass} /></label>
          <Button variant="secondary" disabled={busy || !(codes[name] ?? '').trim()} onClick={() => void addProgram(name)}>{`Add ${name} as a department/program`}</Button></div>)}
        <ResponsiveTable><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#003399] text-[11px] uppercase tracking-wider text-[#FFFFFF]"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Authors</th><th className="px-3 py-2">Year</th><th className="px-3 py-2">Program</th><th className="px-3 py-2">Copies</th><th className="px-3 py-2">Research code</th><th className="px-3 py-2">Status</th></tr></thead>
          <tbody className="divide-y divide-[#003399]/10">{preview.rows.map((row) => <tr key={row.row} className={row.errors.length ? 'bg-[#FFF200]/40' : ''}><td className="px-3 py-2">{row.row}</td><td className="px-3 py-2 font-semibold">{row.fields.title}</td><td className="px-3 py-2">{row.fields.authors}</td><td className="px-3 py-2">{row.fields.year}</td><td className="px-3 py-2">{row.programName ?? row.fields.program}</td><td className="px-3 py-2">{row.accessionNumbers.join(', ')}</td><td className="px-3 py-2">{row.researchCode}</td>
            <td className="px-3 py-2">{row.errors.length ? <ul className="list-inside list-disc"><li className="sr-only">Needs attention</li>{row.errors.map((message) => <li key={message}>{message}</li>)}</ul> : 'Ready'}</td></tr>)}</tbody></table></ResponsiveTable>
        <div className="flex justify-end"><Button onClick={() => void importRows()} disabled={busy || preview.errorCount > 0 || !count}>{`Import ${count} research ${count === 1 ? 'title' : 'titles'}`}</Button></div>
      </> : null}
    </div>
  </div></div>
}
