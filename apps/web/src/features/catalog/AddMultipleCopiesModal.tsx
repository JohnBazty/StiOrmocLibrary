import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, QrCode, X } from 'lucide-react'
import { ApiError, catalogApi } from './catalog-api'
import { BookLabelSheet } from './BookLabelSheet'
import type { BulkBookResult, Category } from './types'
import { isbnInputError, normalizeIsbnInput } from './isbn'

const fieldClass = 'h-11 w-full rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 text-sm text-[#003399] outline-none focus:border-[#003399] focus:ring-4 focus:ring-[#003399]/10'
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#003399]'

function Field({ label, name, required, value, onChange }: { label: string; name: string; required?: boolean; value?: string; onChange?: (value: string) => void }) {
  return <label><span className={labelClass}>{label}{required ? ' *' : ''}</span><input name={name} required={required} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined} className={fieldClass} /></label>
}

export function AddMultipleCopiesModal({ categories, onCreated, onClose }: {
  categories: Category[]
  onCreated: (batch: BulkBookResult) => Promise<void> | void
  onClose: () => void
}) {
  const [categoryId, setCategoryId] = useState('')
  const [bookLocation, setBookLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [batch, setBatch] = useState<BulkBookResult | null>(null)
  const [coverImageData, setCoverImageData] = useState<string | null>(null)
  const [isbn, setIsbn] = useState('')
  const [metadata, setMetadata] = useState({ title: '', author: '', publisher: '', publicationYear: '' })
  const [lookupStatus, setLookupStatus] = useState<{ state: 'idle' | 'loading' | 'found' | 'error'; message: string }>({ state: 'idle', message: '' })
  const lookupAbort = useRef<AbortController | null>(null)
  const lastLookup = useRef('')
  const liveIsbnError = useMemo(() => isbnInputError(isbn), [isbn])
  const locations = useMemo(() => Array.from(new Set(categories.flatMap((category) => category.shelfLocation ? [category.shelfLocation] : []))), [categories])

  const lookupIsbn = useCallback(async (value: string, force = false) => {
    const normalized = normalizeIsbnInput(value)
    if (isbnInputError(normalized) || (!force && normalized === lastLookup.current)) return
    lookupAbort.current?.abort()
    const controller = new AbortController(); lookupAbort.current = controller
    setLookupStatus({ state: 'loading', message: 'Checking ISBN…' })
    try {
      const result = await catalogApi.lookupIsbn(normalized, controller.signal)
      if (controller.signal.aborted) return
      lastLookup.current = normalized
      setMetadata((current) => ({
        title: result.title || current.title,
        author: result.author || current.author,
        publisher: result.publisher ?? current.publisher,
        publicationYear: result.publicationYear ? String(result.publicationYear) : current.publicationYear,
      }))
      const source = result.source === 'local_catalog' ? 'SmartLib catalog' : result.source === 'google_books' ? 'Google Books' : 'Open Library'
      setLookupStatus({ state: 'found', message: `Book information found from ${source}. Review the details before saving.` })
    } catch (reason) {
      if (controller.signal.aborted) return
      lastLookup.current = normalized
      const error = reason as ApiError
      setLookupStatus({ state: 'error', message: error.message || 'Book metadata could not be found. Enter the details manually.' })
    }
  }, [])

  useEffect(() => {
    if (!isbn || liveIsbnError) {
      lookupAbort.current?.abort()
      setLookupStatus({ state: 'idle', message: '' })
      return
    }
    const timer = window.setTimeout(() => { void lookupIsbn(isbn) }, 600)
    return () => window.clearTimeout(timer)
  }, [isbn, liveIsbnError, lookupIsbn])

  useEffect(() => () => lookupAbort.current?.abort(), [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || batch) return
    if (liveIsbnError) {
      setErrors((current) => ({ ...current, isbn: liveIsbnError }))
      setMessage('Correct the ISBN check digit before creating this catalog record.')
      return
    }
    const data = Object.fromEntries(new FormData(event.currentTarget).entries())
    setSaving(true); setErrors({}); setMessage('')
    try {
      const result = await catalogApi.createBulkBook({
        title: data.title, author: data.author, isbn: normalizeIsbnInput(isbn),
        number_of_copies: data.numberOfCopies, publication_year: data.publicationYear || null,
        publisher: data.publisher, call_number: data.callNumber,
        purchase_price: data.purchasePrice,
        category_id: data.categoryId, shelf_location: data.bookLocation,
        cover_image_data: coverImageData,
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
    if (!file) { setCoverImageData(null); return }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setErrors((current) => ({ ...current, cover_image: 'Choose a JPEG, PNG, or WebP image no larger than 2 MB.' }))
      event.target.value = ''; return
    }
    const reader = new FileReader()
    reader.onload = () => { setCoverImageData(String(reader.result)); setErrors((current) => { const next = { ...current }; delete next.cover_image; return next }) }
    reader.readAsDataURL(file)
  }

  function changeCategory(value: string) {
    setCategoryId(value)
    const selected = categories.find((category) => String(category.categoryId) === value)
    setBookLocation(selected?.shelfLocation ?? '')
  }

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-[#003399]/80 p-4">
    <div role="dialog" aria-modal="true" aria-labelledby="multiple-copies-title" className="mx-auto my-4 w-full max-w-6xl rounded-2xl bg-[#FFFFFF] shadow-2xl">
      <header className="flex items-start justify-between border-b border-[#003399]/15 p-5"><div><p className="text-xs font-bold uppercase text-[#003399]">Catalog entry</p><h2 id="multiple-copies-title" className="text-xl font-black text-[#003399]">Add multiple book copies</h2></div><button aria-label="Close" disabled={saving} onClick={onClose} className="p-2 text-[#003399] disabled:opacity-40"><X /></button></header>
      <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
        {message ? <div role={batch ? 'status' : 'alert'} className={`rounded-xl p-3 text-sm font-semibold text-[#003399] sm:col-span-2 ${batch ? 'border border-[#003399] bg-[#FFFFFF]' : 'bg-[#FFF200]'}`}>{message}</div> : null}
        {Object.keys(errors).length ? <div role="alert" className="rounded-xl bg-[#FFF200] p-3 text-sm text-[#003399] sm:col-span-2"><ul className="list-inside list-disc">{Object.entries(errors).map(([field, error]) => <li key={field}><strong>{field}:</strong> {error}</li>)}</ul></div> : null}
        <Field label="Title" name="title" required value={metadata.title} onChange={(title) => setMetadata((current) => ({ ...current, title }))} /><Field label="Author" name="author" required value={metadata.author} onChange={(author) => setMetadata((current) => ({ ...current, author }))} />
        <label><span className={labelClass}>ISBN *</span><input name="isbn" required value={isbn} inputMode="text" autoComplete="off" aria-invalid={Boolean(liveIsbnError || errors.isbn)} aria-describedby="isbn-feedback isbn-lookup-feedback" onChange={(event) => { setIsbn(event.target.value); if (normalizeIsbnInput(event.target.value) !== lastLookup.current) lastLookup.current = ''; setErrors((current) => { const next = { ...current }; delete next.isbn; return next }) }} onBlur={() => { const normalized = normalizeIsbnInput(isbn); setIsbn(normalized); if (!isbnInputError(normalized)) void lookupIsbn(normalized, true) }} onKeyDown={(event) => { if (event.key === 'Enter' && !liveIsbnError) { event.preventDefault(); const normalized = normalizeIsbnInput(isbn); setIsbn(normalized); void lookupIsbn(normalized, true) } }} placeholder="ISBN-10 or ISBN-13" className={fieldClass} /><span id="isbn-feedback" className={`mt-1.5 block text-xs font-semibold ${liveIsbnError || errors.isbn ? 'text-[#003399]' : 'text-[#003399]/65'}`}>{liveIsbnError ?? errors.isbn ?? (isbn ? `Valid ${normalizeIsbnInput(isbn).length === 10 ? 'ISBN-10' : 'ISBN-13'} checksum` : 'Hyphens and spaces are accepted.')}</span>{lookupStatus.message ? <span id="isbn-lookup-feedback" role={lookupStatus.state === 'error' ? 'alert' : 'status'} className={`mt-1 block text-xs font-bold ${lookupStatus.state === 'error' ? 'rounded-lg bg-[#FFF200] p-2 text-[#003399]' : 'text-[#003399]'}`}>{lookupStatus.message}</span> : null}</label><label><span className={labelClass}>Number of copies *</span><input name="numberOfCopies" required type="number" min="1" max="100" defaultValue="2" className={fieldClass} /></label>
        <Field label="Publication year" name="publicationYear" value={metadata.publicationYear} onChange={(publicationYear) => setMetadata((current) => ({ ...current, publicationYear }))} /><Field label="Publisher" name="publisher" value={metadata.publisher} onChange={(publisher) => setMetadata((current) => ({ ...current, publisher }))} />
        <label><span className={labelClass}>Purchase price *</span><input name="purchasePrice" required type="number" min="0.01" step="0.01" placeholder="0.00" className={fieldClass} /><span className="mt-1.5 block text-xs text-[#003399]/65">Used automatically as the replacement charge if a copy is confirmed lost.</span></label>
        <Field label="Call number" name="callNumber" />
        <label><span className={labelClass}>Cover page</span><span className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#003399]/20 bg-[#FFFFFF] px-3 text-sm font-bold text-[#003399]"><ImagePlus size={17} />{coverImageData ? 'Cover selected' : 'Upload cover image'}<input aria-label="Upload cover page" type="file" accept="image/jpeg,image/png,image/webp" onChange={selectCover} className="sr-only" /></span></label>
        <label><span className={labelClass}>Book location *</span><select name="bookLocation" required value={bookLocation} onChange={(event) => setBookLocation(event.target.value)} className={fieldClass}><option value="">Select book location</option>{locations.map((location) => <option key={location} value={location}>{location}</option>)}</select></label>
        <label><span className={labelClass}>Category *</span><select name="categoryId" required value={categoryId} onChange={(event) => changeCategory(event.target.value)} className={fieldClass}><option value="">Select category</option>{categories.map((category) => <option key={category.categoryId} value={category.categoryId}>{category.categoryName}</option>)}</select></label>
        {!categories.length ? <p role="alert" className="text-sm font-semibold text-[#003399] sm:col-span-2">Create a category and book location before adding physical copies.</p> : null}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 sm:col-span-2">
          {!batch ? <><button type="button" disabled={saving} onClick={onClose} className="h-11 rounded-xl border border-[#003399] bg-[#FFFFFF] px-5 font-bold text-[#003399] disabled:opacity-40">Cancel</button><button type="submit" disabled={saving || !categories.length || Boolean(liveIsbnError)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#003399] px-5 font-bold text-[#FFFFFF] disabled:opacity-50"><QrCode size={17} />{saving ? 'Saving copy and generating codes…' : 'Create copy and generate codes'}</button></> : <button type="button" onClick={onClose} className="h-11 rounded-xl bg-[#003399] px-5 font-bold text-[#FFFFFF]">Close and view inventory</button>}
        </div>
      </form>
      {batch ? <div className="border-t border-[#003399]/15 p-5"><BookLabelSheet batch={batch} /></div> : null}
    </div>
  </div>
}
