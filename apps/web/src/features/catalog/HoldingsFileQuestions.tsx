import { AlertCircle, Settings2 } from 'lucide-react'
import type { Mapping, Options, Sheet } from './enhanced-catalog-api'
import { catalogInput } from './CatalogDetailsPanel'
import { importFields, importFieldNames, requiredImportFields, unrecognizedImportHeadings } from './holdings-import-helpers'

type Props = { sheets: Sheet[]; mapping: Mapping[]; options: Options; category: string; shelf: string; disabled: boolean;
  onCategory: (value: string) => void; onShelf: (value: string) => void;
  onMapping: (sheet: string, patch: Partial<Mapping>) => void; onInclude: (sheet: Sheet, include: boolean) => void }

export function HoldingsFileQuestions({ sheets, mapping, options, category, shelf, disabled, onCategory, onShelf, onMapping, onInclude }: Props) {
  const categories = options.categories.filter(item => item.status === 'Active' || !item.status)
  const locations = options.locations.filter(item => item.status === 'Active')
  const needsCategory = mapping.some(item => !item.categoryId && !item.columns.categoryName)
  const needsShelf = mapping.some(item => !item.location && !item.columns.shelfLocation)
  function columns(sheet: Sheet, selected: Mapping, field: string) {
    const headings = sheet.preview[selected.headerRow - 1] ?? sheet.headers
    return <select className={catalogInput} disabled={disabled} value={selected.columns[field] ?? ''} onChange={event => onMapping(sheet.name, { columns: { ...selected.columns, [field]: Number(event.target.value) || 0 } })}>
      <option value="">Choose a heading</option>{Array.from({ length: sheet.headers.length }, (_, index) => <option key={index} value={index + 1}>{headings[index] || `Column ${index + 1} (no heading)`}</option>)}
    </select>
  }
  return <div className="space-y-4">
    {sheets.filter(sheet => mapping.some(item => item.sheet === sheet.name) && unrecognizedImportHeadings(sheet, mapping.find(item => item.sheet === sheet.name)).length).map(sheet => <p key={sheet.name} className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">Other details in {sheet.name}: <strong>{unrecognizedImportHeadings(sheet, mapping.find(item => item.sheet === sheet.name)).join(', ')}</strong>. These headings were not recognized. Open File options below to match any supported details you want included before showing your book list.</p>)}
    {needsCategory || needsShelf ? <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/15 dark:bg-white/5"><h3 className="font-semibold">Where should these books go?</h3><p className="text-sm text-slate-600 dark:text-slate-300">Choose once for this file. You can change individual books on the next screen.</p>
      <div className="grid gap-3 sm:grid-cols-2">{needsCategory ? <label className="text-sm font-semibold">Category for these books<select className={catalogInput} value={category} disabled={disabled} onChange={event => onCategory(event.target.value)}><option value="">Choose category</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}
      {needsShelf ? <label className="text-sm font-semibold">Shelf for these books<select className={catalogInput} value={shelf} disabled={disabled} onChange={event => onShelf(event.target.value)}><option value="">Choose shelf</option>{locations.map(item => <option key={item.id}>{item.name}</option>)}</select></label> : null}</div>
      {!categories.length || !locations.length ? <p className="text-sm">A category and shelf must exist first. <a href="/librarian/categories" className="font-semibold underline">Set up categories and shelves</a>.</p> : null}
    </div> : null}
    {sheets.map(sheet => {
      const selected = mapping.find(item => item.sheet === sheet.name)
      const missing = selected ? requiredImportFields.filter(field => !selected.columns[field]) : []
      return missing.length && selected ? <section key={sheet.name} className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"><h3 className="flex items-center gap-2 font-semibold"><AlertCircle aria-hidden size={18} />A few details need your help{sheet.name && sheets.length > 1 ? ` — ${sheet.name}` : ''}</h3><p className="text-sm">We could not recognize these headings. Choose the matching column. We will not guess a copy count.</p><div className="grid gap-3 sm:grid-cols-3">{missing.map(field => <label key={field} className="text-sm font-semibold">{field === 'copies' ? 'Which column shows the number of copies?' : `Which column shows the ${field === 'title' ? 'book title' : 'author'}?`}{columns(sheet, selected, field)}</label>)}</div></section> : null
    })}
    {sheets.length > 1 ? <fieldset disabled={disabled} className="rounded-xl border border-slate-200 p-4 dark:border-white/15"><legend className="px-1 text-sm font-semibold">Sheets included from your file</legend><p className="mb-3 text-xs text-slate-600 dark:text-slate-300">Uncheck a sheet only if you do not want its books included.</p><div className="flex flex-wrap gap-4">{sheets.map(sheet => <label key={sheet.name} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={mapping.some(item => item.sheet === sheet.name)} onChange={event => onInclude(sheet, event.target.checked)} />{sheet.name}</label>)}</div></fieldset> : null}
    <details className="rounded-xl border border-slate-200 p-4 dark:border-white/15"><summary className="cursor-pointer text-sm font-semibold"><Settings2 aria-hidden size={16} className="mr-2 inline" />File options (optional)</summary><p className="mt-3 text-xs text-slate-600 dark:text-slate-300">Only change these if the recognized details or worksheet assignments need adjusting.</p>
      {sheets.map(sheet => { const selected = mapping.find(item => item.sheet === sheet.name); return selected ? <fieldset key={sheet.name} disabled={disabled} className="mt-4 space-y-4 border-t border-slate-200 pt-4 dark:border-white/15"><legend className="px-1 text-sm font-bold">{sheet.name}</legend>
        <div className="grid gap-3 sm:grid-cols-3">{importFields.map(field => <label key={field} className="text-sm">{importFieldNames[field]}{columns(sheet, selected, field)}</label>)}</div>
        <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Category for this sheet<select className={catalogInput} value={selected.categoryId ?? ''} onChange={event => onMapping(sheet.name, { categoryId: Number(event.target.value) || undefined })}><option value="">Use file category</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm">Shelf for this sheet<select className={catalogInput} value={selected.location ?? ''} onChange={event => onMapping(sheet.name, { location: event.target.value })}><option value="">Use file shelf</option>{locations.map(item => <option key={item.id}>{item.name}</option>)}</select></label><label className="text-sm">Program for this sheet<select className={catalogInput} value={selected.programId ?? ''} onChange={event => onMapping(sheet.name, { programId: Number(event.target.value) || undefined })}><option value="">Not assigned</option>{options.programs.filter(item => item.status === 'Active').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
        <label className="block text-sm">Line containing column headings<input type="number" min={1} max={sheet.rowCount} value={selected.headerRow} className={catalogInput} onChange={event => onMapping(sheet.name, { headerRow: Number(event.target.value) })} /></label>
      </fieldset> : null })}
    </details>
  </div>
}
