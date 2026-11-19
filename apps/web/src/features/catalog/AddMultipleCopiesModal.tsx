import {RequiredBookInformation} from './RequiredBookInformation'
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, QrCode, X } from 'lucide-react'
import { ApiError, catalogApi } from './catalog-api'
import { BookLabelSheet } from './BookLabelSheet'
import type { BulkBookResult, Category } from './types'
import { isbnInputError, normalizeIsbnInput } from './isbn'
import { SelectedFilePreview } from '../../components/SelectedFilePreview'
import { confirmLeave, UnsavedGuard } from '../../components/UnsavedChanges'
import { CategorySuggestion } from './CategorySuggestion'
import { PredictionList, usePredictions } from './usePredictions'
import { DeweyField } from './DeweyField'
import type { DeweySelection } from './dewey-api'
import { ShelfPlacementFields, placementFits } from '../shelves/ShelfPlacementFields'
import { useManagedShelves } from '../shelves/useManagedShelves'
import type { ManagedShelf } from '../shelves/types'

const fieldClass = 'h-11 w-full rounded-xl border border-[#0b5ea2]/20 bg-[#FFFFFF] px-3 text-sm text-[#0b5ea2] outline-none focus:border-[#0b5ea2] focus:ring-4 focus:ring-[#0b5ea2]/10'
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#0b5ea2]'
/** Same list as the API's FUND_SOURCES (bulk-book.validation.ts). */
const FUND_SOURCES = ['Purchase', 'Donation', 'Government grant', 'Other']

function Field({ label, name, required, value, onChange, list }: { label: string; name: string; required?: boolean; value?: string; onChange?: (value: string) => void; list?: string }) {
  return <label><span className={labelClass}>{label}{required ? ' *' : ''}</span><input name={name} required={required} value={value} list={list} autoComplete={list ? 'off' : undefined} onChange={onChange ? (event) => onChange(event.target.value) : undefined} className={fieldClass} /></label>
}

