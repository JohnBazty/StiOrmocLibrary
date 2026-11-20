import { useState, type FormEvent } from 'react'
import { useConfirmSave } from '../../components/ConfirmSaveDialog'
import { Button, NoticeBanner, SectionCard } from '../../components/ui'
import { useManagedShelves } from '../shelves/useManagedShelves'
import { catalogInput } from './CatalogDetailsPanel'
import { researchImportApi, type ResearchImportPreview, type ResearchImportResult } from './research-import-api'

/**
 * Bulk research import. The file needs columns for title, authors (separate several with ";"),
 * adviser, year, abstract, research code and department or program; shelf and keywords are optional.
 */
export function ResearchImportPanel() {
  const { shelves } = useManagedShelves()
  const [file, setFile] = useState<File | null>(null)
  const [shelf, setShelf] = useState('')
  const [preview, setPreview] = useState<ResearchImportPreview | null>(null)
  const [result, setResult] = useState<ResearchImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { ask, dialog } = useConfirmSave()
  const ready = preview?.rows.filter(row => Object.keys(row.errors).length === 0) ?? []

  async function check(event: FormEvent) {
    event.preventDefault()
    if (!file || busy) return
    setBusy(true); setError(''); setResult(null)
    try { setPreview(await researchImportApi.preview(file, shelf)) }
    catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : 'The research list could not be read.') }
    finally { setBusy(false) }
  }
  async function importReady() {
    setBusy(true); setError('')
    try {
      setResult(await researchImportApi.importRows(ready.map(row => ({ line: row.line, data: row.data }))))
      setPreview(null); setFile(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The research records could not be added.') }
    finally { setBusy(false) }
  }

  return (
    <SectionCard className="mt-6 max-w-5xl space-y-4 p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-bold">Import research</h2>
        <p className="mt-1 max-w-3xl text-sm opacity-75">Add many research records from a CSV or Excel file. Use columns for Title, Authors (separate several with “;”), Adviser, Year, Abstract, Research code and Department or program. Shelf and Keywords are optional.</p>
      </div>
      <form onSubmit={check} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-sm font-semibold">Research list file
          <input type="file" accept=".csv,.xlsx" className={catalogInput} disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setPreview(null); setResult(null) }} />
        </label>
        <label className="text-sm font-semibold">Default shelf for rows without one
          <select className={catalogInput} value={shelf} disabled={busy} onChange={event => setShelf(event.target.value)}>
            <option value="">No default</option>
            {shelves.map(item => <option key={item.id} value={item.label}>{item.label}</option>)}
          </select>
        </label>
        <Button type="submit" disabled={busy || !file}>{busy && !preview ? 'Checking…' : 'Check file'}</Button>
      </form>
      {error ? <p role="alert" className="auth-error rounded-xl p-3 text-sm">{error}</p> : null}
      {result ? (
        <NoticeBanner tone={result.failed.length ? 'warning' : 'success'}>
          {`${result.imported} research ${result.imported === 1 ? 'record' : 'records'} added.`}
          {result.failed.length ? <ul className="mt-2 list-inside list-disc">{result.failed.map(item => <li key={item.line}>{`Line ${item.line}: ${item.message}`}</li>)}</ul> : null}
        </NoticeBanner>
      ) : null}
      {preview ? (
        preview.missingColumns.length ? (
          <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">{`This file is missing these columns: ${preview.missingColumns.join(', ')}. Add them and check the file again.`}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">{`${ready.length} of ${preview.rows.length} rows are ready. Rows that need fixing are skipped; correct them in the file and import again.`}</p>
            <div className="max-h-96 overflow-auto rounded-xl border border-[#0b5ea2]/15 dark:border-white/15">
              <table aria-label="Research rows" className="w-full min-w-[640px] text-left text-sm">
                <thead className="sticky top-0 bg-[var(--sl-bg-elevated)] text-xs uppercase tracking-wide opacity-75"><tr><th className="p-2">Line</th><th className="p-2">Title</th><th className="p-2">Code</th><th className="p-2">Shelf</th><th className="p-2">Status</th></tr></thead>
                <tbody className="divide-y divide-[#0b5ea2]/10 dark:divide-white/10">
                  {preview.rows.map(row => {
                    const problems = Object.values(row.errors)
                    return (
                      <tr key={row.line}>
                        <td className="p-2 tabular-nums">{row.line}</td>
                        <td className="p-2">{row.data.title || '—'}</td>
                        <td className="p-2">{row.data.researchCode || '—'}</td>
                        <td className="p-2">{row.data.copy.shelfLocation || '—'}</td>
                        <td className="p-2">{problems.length ? <span className="text-[#b42318]">{problems.join(' ')}</span> : 'Ready'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {ready.length ? <Button disabled={busy} onClick={() => ask(`Add ${ready.length} research ${ready.length === 1 ? 'record' : 'records'} with one barcode label each.`, () => { void importReady() })}>{busy ? 'Adding…' : `Import ${ready.length} ready records`}</Button> : null}
          </div>
        )
      ) : null}
      {dialog}
    </SectionCard>
  )
}
