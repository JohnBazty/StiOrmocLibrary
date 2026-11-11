import { useState } from 'react'
import { Button } from '../../components/ui'
import type { RosterPreview } from './enrollment-api'

const pageSize = 50

export function RosterPreviewTable({ preview }: { preview: RosterPreview }) {
  const [sheetIndex, setSheetIndex] = useState(0)
  const [issuesOnly, setIssuesOnly] = useState(false)
  const [page, setPage] = useState(0)
  const sheet = preview.sheets[sheetIndex]
  const rows = issuesOnly ? sheet.rows.filter(row => row.errors.length || row.warnings.length) : sheet.rows
  const offset = page * pageSize
  const number = new Intl.NumberFormat('en-PH')
  return <section aria-label="Roster preview" className="min-w-0 space-y-3 rounded-xl border border-current/20 p-3 sm:p-4">
    <h3 className="font-bold">Roster preview</h3>
    <p role="status" className="text-sm">
      <strong>{number.format(preview.studentCount)} students in the file.</strong> The count uses unique Student IDs.
    </p>
    {preview.errorCount > 0 && <p className="text-sm font-semibold text-red-700 dark:text-red-300">
      Fix {number.format(preview.errorCount)} rows with errors before importing.
    </p>}
    {preview.warningCount > 0 && <div role="status" className="space-y-1 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-950 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100">
      <p className="font-bold">{number.format(preview.warningCount)} {preview.warningCount === 1 ? 'student needs' : 'students need'} an Ormoc school email</p>
      <p>They can register once their Ormoc email is added.</p>
      {preview.errorCount === 0 && <p>{preview.studentCount === 1
        ? 'This student can still be imported.'
        : `All ${number.format(preview.studentCount)} students can still be imported.`}</p>}
    </div>}
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {preview.sheets.length > 1 && <label className="flex items-center gap-2">
        Sheet
        <select className="max-w-full rounded-lg border border-current/30 bg-white p-2 dark:bg-slate-900" value={sheetIndex}
          onChange={event => { setSheetIndex(Number(event.target.value)); setPage(0) }}>
          {preview.sheets.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}
        </select>
      </label>}
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={issuesOnly} onChange={event => { setIssuesOnly(event.target.checked); setPage(0) }} />
        Show rows that need attention
      </label>
    </div>
    {rows.length > 0 ? <>
      <div className="max-h-[28rem] max-w-full overflow-auto rounded-lg border border-current/15" tabIndex={0} role="region" aria-label="Scrollable roster data">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{sheet.name} roster data</caption>
          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
            <tr><th scope="col" className="p-2">Row</th>{sheet.headings.map((heading, index) => <th scope="col" key={index} className="whitespace-nowrap p-2">{heading}</th>)}<th scope="col" className="p-2">Review</th></tr>
          </thead>
          <tbody>
            {rows.slice(offset, offset + pageSize).map(row => <tr className="border-t border-current/10" key={row.row}>
              <th scope="row" className="p-2 tabular-nums">{row.row}</th>
              {row.cells.map((cell, index) => <td key={index} className="min-w-24 break-words p-2">{cell || '—'}</td>)}
              <td className="min-w-36 p-2">
                {row.errors.length > 0 && <p className="text-red-700 dark:text-red-300">{row.errors.join(' ')}</p>}
                {row.warnings.length > 0 && <p className="text-amber-800 dark:text-amber-300">{row.warnings.join(' ')}</p>}
                {!row.errors.length && !row.warnings.length && 'Ready'}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span aria-live="polite">{number.format(offset + 1)}–{number.format(Math.min(offset + pageSize, rows.length))} of {number.format(rows.length)} rows</span>
        <Button type="button" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
        <Button type="button" variant="secondary" disabled={offset + pageSize >= rows.length} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
    </> : <p className="text-sm">No rows need attention on this sheet.</p>}
  </section>
}
