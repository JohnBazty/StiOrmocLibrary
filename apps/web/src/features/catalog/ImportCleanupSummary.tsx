import { CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import type { Batch } from './enhanced-catalog-api'
import { importFieldNames } from './holdings-import-helpers'

export function ImportCleanupSummary({ batch, needsHelp }: { batch: Batch; needsHelp: number }) {
  const [visibleCount, setVisibleCount] = useState(20)
  const changed = batch.rows.filter(row => row.data.autoCorrections?.length)
  if (!changed.length) return null
  return <section aria-label="Automatic file cleanup" className="space-y-3 rounded-xl border border-green-200 bg-green-50 p-4 text-green-950 dark:border-green-800 dark:bg-green-950/30 dark:text-green-100">
    <div className="flex items-start gap-3"><CheckCircle2 aria-hidden size={20} className="mt-0.5 shrink-0"/><div><h3 className="font-semibold">Cleaned up {changed.length} book {changed.length === 1 ? 'entry' : 'entries'} automatically.</h3><p className="mt-1 text-sm">Formatting was cleaned and clearly matching categories or shelves were recognized. {needsHelp ? `${needsHelp} ${needsHelp === 1 ? 'book still needs' : 'books still need'} your help below.` : 'Check the list before adding books.'}</p></div></div>
    <details><summary className="cursor-pointer text-sm font-semibold">See what was corrected</summary><p className="mt-2 text-xs">Changes made when this file was read. Your original source values are kept. Later librarian edits are separate.</p><div className="mt-3 max-h-72 space-y-3 overflow-auto">{changed.slice(0, visibleCount).map(row => <article key={row.id} className="rounded-lg border border-green-200 bg-white/70 p-3 dark:border-green-800 dark:bg-black/10"><h4 className="break-words text-sm font-semibold">{row.data.title || 'Untitled book'} <span className="font-normal">({row.sheet}, line {row.sourceRow})</span></h4><dl className="mt-2 space-y-2 text-xs">{row.data.autoCorrections?.map((change, index) => <div key={index}><dt className="font-semibold">{importFieldNames[change.field] ?? change.field}</dt><dd className="mt-1 break-all"><span className="font-semibold">Before: </span><span className="whitespace-pre-wrap">{change.before || '(blank)'}</span><br/><span className="font-semibold">After: </span>{change.after || '(blank)'}</dd></div>)}</dl></article>)}</div>{changed.length > visibleCount ? <button type="button" className="mt-2 min-h-11 rounded-lg border border-green-400 px-3 py-2 text-sm font-semibold" onClick={() => setVisibleCount(count => count + 20)}>Show more corrections ({changed.length - visibleCount} {changed.length - visibleCount === 1 ? 'entry' : 'entries'} left)</button> : null}</details>
  </section>
}
