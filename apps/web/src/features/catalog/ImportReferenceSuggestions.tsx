import type { Option } from './enhanced-catalog-api'
import { suggestImportReferences } from './holdings-import-helpers'

export function ImportReferenceSuggestions({ label, source, choices, onChoose }: {
  label: string; source: string; choices: Option[]; onChoose: (choice: Option) => void
}) {
  const suggestions = suggestImportReferences(source, choices)
  return <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
    <p className="break-words">{label} in your file: <strong>{source}</strong></p>
    <p className="mt-1">{suggestions.length ? 'Did you mean one of these? Select it, then save your choice.' : `Choose the correct ${label.toLowerCase()} below, then save your choice.`}</p>
    {suggestions.length ? <div className="mt-2 flex flex-wrap gap-2">{suggestions.map(item => <button key={item.id} type="button" className="min-h-11 rounded-lg border border-amber-400 bg-white px-3 py-2 text-left font-semibold text-amber-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 dark:bg-amber-950 dark:text-amber-100" onClick={() => onChoose(item)}>Use {item.name}</button>)}</div> : null}
  </div>
}