export function AddMultipleCopiesModal({ categories, locations, onCreated, onClose }: {
  categories: Category[]
  locations?: string[]
  onCreated: (batch: BulkBookResult) => Promise<void> | void
  onClose: () => void
}) {
  const [categoryId, setCategoryId] = useState('')
  const [subjects, setSubjects] = useState<string[]>([])
  const [createdCategories, setCreatedCategories] = useState<Category[]>([])
  const allCategories = useMemo(() => [...categories, ...createdCategories.filter((made) => !categories.some((known) => known.categoryId === made.categoryId))], [categories, createdCategories])
  const [bookLocation, setBookLocation] = useState('')
  const [shelfColumn, setShelfColumn] = useState(1)
  const [shelfRow, setShelfRow] = useState(1)
  const [copyQuantity, setCopyQuantity] = useState(2)
  const shelfData = useManagedShelves()
  const shownShelves: ManagedShelf[] = shelfData.shelves.length ? shelfData.shelves : (locations ?? [...new Set(allCategories.map(item => item.shelfLocation))]).map((label, index) => ({ id: index + 1, label, columnCount: 1, rowCount: 1, defaultCapacity: null, capacityConfigured: false, version: 0, status: 'Active', used: 0, capacity: null, remaining: null, compartments: [] }))
  const placement = { shelfLocation: bookLocation, shelfColumn, shelfRow }
  const canPlace = placementFits(shelfData.shelves, placement, copyQuantity)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [batch, setBatch] = useState<BulkBookResult | null>(null)
  const [review, setReview] = useState<{ signature: string; data: Record<string, FormDataEntryValue> } | null>(null)
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  const [isbn, setIsbn] = useState('')
  const [dewey,setDewey]=useState<DeweySelection|null>(null)
  const currentIsbn=useRef('');currentIsbn.current=normalizeIsbnInput(isbn)
  const existingCatalogIsbn=useRef('')
  const coverSuppressed=useRef(''),coverInFlight=useRef(''),coverAbort=useRef<AbortController|null>(null),mounted=useRef(true)
  const [coverBusy,setCoverBusy]=useState(false),[coverNotice,setCoverNotice]=useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const coverInput = useRef<HTMLInputElement>(null)
  // 'auto' covers came from a lookup; a cover staff chose ('manual') is never replaced by one.
  const coverSource = useRef<'none' | 'auto' | 'manual'>('none')
  const coverRequest = useRef(0)
  const [autoCover, setAutoCover] = useState(false)
  const clearCover = () => { setReview(null); coverRequest.current += 1;coverAbort.current?.abort();coverInFlight.current='';coverSuppressed.current=currentIsbn.current;setCoverBusy(false);setCoverNotice('');coverSource.current = 'none'; setAutoCover(false); setCoverFile(null); if (coverInput.current) coverInput.current.value = '' }
  const attachLookupCover = useCallback(async (isbnForCover: string,force=false) => {
    setReview(null)
    if(existingCatalogIsbn.current===isbnForCover){setCoverNotice('This book already exists. Its library cover is kept when adding copies.');return}
    if (coverSource.current === 'manual'||coverInFlight.current===isbnForCover||(!force&&coverSuppressed.current===isbnForCover)) return
    coverAbort.current?.abort();const controller=new AbortController();coverAbort.current=controller
    coverInFlight.current=isbnForCover;const request=++coverRequest.current;setCoverBusy(true);setCoverNotice('Looking for a cover…')
    let file: File | null = null
    try { file = await catalogApi.fetchCover(isbnForCover,controller.signal) } catch { file = null }
    if (!mounted.current||request !== coverRequest.current || controller.signal.aborted||currentIsbn.current!==isbnForCover||(coverSource.current as string)==='manual') return
    coverInFlight.current='';setCoverBusy(false)
    if (!file) {setCoverNotice('No matching cover was found. Upload a cover or try again.');return}
    coverSuppressed.current='';coverSource.current='auto';setAutoCover(true);setCoverFile(file);setCoverNotice('Cover found for this ISBN. Review it before saving.')
  }, [])
  const [metadata, setMetadata] = useState({ title: '', author: '', publisher: '', publicationYear: '' })
  const [callNumber, setCallNumber] = useState('')
  const selectedCategoryName = useMemo(
    () => allCategories.find((category) => String(category.categoryId) === categoryId)?.categoryName ?? '',
    [allCategories, categoryId],
  )
  const titlePredictions = usePredictions('title', metadata.title)
  const authorPredictions = usePredictions('author', metadata.author)
  const [lookupStatus, setLookupStatus] = useState<{ state: 'idle' | 'loading' | 'found' | 'error'; message: string }>({ state: 'idle', message: '' })
  const lookupAbort = useRef<AbortController | null>(null)
  const lastLookup = useRef('')
  const liveIsbnError = useMemo(() => isbnInputError(isbn), [isbn])

  const lookupIsbn = useCallback(async (value: string, force = false) => {
    const normalized = normalizeIsbnInput(value)
    if (isbnInputError(normalized) || (!force && normalized === lastLookup.current)) return
    lookupAbort.current?.abort()
    const controller = new AbortController(); lookupAbort.current = controller
    setReview(null)
    setLookupStatus({ state: 'loading', message: 'Checking ISBN…' })
    try {
      const result = await catalogApi.lookupIsbn(normalized, controller.signal)
      if (controller.signal.aborted) return
      if (!result) throw new Error('Book information was not found. Enter the details manually.')
      lastLookup.current = normalized
      existingCatalogIsbn.current=result.source==='local_catalog'?normalized:''
      if(result.source==='local_catalog'){coverRequest.current++;coverAbort.current?.abort();coverInFlight.current='';setCoverBusy(false);if(coverSource.current==='auto'){coverSource.current='none';setAutoCover(false);setCoverFile(null)}setCoverNotice('This book already exists. Its library cover is kept when adding copies.')}
      const source = result.source === 'local_catalog' ? 'local library catalog' : result.source === 'google_books' ? 'Google Books' : 'Open Library'
      setLookupStatus({ state: 'found', message: `Book match found from ${source}. Use Auto-fill missing required information to review missing details.` })
      // A title already in the catalog keeps its own cover; saving copies would otherwise replace it.
      setSubjects(result.subjects ?? [])
      if (result.source !== 'local_catalog') void attachLookupCover(normalized)
    } catch (reason) {
      if (controller.signal.aborted) return
      lastLookup.current = normalized
      void attachLookupCover(normalized)
      const error = reason as ApiError
      setLookupStatus({ state: 'error', message: error.message || 'Book metadata could not be found. Enter the details manually.' })
    }
  }, [attachLookupCover])

  useEffect(() => {
    if (!isbn || liveIsbnError) {
      lookupAbort.current?.abort()
      setLookupStatus({ state: 'idle', message: '' })
      return
    }
    const timer = window.setTimeout(() => { void lookupIsbn(isbn) }, 600)
    return () => window.clearTimeout(timer)
  }, [isbn, liveIsbnError, lookupIsbn])

  useEffect(() => {mounted.current=true;return()=>{mounted.current=false;lookupAbort.current?.abort();coverAbort.current?.abort();coverRequest.current++}}, [])

  // Any manual edit or asynchronous lookup changes what must be reviewed.
  useEffect(() => { setReview(null) }, [metadata, callNumber, isbn, categoryId, bookLocation, shelfColumn, shelfRow, copyQuantity, dewey, coverFile])
  useEffect(() => { if (review) reviewHeading.current?.focus() }, [review])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || batch) return
    if(coverBusy||lookupStatus.state==='loading'){setMessage('Wait for the book and cover lookup to finish before saving.');return}
    if (!canPlace) { setMessage('Choose a configured compartment with enough space for every copy.'); return }
    if (liveIsbnError) {
      setErrors((current) => ({ ...current, isbn: liveIsbnError }))
      setMessage('Correct the ISBN check digit before creating this catalog record.')
      return
    }
    if (dewey?.code && !dewey.reviewed) { setMessage('Review the Dewey number or leave it unassigned before continuing.'); return }
    if (!event.currentTarget.reportValidity()) return
    const data = Object.fromEntries(new FormData(event.currentTarget).entries())
    const signature = JSON.stringify({ data, isbn: normalizeIsbnInput(isbn), dewey, cover: coverFile ? [coverFile.name, coverFile.size, coverFile.lastModified] : null })
    if (!review || review.signature !== signature) {
      setErrors({}); setMessage(''); setReview({ signature, data }); return
    }
    setSaving(true); setErrors({}); setMessage('')
    try {
      const coverImageData = coverFile ? await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('The cover could not be read. Choose the image again.'))
        reader.readAsDataURL(coverFile)
      }) : null
      const resolvedCallNumber = String(data.callNumber || callNumber || '').trim()
      const result = await catalogApi.createBulkBook({
        title: data.title, author: data.author, isbn: normalizeIsbnInput(isbn),
        dewey,
        number_of_copies: data.numberOfCopies, publication_year: data.publicationYear || null,
        publisher: data.publisher, call_number: resolvedCallNumber,
        category_id: data.categoryId, shelf_location: data.bookLocation,
        locationId: data.locationId, shelfColumn: Number(data.shelfColumn), shelfRow: Number(data.shelfRow),
        cover_image_data: coverImageData,
        classification: resolvedCallNumber, edition: data.edition, volumes: data.volumes, pages: data.pages, remarks: data.remarks,
        fund_source: data.fundSource, fund_detail: data.fundDetail, cost_php: data.costPhp, received_on: data.receivedOn,
      })
      setBatch(result)
      setMessage(`Saved to inventory: ${result.numberOfCopies} physical ${result.numberOfCopies === 1 ? 'copy' : 'copies'} with unique QR and barcode labels.`)
      await onCreated(result)
    } catch (reason) {
      const apiError = reason as ApiError
      setErrors(apiError.details?.errors ?? {})
      setMessage(apiError.message || 'The copies could not be created.')
    } finally { setSaving(false) }
  }

  function selectCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    clearCover()
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setErrors((current) => ({ ...current, cover_image: 'Choose a JPEG, PNG, or WebP image no larger than 2 MB.' }))
      event.target.value = ''; return
    }
    coverSource.current = 'manual'
    setCoverFile(file)
    setErrors((current) => { const next = { ...current }; delete next.cover_image; return next })
  }

  function changeCategory(value: string) {
    setCategoryId(value)
    const selected = allCategories.find((category) => String(category.categoryId) === value)
    setBookLocation(selected?.shelfLocation ?? ''); setShelfColumn(selected?.shelfColumn ?? 1); setShelfRow(selected?.shelfRow ?? 1)
  }

  // Values a lookup filled count as changes too; after saving, the copies exist and nothing is left to lose.
  const filledSomething = !batch && Boolean(metadata.title || metadata.author || isbn || coverFile)
  return <UnsavedGuard dirty={filledSomething} resetKey={batch?.titleId}><div className="fixed inset-0 z-50 overflow-y-auto bg-[#0b5ea2]/80 p-4">
    <div role="dialog" aria-modal="true" aria-labelledby="multiple-copies-title" className="mx-auto my-4 w-full max-w-6xl rounded-2xl bg-[#FFFFFF] shadow-2xl">
      <header className="flex items-start justify-between border-b border-[#0b5ea2]/15 p-5"><h2 id="multiple-copies-title" className="text-xl font-black text-[#0b5ea2]">Add book</h2><button aria-label="Close" disabled={saving} onClick={() => confirmLeave(onClose)} className="p-2 text-[#0b5ea2] disabled:opacity-40"><X /></button></header>
      <form onSubmit={submit} onChangeCapture={() => setReview(null)} onInvalidCapture={event => {
        const details = (event.target as HTMLElement).closest('details')
        if (details) details.open = true
      }} className="grid gap-4 p-5 sm:grid-cols-2">
        {message ? <div role={batch ? 'status' : 'alert'} className={`rounded-xl p-3 text-sm font-semibold text-[#0b5ea2] sm:col-span-2 ${batch ? 'border border-[#0b5ea2] bg-[#FFFFFF]' : 'bg-[#FFF200]'}`}>{message}</div> : null}
        {Object.keys(errors).length ? <div role="alert" className="rounded-xl bg-[#FFF200] p-3 text-sm text-[#0b5ea2] sm:col-span-2"><ul className="list-inside list-disc">{Object.entries(errors).map(([field, error]) => <li key={field}><strong>{field}:</strong> {error}</li>)}</ul></div> : null}
        <fieldset disabled={saving || Boolean(batch)} className="contents">
        <PredictionList id="title-predictions" suggestions={titlePredictions} /><PredictionList id="author-predictions" suggestions={authorPredictions} />
        <Field label="Title" name="title" required list="title-predictions" value={metadata.title} onChange={(title) => setMetadata((current) => ({ ...current, title }))} /><Field label="Author" name="author" required list="author-predictions" value={metadata.author} onChange={(author) => setMetadata((current) => ({ ...current, author }))} />
        <label><span className={labelClass}>ISBN *</span><input name="isbn" required value={isbn} inputMode="text" autoComplete="off" aria-invalid={Boolean(liveIsbnError || errors.isbn)} aria-describedby="isbn-feedback isbn-lookup-feedback" onChange={(event) => { setIsbn(event.target.value);lookupAbort.current?.abort();coverAbort.current?.abort();coverRequest.current++;coverInFlight.current='';setCoverBusy(false);setCoverNotice(''); if (coverSource.current === 'auto') clearCover();if(normalizeIsbnInput(event.target.value)!==currentIsbn.current)coverSuppressed.current=''; if (normalizeIsbnInput(event.target.value) !== lastLookup.current) lastLookup.current = ''; setErrors((current) => { const next = { ...current }; delete next.isbn; return next }) }} onBlur={() => { const normalized = normalizeIsbnInput(isbn); setIsbn(normalized); if (!isbnInputError(normalized)) void lookupIsbn(normalized, true) }} onKeyDown={(event) => { if (event.key === 'Enter' && !liveIsbnError) { event.preventDefault(); const normalized = normalizeIsbnInput(isbn); setIsbn(normalized); void lookupIsbn(normalized, true) } }} placeholder="ISBN-10 or ISBN-13" className={fieldClass} /><span id="isbn-feedback" className={`mt-1.5 block text-xs font-semibold ${liveIsbnError || errors.isbn ? 'text-[#0b5ea2]' : 'text-[#0b5ea2]/65'}`}>{liveIsbnError ?? errors.isbn ?? (isbn ? `Valid ${normalizeIsbnInput(isbn).length === 10 ? 'ISBN-10' : 'ISBN-13'} checksum` : 'Hyphens and spaces are accepted.')}</span>{lookupStatus.message ? <span id="isbn-lookup-feedback" role={lookupStatus.state === 'error' ? 'alert' : 'status'} className={`mt-1 block text-xs font-bold ${lookupStatus.state === 'error' ? 'rounded-lg bg-[#FFF200] p-2 text-[#0b5ea2]' : 'text-[#0b5ea2]'}`}>{lookupStatus.message}</span> : null}</label><label><span className={labelClass}>Number of copies *</span><input name="numberOfCopies" required type="number" min="1" max="100" value={copyQuantity} onChange={event => setCopyQuantity(Number(event.target.value))} className={fieldClass} /></label>
        <RequiredBookInformation draft={{title:metadata.title,author:metadata.author,isbn}} requireIsbn disabled={saving||Boolean(batch)} onApply={patch=>{setMetadata(current=>({...current,title:current.title.trim()?current.title:patch.title??current.title,author:current.author.trim()?current.author:patch.author??current.author}));if(patch.isbn)setIsbn(current=>current.trim()?current:patch.isbn!)}}/>
        <div className="sm:col-span-2">
          <DeweyField
            isbn={isbn}
            title={metadata.title}
            author={metadata.author}
            categoryName={selectedCategoryName}
            value={dewey}
            onChange={setDewey}
            onGenerateCallNumber={(generated) => setCallNumber(generated.callNumber)}
            disabled={saving||Boolean(batch)}
          />
          <p className="mt-2 text-sm">The reviewed number applies to every new copy in this entry.</p>
        </div>
        <div className="space-y-3"><label><span className={labelClass}>Cover page</span><span className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#0b5ea2]/20 bg-[#FFFFFF] px-3 text-sm font-bold text-[#0b5ea2]"><ImagePlus size={17} />{coverFile ? 'Choose a different cover' : 'Upload cover image'}<input ref={coverInput} disabled={saving || Boolean(batch)} aria-label="Upload cover page" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectCover} className="sr-only" /></span></label><button type="button" disabled={saving||Boolean(batch)||coverBusy||lookupStatus.state==='loading'||!normalizeIsbnInput(isbn)||Boolean(liveIsbnError)||coverSource.current==='manual'} onClick={()=>void attachLookupCover(normalizeIsbnInput(isbn),true)} className="min-h-11 rounded-xl border border-[#0b5ea2]/30 px-3 text-sm font-bold text-[#0b5ea2] disabled:opacity-50">{coverBusy?'Finding cover…':'Find cover automatically'}</button>{coverNotice&&<p role="status" className="text-xs text-[#0b5ea2]">{coverNotice}</p>}{coverSource.current==='manual'&&<p className="text-xs text-[#0b5ea2]">Your uploaded cover is kept. Remove it to find a cover automatically.</p>}<SelectedFilePreview file={coverFile} onRemove={clearCover} disabled={saving || Boolean(batch)} />{autoCover ? <p role="status" className="text-xs font-semibold text-[#0b5ea2]">Cover added from the book lookup. Choose a different cover or remove it if it is wrong.</p> : null}</div>
        <label><span className={labelClass}>Category *</span><select name="categoryId" required value={categoryId} onChange={(event) => changeCategory(event.target.value)} className={fieldClass}><option value="">Select category</option>{allCategories.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.categoryName}</option>)}</select></label>
        <CategorySuggestion subjects={subjects} categories={allCategories} categoryId={categoryId} onSelect={(category, created) => {
          if (created) setCreatedCategories((current) => [...current, category])
          setCategoryId(String(category.categoryId)); setBookLocation(category.shelfLocation); setShelfColumn(category.shelfColumn ?? 1); setShelfRow(category.shelfRow ?? 1)
        }} />
        <ShelfPlacementFields shelves={shownShelves} value={placement} quantity={copyQuantity} disabled={saving || Boolean(batch)} label="Book location" name="bookLocation" error={shelfData.error} onChange={value => { setBookLocation(value.shelfLocation); setShelfColumn(value.shelfColumn); setShelfRow(value.shelfRow) }} />
        <details className="rounded-xl border border-[#0b5ea2]/15 p-4 sm:col-span-2">
          <summary className="min-h-11 cursor-pointer font-semibold text-[#0b5ea2]">More book details</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Publication year" name="publicationYear" value={metadata.publicationYear} onChange={(publicationYear) => setMetadata((current) => ({ ...current, publicationYear }))} /><Field label="Publisher" name="publisher" value={metadata.publisher} onChange={(publisher) => setMetadata((current) => ({ ...current, publisher }))} />
        <p className="self-center text-sm text-[#0b5ea2]/70 sm:col-span-2">Supplier quotation optional. You can attach one from the catalog after saving this book.</p>
        <fieldset className="grid gap-4 rounded-xl border border-[#0b5ea2]/15 p-4 sm:col-span-2 sm:grid-cols-2"><legend className="px-1 text-sm font-black text-[#0b5ea2]">Book register</legend>
          <Field label="Call number" name="callNumber" value={callNumber} onChange={setCallNumber} /><Field label="Edition" name="edition" />
          <Field label="Volumes" name="volumes" /><label><span className={labelClass}>Pages</span><input name="pages" type="number" min="1" max="100000" className={fieldClass} /></label>
          <label><span className={labelClass}>Source of fund</span><select name="fundSource" defaultValue="" className={fieldClass}><option value="">Not recorded</option>{FUND_SOURCES.map((source) => <option key={source}>{source}</option>)}</select></label><Field label="Fund details" name="fundDetail" />
          <label><span className={labelClass}>Cost price (PHP, each copy)</span><input name="costPhp" type="number" min="0" max="999999.99" step="0.01" inputMode="decimal" className={fieldClass} /></label><label><span className={labelClass}>Date received</span><input name="receivedOn" type="date" className={fieldClass} /></label>
          <label className="sm:col-span-2"><span className={labelClass}>Remarks</span><textarea name="remarks" maxLength={2000} rows={2} className="w-full rounded-xl border border-[#0b5ea2]/20 bg-[#FFFFFF] p-3 text-sm text-[#0b5ea2] outline-none focus:border-[#0b5ea2] focus:ring-4 focus:ring-[#0b5ea2]/10" /></label>
          <p className="text-xs text-[#0b5ea2]/70 sm:col-span-2">Call number, edition, volumes, pages and remarks are saved when this entry creates a new title. Fund, cost and date received are saved on every copy.</p>
        </fieldset>
          </div>
        </details>
        {review && !batch ? <section aria-labelledby="book-review-title" className="space-y-3 rounded-xl border border-[#0b5ea2]/25 bg-[#0b5ea2]/5 p-4 sm:col-span-2">
          <h3 id="book-review-title" ref={reviewHeading} tabIndex={-1} className="font-bold outline-none">Review book and copies</h3>
          <p className="text-sm">Check this entry before adding it. Changes to the draft or lookup results require another review. Existing catalog details are preserved when the ISBN already belongs to a book.</p>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {[['Title', review.data.title], ['Author', review.data.author], ['ISBN', normalizeIsbnInput(isbn)], ['Copies', copyQuantity], ['Category', allCategories.find(item => String(item.categoryId) === categoryId)?.categoryName], ['Shelf placement', `${bookLocation}, Column ${shelfColumn}, Row ${shelfRow}`], ['Dewey', dewey?.code ? `${dewey.code}  -  ${dewey.source === 'manual' ? 'Entered manually' : 'Open Library'}  -  Reviewed` : 'Unassigned'], ['Cover', coverFile?.name ?? 'No new cover selected'], ['Publication year', review.data.publicationYear], ['Publisher', review.data.publisher], ['Call number', review.data.callNumber], ['Edition', review.data.edition], ['Volumes', review.data.volumes], ['Pages', review.data.pages], ['Source of fund', review.data.fundSource], ['Fund details', review.data.fundDetail], ['Cost per copy (PHP)', review.data.costPhp], ['Date received', review.data.receivedOn], ['Remarks', review.data.remarks]].map(([label, value]) => <div key={String(label)}><dt className="font-semibold">{String(label)}</dt><dd className="break-words">{String(value || 'Not recorded')}</dd></div>)}
          </dl>
          <button type="button" disabled={saving} onClick={() => setReview(null)} className="min-h-11 rounded-xl border border-[#0b5ea2]/25 px-4 text-sm font-semibold">Keep editing</button>
        </section> : null}
        {!allCategories.length ? <p role="alert" className="text-sm font-semibold text-[#0b5ea2] sm:col-span-2">Create a category and book location before adding physical copies.</p> : null}
        </fieldset>
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 sm:col-span-2">
          {!batch ? <><button type="button" disabled={saving} onClick={() => confirmLeave(onClose)} className="h-11 rounded-xl border border-[#0b5ea2] bg-[#FFFFFF] px-5 font-bold text-[#0b5ea2] disabled:opacity-40">Cancel</button><button type="submit" disabled={saving || coverBusy || lookupStatus.state==='loading' || !allCategories.length || Boolean(liveIsbnError) || !canPlace || Boolean(dewey?.code&&!dewey.reviewed)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0b5ea2] px-5 font-bold text-[#FFFFFF] disabled:opacity-50"><QrCode size={17} />{saving ? 'Saving copy and generating codes…' : review ? `Add book and ${copyQuantity} ${copyQuantity === 1 ? 'copy' : 'copies'}` : 'Review book and copies'}</button></> : <button type="button" onClick={onClose} className="h-11 rounded-xl bg-[#0b5ea2] px-5 font-bold text-[#FFFFFF]">Close and view inventory</button>}
        </div>
      </form>
      {batch ? <div className="border-t border-[#0b5ea2]/15 p-5"><BookLabelSheet batch={batch} /></div> : null}
    </div>
  </div></UnsavedGuard>
}
