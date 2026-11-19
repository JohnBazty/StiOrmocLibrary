import {ImportDuplicateComparison} from './ImportDuplicateComparison'
import {RequiredBookInformation} from './RequiredBookInformation'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui'
import { catalogInput } from './CatalogDetailsPanel'
import { enhancedCatalog, type Batch, type ImportRow, type Options } from './enhanced-catalog-api'
import { importFieldNames, importPlacement, importRowLabel, lookupSourceName, needsLookupCheck } from './holdings-import-helpers'
import { ImportReferenceSuggestions } from './ImportReferenceSuggestions'
import { ShelfPlacementFields, placementFits } from '../shelves/ShelfPlacementFields'
import { managedShelfFromOption } from '../shelves/types'
import { UnsavedGuard } from '../../components/UnsavedChanges'
import { DeweyField } from './DeweyField'

export function HoldingsImportRow({ row, options, batch, disabled, onSaved, onWorking, onClearError, expanded = false, onDirtyChange }: {
  row: ImportRow; options: Options; batch: Batch; disabled: boolean
  onSaved: () => Promise<void>; onWorking: (working: boolean) => void; onClearError: () => void
  onDirtyChange?:(dirty:boolean)=>void
  expanded?: boolean
}) {
  const withDewey = (value: ImportRow):ImportRow => ({...value,data:{...value.data,dewey:value.data.reviewedDewey?{code:value.data.reviewedDewey.code,source:value.data.reviewedDewey.source,reviewed:true}:null}})
  const [edit, setEdit] = useState<ImportRow>(()=>withDewey(row))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [checked, setChecked] = useState(false)
  useEffect(() => { setEdit(withDewey(row)); setError(''); setChecked(false) }, [row])
  // An edit after ticking means the values changed since they were checked, so the tick is asked for again.
  const change = (field: string, value: unknown) => { setChecked(false); setEdit(current => ({ ...current, data: { ...current.data, [field]: value } })) }
  const imported = row.status === 'Imported'
  const label = importRowLabel(row)
  const shelves = options.locations.map(managedShelfFromOption)
  const placement = importPlacement(edit, options)
  const choice = edit.decision ?? (row.matches.length || row.overlaps.length ? '' : 'new')
  async function save(): Promise<boolean> {
    if (busy || disabled) return false
    if (['new', 'add'].includes(choice) && !placementFits(shelves, placement, Number(edit.data.copies))) { setError('Choose a configured compartment with enough space for these copies.'); return false }
    setBusy(true); setError(''); onClearError(); onWorking(true)
    try { await enhancedCatalog.review({ ...edit, data: { ...edit.data, locationId: shelves.find(item => item.label === placement.shelfLocation)?.id, shelfColumn: placement.shelfColumn, shelfRow: placement.shelfRow }, decision: choice, lookupChecked: checked }); await onSaved(); return true }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'These changes could not be saved. Please try again.'); return false }
    finally { setBusy(false); onWorking(false) }
  }
  const choose = (decision: string) => setEdit(current => ({ ...current, decision,
    targetTitleId: ['add', 'link'].includes(decision) && row.matches.filter(match => match.status === 'Active').length === 1 ? Number(row.matches.find(match => match.status === 'Active')!.id) : current.targetTitleId,
  }))
  // Unsaved edits in this book: leaving asks Save changes (this book's own save, with its checks) or Discard changes.
  const changed = !imported && (checked || JSON.stringify(edit.data) !== JSON.stringify(withDewey(row).data) || (edit.decision ?? null) !== (row.decision ?? null))
  const dirtyCallback=useRef(onDirtyChange);dirtyCallback.current=onDirtyChange
  useEffect(()=>{dirtyCallback.current?.(changed)},[changed])
  useEffect(()=>()=>dirtyCallback.current?.(false),[])
  return <UnsavedGuard dirty={changed} resetKey={row.version} onSave={() => (choice ? save() : Promise.resolve(false))}><details className="rounded-2xl border border-[#0b5ea2]/15 bg-white dark:border-white/15 dark:bg-[#001a4d]" open={expanded || Boolean(row.error) || undefined}>
    <summary className="cursor-pointer p-4"><span className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0"><strong className="break-words">{row.data.title || 'Book title is missing'}</strong><span className="mt-1 block text-xs opacity-65">{row.data.author || 'Author is missing'} · {row.data.copies || '?'} {Number(row.data.copies) === 1 ? 'copy' : 'copies'}{Number(row.data.missingCopies) > 0 ? ` · ${row.data.missingCopies} missing` : ''}</span></span><span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${label.startsWith('Needs') ? 'bg-[#FFF200] text-[#0b5ea2]' : 'bg-[#0b5ea2]/5 dark:bg-white/10'}`}>{label}</span></span><span className="mt-2 block text-xs opacity-55">{imported ? 'View what was added' : label.startsWith('Needs') ? 'Open to answer or correct this book' : 'Open to edit book details'}</span></summary>
    <div className="space-y-4 border-t border-[#0b5ea2]/10 p-4 dark:border-white/15">
      <p className="text-xs opacity-65">From {row.sheet}, line {row.sourceRow}</p>
      {row.error ? <p role="alert" className="auth-error rounded-xl p-3 text-sm">{row.error}</p> : null}
      {imported ? <p className="text-sm">{row.result?.copyIds.length ?? 0} {row.result?.copyIds.length === 1 ? 'copy' : 'copies'} added. This book is protected from being added again by this upload.</p> : <>
        {row.errors.length ? <ul className="list-inside list-disc rounded-xl bg-[#FFF200]/25 p-3 text-sm">{row.errors.map(message => <li key={message}>{message}</li>)}</ul> : null}
        {row.matches.length ? <div className="rounded-xl bg-[#FFF200]/25 p-3 text-sm"><p className="font-semibold">A similar book is already in the library.</p>{row.matches.map(match => <p key={match.id} className="mt-1">{match.title} · {match.author}{match.status === 'Archived' ? ' (archived)' : ''}</p>)}<p className="mt-2 text-xs">Choose extra copies only if these are additional physical books. If they are already recorded, choose no extra copies.</p></div> : null}
        {row.overlaps.length ? <ImportDuplicateComparison row={row} rows={batch.rows}/> : null}
        {row.data.lookupFilled && Object.keys(row.data.lookupFilled).length ? <section aria-label="Details filled from the book lookup" className="rounded-xl border border-[#0b5ea2]/20 bg-[#0b5ea2]/5 p-3 text-sm dark:border-white/20 dark:bg-white/5">
          <p className="font-semibold">Filled from the book lookup — check before saving:</p>
          <ul className="mt-1 list-inside list-disc">{Object.entries(row.data.lookupFilled).map(([field, filled]) => <li key={field}>{importFieldNames[field] ?? field}: “{filled.value}” <span className="text-xs opacity-75">(from {lookupSourceName(filled.source)})</span></li>)}</ul>
          {needsLookupCheck(row) ? <label className="mt-2 flex items-start gap-2 font-semibold"><input type="checkbox" checked={checked} disabled={disabled || busy} onChange={event => setChecked(event.target.checked)} className="mt-1" />I checked the details filled from the book lookup and corrected any that are wrong.</label> : <p className="mt-1 text-xs opacity-75">Checked.</p>}
        </section> : null}
        <fieldset disabled={disabled || busy} className="space-y-4">
          <label className="block text-sm font-semibold">{row.matches.length || row.overlaps.length ? 'What should happen to this book?' : 'Include this book?'}<select className={catalogInput} value={choice} onChange={event => choose(event.target.value)}><option value="">Choose an answer</option>{!row.matches.length ? <option value="new">Add as a new book</option> : null}{row.matches.some(match => match.status === 'Active') ? <><option value="add">Add extra copies to an existing book</option><option value="link">Already recorded — add no copies</option></> : null}{row.overlaps.length ? <option value="reuse">Same copies listed earlier in this file — add no copies</option> : null}<option value="skip">Leave this book out</option></select></label>
          {['add', 'link'].includes(choice) ? <label className="block text-sm">Which library book?<select className={catalogInput} value={edit.targetTitleId ?? ''} onChange={event => setEdit(current => ({ ...current, targetTitleId: Number(event.target.value) || null }))}><option value="">Choose the matching book</option>{row.matches.filter(match => match.status === 'Active').map(match => <option key={match.id} value={match.id}>{match.title} · {match.author}</option>)}</select></label> : null}
          {choice === 'reuse' ? <label className="block text-sm">Which earlier entry lists these copies?<select className={catalogInput} value={edit.reuseRowId ?? ''} onChange={event => setEdit(current => ({ ...current, reuseRowId: Number(event.target.value) || null }))}><option value="">Choose a reviewed entry</option>{batch.rows.filter(previous => row.overlaps.some(id=>Number(id)===Number(previous.id)) && Number(previous.id) < Number(row.id) && ['Ready', 'Imported'].includes(previous.status) && previous.decision !== 'skip').map(previous => <option key={previous.id} value={previous.id}>{previous.data.title} — {previous.sheet}, line {previous.sourceRow}</option>)}</select></label> : null}
          {choice !== 'skip' ? <>
            <RequiredBookInformation draft={{title:edit.data.title,author:edit.data.author,isbn:edit.data.isbn}} disabled={disabled||busy} onApply={patch=>{setChecked(false);setEdit(current=>({...current,data:{...current.data,title:current.data.title.trim()?current.data.title:patch.title??current.data.title,author:current.data.author.trim()?current.data.author:patch.author??current.data.author}}))}}/>
            {['new', 'add'].includes(choice) && edit.data.categoryName && !edit.data.categoryId ? <ImportReferenceSuggestions label="Category" source={edit.data.categoryName} choices={options.categories} onChoose={item => change('categoryId', Number(item.id))} /> : null}
            {['new', 'add'].includes(choice) && edit.data.shelfLocation && !edit.data.location ? <ImportReferenceSuggestions label="Shelf" source={edit.data.shelfLocation} choices={options.locations.filter(item => item.status === 'Active')} onChoose={item => change('location', item.name)} /> : null}
            <div className="grid gap-3 sm:grid-cols-2">{(['title', 'author', 'copies'] as const).filter(field => field !== 'copies' || ['new', 'add'].includes(choice)).map(field => <label key={field} className="text-sm">{field === 'copies' && choice === 'add' ? 'Extra copies to add (not the library total)' : importFieldNames[field]}<input className={catalogInput} inputMode={field === 'copies' ? 'numeric' : undefined} value={edit.data[field]} onChange={event => change(field, event.target.value)} /></label>)}{['new', 'add'].includes(choice) ? <><label className="text-sm">Category<select className={catalogInput} value={edit.data.categoryId ?? ''} onChange={event => change('categoryId', Number(event.target.value) || null)}><option value="">Choose category</option>{options.categories.filter(category => category.status === 'Active' || !category.status).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><ShelfPlacementFields shelves={shelves} value={placement} label="Shelf" quantity={Number(edit.data.copies)} onChange={value => { setChecked(false); setEdit(current => ({ ...current, data: { ...current.data, location: value.shelfLocation, locationId: value.locationId, shelfColumn: value.shelfColumn, shelfRow: value.shelfRow } })) }} /></> : null}</div>
            {['new','add'].includes(choice)&&<DeweyField isbn={edit.data.isbn} value={edit.data.dewey??null} onChange={value=>change('dewey',value)}/>}
            <details className="rounded-xl border border-[#0b5ea2]/10 p-3 dark:border-white/15"><summary className="cursor-pointer text-sm font-semibold">More book details (optional)</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{(['isbn', 'edition', 'publisher', 'publicationYear', 'copyrightYear', 'pages', 'missingCopies', 'callNumber'] as const).map(field => <label key={field} className="text-sm">{importFieldNames[field]}<input className={catalogInput} value={edit.data[field]} onChange={event => change(field, event.target.value)} /></label>)}{(['accessions', 'barcodes'] as const).map(field => <label key={field} className="text-sm">{importFieldNames[field]}<textarea className={catalogInput} rows={2} value={edit.data[field]} onChange={event => change(field, event.target.value)} /><span className="text-xs opacity-60">One per copy; separate with semicolons or new lines.</span></label>)}<label className="text-sm">Program<select className={catalogInput} value={edit.data.programId ?? ''} onChange={event => change('programId', Number(event.target.value) || null)}><option value="">Not assigned</option>{options.programs.filter(program => program.status === 'Active').map(program => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label></div><label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={edit.data.generateAccessions} onChange={event => change('generateAccessions', event.target.checked)} className="mt-1" />Replace the accession numbers in this file with newly generated numbers.</label></details>
          </> : null}
          {error ? <p role="alert" className="auth-error rounded-xl p-3 text-sm">{error}</p> : null}
          <Button disabled={busy || !choice || (choice!=='skip'&&Boolean(edit.data.dewey?.code&&!edit.data.dewey.reviewed)) || (needsLookupCheck(row) && choice !== 'skip' && !checked)} onClick={() => void save()}>{busy ? 'Saving…' : choice === 'skip' ? 'Leave this book out' : 'Save this choice'}</Button>{changed&&<Button variant="secondary" disabled={disabled||busy} onClick={()=>{setEdit(withDewey(row));setChecked(false);setError('')}}>Discard unsaved edits</Button>}
        </fieldset>
      </>}
    </div>
  </details></UnsavedGuard>
}
