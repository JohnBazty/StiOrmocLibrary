import { AlertCircle, CheckCircle2, ImagePlus, QrCode, Sparkles, X } from 'lucide-react'
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SelectedFilePreview } from '../../components/SelectedFilePreview'
import { confirmLeave, UnsavedGuard } from '../../components/UnsavedChanges'
import { ShelfPlacementFields, placementFits } from '../shelves/ShelfPlacementFields'
import type { ManagedShelf } from '../shelves/types'
import { useManagedShelves } from '../shelves/useManagedShelves'
import { BookLabelSheet } from './BookLabelSheet'
import { ApiError, catalogApi } from './catalog-api'
import { CategorySuggestion } from './CategorySuggestion'
import type { DeweySelection } from './dewey-api'
import { DeweyField } from './DeweyField'
import { isbnInputError, normalizeIsbnInput } from './isbn'
import { RequiredBookInformation } from './RequiredBookInformation'
import type { BulkBookResult, Category } from './types'
import { PredictionList, usePredictions } from './usePredictions'

const fieldClass =
  'h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#0b5ea2] focus:ring-4 focus:ring-[#0b5ea2]/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200'
/** Same list as the API's FUND_SOURCES (bulk-book.validation.ts). */
const FUND_SOURCES = ['Purchase', 'Donation', 'Government grant', 'Other']

function generateValidIsbn13(): string {
  const randomDigits = String(Math.floor(100000 + Math.random() * 900000))
  const prefix = `978621${randomDigits}`
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(prefix[i]) * (i % 2 === 0 ? 1 : 3)
  }
  const check = (10 - (sum % 10)) % 10
  return `${prefix}${check}`
}

function Field({
  label,
  name,
  required,
  value,
  onChange,
  list,
  placeholder,
}: {
  label: string
  name: string
  required?: boolean
  value?: string
  onChange?: (value: string) => void
  list?: string
  placeholder?: string
}) {
  return (
    <label>
      <span className={labelClass}>
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        name={name}
        required={required}
        value={value}
        list={list}
        placeholder={placeholder}
        autoComplete={list ? 'off' : undefined}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className={fieldClass}
      />
    </label>
  )
}

export function AddMultipleCopiesModal({
  categories,
  locations,
  onCreated,
  onClose,
}: {
  categories: Category[]
  locations?: string[]
  onCreated: (batch: BulkBookResult) => Promise<void> | void
  onClose: () => void
}) {
  const [categoryId, setCategoryId] = useState('')
  const [subjects, setSubjects] = useState<string[]>([])
  const [createdCategories, setCreatedCategories] = useState<Category[]>([])
  const allCategories = useMemo(
    () => [
      ...categories,
      ...createdCategories.filter((made) => !categories.some((known) => known.categoryId === made.categoryId)),
    ],
    [categories, createdCategories],
  )
  const [bookLocation, setBookLocation] = useState('')
  const [shelfColumn, setShelfColumn] = useState(1)
  const [shelfRow, setShelfRow] = useState(1)
  const [copyQuantity, setCopyQuantity] = useState(2)
  const shelfData = useManagedShelves()
  const shownShelves: ManagedShelf[] = shelfData.shelves.length
    ? shelfData.shelves
    : (locations ?? [...new Set(allCategories.map((item) => item.shelfLocation))]).map((label, index) => ({
        id: index + 1,
        label,
        columnCount: 1,
        rowCount: 1,
        defaultCapacity: 200,
        capacityConfigured: true,
        version: 0,
        status: 'Active',
        used: 0,
        capacity: 200,
        remaining: 200,
        compartments: [{ column: 1, row: 1, capacity: 200, used: 0, remaining: 200, status: 'Available' }],
      }))
  const placement = { shelfLocation: bookLocation, shelfColumn, shelfRow }
  const canPlace = placementFits(shownShelves, placement, copyQuantity)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [batch, setBatch] = useState<BulkBookResult | null>(null)
  const [review, setReview] = useState<{ signature: string; data: Record<string, FormDataEntryValue> } | null>(null)
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  const [isbn, setIsbn] = useState('')
  const [dewey, setDewey] = useState<DeweySelection | null>(null)
  const currentIsbn = useRef('')
  currentIsbn.current = normalizeIsbnInput(isbn)
  const existingCatalogIsbn = useRef('')
  const coverSuppressed = useRef('')
  const coverInFlight = useRef('')
  const coverAbort = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const [coverBusy, setCoverBusy] = useState(false)
  const [coverNotice, setCoverNotice] = useState('')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const coverInput = useRef<HTMLInputElement>(null)
  const coverSource = useRef<'none' | 'auto' | 'manual'>('none')
  const coverRequest = useRef(0)
  const [autoCover, setAutoCover] = useState(false)
  const clearCover = () => {
    setReview(null)
    coverRequest.current += 1
    coverAbort.current?.abort()
    coverInFlight.current = ''
    coverSuppressed.current = currentIsbn.current
    setCoverBusy(false)
    setCoverNotice('')
    coverSource.current = 'none'
    setAutoCover(false)
    setCoverFile(null)
    if (coverInput.current) coverInput.current.value = ''
  }
  const attachLookupCover = useCallback(async (isbnForCover: string, force = false) => {
    setReview(null)
    if (existingCatalogIsbn.current === isbnForCover) {
      setCoverNotice('This book already exists. Its library cover is kept when adding copies.')
      return
    }
    if (
      coverSource.current === 'manual' ||
      coverInFlight.current === isbnForCover ||
      (!force && coverSuppressed.current === isbnForCover)
    )
      return
    coverAbort.current?.abort()
    const controller = new AbortController()
    coverAbort.current = controller
    coverInFlight.current = isbnForCover
    const request = ++coverRequest.current
    setCoverBusy(true)
    setCoverNotice('Looking for a cover…')
    let file: File | null = null
    try {
      file = await catalogApi.fetchCover(isbnForCover, controller.signal)
    } catch {
      file = null
    }
    if (
      !mounted.current ||
      request !== coverRequest.current ||
      controller.signal.aborted ||
      currentIsbn.current !== isbnForCover ||
      (coverSource.current as string) === 'manual'
    )
      return
    coverInFlight.current = ''
    setCoverBusy(false)
    if (!file) {
      setCoverNotice('No matching cover was found. Upload a cover or try again.')
      return
    }
    coverSuppressed.current = ''
    coverSource.current = 'auto'
    setAutoCover(true)
    setCoverFile(file)
    setCoverNotice('Cover found for this ISBN. Review it before saving.')
  }, [])

  const [metadata, setMetadata] = useState({ title: '', author: '', publisher: '', publicationYear: '' })
  const [callNumber, setCallNumber] = useState('')
  const selectedCategoryName = useMemo(
    () => allCategories.find((category) => String(category.categoryId) === categoryId)?.categoryName ?? '',
    [allCategories, categoryId],
  )
  const titlePredictions = usePredictions('title', metadata.title)
  const authorPredictions = usePredictions('author', metadata.author)
  const [lookupStatus, setLookupStatus] = useState<{
    state: 'idle' | 'loading' | 'found' | 'error'
    message: string
  }>({ state: 'idle', message: '' })
  const lookupAbort = useRef<AbortController | null>(null)
  const lastLookup = useRef('')
  const liveIsbnError = useMemo(() => isbnInputError(isbn), [isbn])

  const lookupIsbn = useCallback(
    async (value: string, force = false) => {
      const normalized = normalizeIsbnInput(value)
      if (isbnInputError(normalized) || (!force && normalized === lastLookup.current)) return
      lookupAbort.current?.abort()
      const controller = new AbortController()
      lookupAbort.current = controller
      setReview(null)
      setLookupStatus({ state: 'loading', message: 'Checking ISBN…' })
      try {
        const result = await catalogApi.lookupIsbn(normalized, controller.signal)
        if (controller.signal.aborted) return
        if (!result) throw new Error('Book information was not found. Enter the details manually.')
        lastLookup.current = normalized
        existingCatalogIsbn.current = result.source === 'local_catalog' ? normalized : ''
        if (result.source === 'local_catalog') {
          coverRequest.current++
          coverAbort.current?.abort()
          coverInFlight.current = ''
          setCoverBusy(false)
          if (coverSource.current === 'auto') {
            coverSource.current = 'none'
            setAutoCover(false)
            setCoverFile(null)
          }
          setCoverNotice('This book already exists. Its library cover is kept when adding copies.')
        }
        const source =
          result.source === 'local_catalog'
            ? 'local library catalog'
            : result.source === 'google_books'
              ? 'Google Books'
              : 'Open Library'
        setLookupStatus({
          state: 'found',
          message: `Book match found from ${source}. Use Auto-fill missing required information to review missing details.`,
        })
        setSubjects(result.subjects ?? [])
        if (result.source !== 'local_catalog') void attachLookupCover(normalized)
      } catch (reason) {
        if (controller.signal.aborted) return
        lastLookup.current = normalized
        void attachLookupCover(normalized)
        const error = reason as ApiError
        setLookupStatus({
          state: 'error',
          message: error.message || 'Book metadata could not be found. Enter the details manually.',
        })
      }
    },
    [attachLookupCover],
  )

  useEffect(() => {
    if (!isbn || liveIsbnError) {
      lookupAbort.current?.abort()
      setLookupStatus({ state: 'idle', message: '' })
      return
    }
    const timer = window.setTimeout(() => {
      void lookupIsbn(isbn)
    }, 600)
    return () => window.clearTimeout(timer)
  }, [isbn, liveIsbnError, lookupIsbn])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      lookupAbort.current?.abort()
      coverAbort.current?.abort()
      coverRequest.current++
    }
  }, [])

  useEffect(() => {
    setReview(null)
  }, [metadata, callNumber, isbn, categoryId, bookLocation, shelfColumn, shelfRow, copyQuantity, dewey, coverFile])
  useEffect(() => {
    if (review) reviewHeading.current?.focus()
  }, [review])

  const readinessIssues = useMemo(() => {
    const list: string[] = []
    if (!metadata.title.trim()) list.push('Enter a Book Title')
    if (!metadata.author.trim()) list.push('Enter an Author name')
    if (!isbn.trim()) list.push('Enter a 10- or 13-digit ISBN (or click Generate ISBN-13)')
    else if (liveIsbnError) list.push(`Fix ISBN: ${liveIsbnError}`)
    if (!categoryId) list.push('Select a Category')
    if (!bookLocation) list.push('Choose a Book location (shelf)')
    else if (!canPlace) list.push('Choose a shelf compartment with enough remaining space')
    if (dewey?.code && !dewey.reviewed) list.push("Tick 'I reviewed this Dewey number' (or click Leave Dewey unassigned)")
    return list
  }, [metadata.title, metadata.author, isbn, liveIsbnError, categoryId, bookLocation, canPlace, dewey])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || batch) return
    if (coverBusy || lookupStatus.state === 'loading') {
      setMessage('Wait for the book and cover lookup to finish before saving.')
      return
    }
    if (liveIsbnError) {
      setErrors((current) => ({ ...current, isbn: liveIsbnError }))
      setMessage(`Fix the ISBN before continuing: ${liveIsbnError}`)
      return
    }
    if (!canPlace) {
      setMessage('Choose a configured compartment with enough space for every copy.')
      return
    }
    if (dewey?.code && !dewey.reviewed) {
      setMessage('Review the Dewey number or leave it unassigned before continuing.')
      return
    }
    if (!event.currentTarget.reportValidity()) return
    const data = Object.fromEntries(new FormData(event.currentTarget).entries())
    const signature = JSON.stringify({
      data,
      isbn: normalizeIsbnInput(isbn),
      dewey,
      cover: coverFile ? [coverFile.name, coverFile.size, coverFile.lastModified] : null,
    })
    if (!review || review.signature !== signature) {
      setErrors({})
      setMessage('')
      setReview({ signature, data })
      return
    }
    setSaving(true)
    setErrors({})
    setMessage('')
    try {
      const coverImageData = coverFile
        ? await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = () => reject(new Error('The cover could not be read. Choose the image again.'))
            reader.readAsDataURL(coverFile)
          })
        : null
      const resolvedCallNumber = String(data.callNumber || callNumber || '').trim()
      const result = await catalogApi.createBulkBook({
        title: data.title,
        author: data.author,
        isbn: normalizeIsbnInput(isbn),
        dewey,
        number_of_copies: data.numberOfCopies,
        publication_year: data.publicationYear || null,
        publisher: data.publisher,
        call_number: resolvedCallNumber,
        category_id: data.categoryId,
        shelf_location: data.bookLocation,
        locationId: data.locationId,
        shelfColumn: Number(data.shelfColumn),
        shelfRow: Number(data.shelfRow),
        cover_image_data: coverImageData,
        classification: resolvedCallNumber,
        edition: data.edition,
        volumes: data.volumes,
        pages: data.pages,
        remarks: data.remarks,
        fund_source: data.fundSource,
        fund_detail: data.fundDetail,
        cost_php: data.costPhp,
        received_on: data.receivedOn,
      })
      setBatch(result)
      setMessage(
        `Saved to inventory: ${result.numberOfCopies} physical ${result.numberOfCopies === 1 ? 'copy' : 'copies'} with unique QR and barcode labels.`,
      )
      await onCreated(result)
    } catch (reason) {
      const apiError = reason as ApiError
      setErrors(apiError.details?.errors ?? {})
      setMessage(apiError.message || 'The copies could not be created.')
    } finally {
      setSaving(false)
    }
  }

  function selectCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    clearCover()
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setErrors((current) => ({ ...current, cover_image: 'Choose a JPEG, PNG, or WebP image no larger than 2 MB.' }))
      event.target.value = ''
      return
    }
    coverSource.current = 'manual'
    setCoverFile(file)
    setErrors((current) => {
      const next = { ...current }
      delete next.cover_image
      return next
    })
  }

  function changeCategory(value: string) {
    setCategoryId(value)
    const selected = allCategories.find((category) => String(category.categoryId) === value)
    const targetShelfLabel = selected?.shelfLocation ?? ''
    setBookLocation(targetShelfLabel)
    setShelfColumn(selected?.shelfColumn ?? 1)
    setShelfRow(selected?.shelfRow ?? 1)
  }

  function handleGenerateSampleIsbn() {
    const generatedIsbn = generateValidIsbn13()
    setIsbn(generatedIsbn)
    setErrors((current) => {
      const next = { ...current }
      delete next.isbn
      return next
    })
    setMessage('')
  }

  const filledSomething = !batch && Boolean(metadata.title || metadata.author || isbn || coverFile)
  return (
    <UnsavedGuard dirty={filledSomething} resetKey={batch?.titleId}>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-[#132a3f]/75 p-4 backdrop-blur-xs">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="multiple-copies-title"
          className="mx-auto my-4 w-full max-w-5xl rounded-2xl bg-white text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-slate-100"
        >
          <header className="flex items-start justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#0b5ea2] dark:text-sky-300">
                Catalog registration
              </p>
              <h2 id="multiple-copies-title" className="text-xl font-black text-slate-900 dark:text-slate-100">
                Add book
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Complete Section 1 (Required fields *), optionally generate DDC &amp; Cutter in Section 2, then review and save.
              </p>
            </div>
            <button
              aria-label="Close"
              disabled={saving}
              onClick={() => confirmLeave(onClose)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 dark:hover:bg-slate-800"
            >
              <X size={20} />
            </button>
          </header>

          <form
            onSubmit={submit}
            onChangeCapture={() => setReview(null)}
            onInvalidCapture={(event) => {
              const details = (event.target as HTMLElement).closest('details')
              if (details) details.open = true
            }}
            className="space-y-5 p-6"
          >
            {message ? (
              <div
                role={batch ? 'status' : 'alert'}
                className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-sm font-semibold ${
                  batch
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200'
                }`}
              >
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <span>{message}</span>
              </div>
            ) : null}

            {Object.keys(errors).length ? (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
              >
                <ul className="list-inside list-disc space-y-1">
                  {Object.entries(errors).map(([field, error]) => (
                    <li key={field}>
                      <strong>{field}:</strong> {error}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <fieldset disabled={saving || Boolean(batch)} className="space-y-5">
              <PredictionList id="title-predictions" suggestions={titlePredictions} />
              <PredictionList id="author-predictions" suggestions={authorPredictions} />

              {/* SECTION 1: ALL REQUIRED FIELDS AT THE TOP */}
              <div className="rounded-2xl border border-slate-200/90 bg-slate-50/60 p-5 dark:border-slate-700/70 dark:bg-slate-800/30">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3 dark:border-slate-700/60">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      1. Required book &amp; shelf details
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Fill in Title, Author, ISBN, Copies, Category, and Book location. Accession numbers (STI-ACC-2026-...) and QR codes are generated automatically.
                    </p>
                  </div>
                  <span className="rounded-full bg-[#0b5ea2]/10 px-2.5 py-1 text-[11px] font-bold text-[#0b5ea2] dark:bg-sky-500/20 dark:text-sky-300">
                    * Required fields
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Title"
                    name="title"
                    required
                    list="title-predictions"
                    placeholder="e.g. Clean Code"
                    value={metadata.title}
                    onChange={(title) => setMetadata((current) => ({ ...current, title }))}
                  />
                  <Field
                    label="Author"
                    name="author"
                    required
                    list="author-predictions"
                    placeholder="e.g. Robert C. Martin"
                    value={metadata.author}
                    onChange={(author) => setMetadata((current) => ({ ...current, author }))}
                  />

                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <label htmlFor="add-book-isbn-input" className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                        ISBN *
                      </label>
                      <button
                        type="button"
                        onClick={handleGenerateSampleIsbn}
                        className="inline-flex items-center gap-1 rounded-md bg-[#0b5ea2]/10 px-2 py-0.5 text-[11px] font-bold text-[#0b5ea2] transition hover:bg-[#0b5ea2]/20 dark:bg-sky-500/20 dark:text-sky-300"
                      >
                        <Sparkles size={11} /> Generate valid ISBN-13
                      </button>
                    </div>
                    <input
                      id="add-book-isbn-input"
                      name="isbn"
                      required
                      value={isbn}
                      inputMode="text"
                      autoComplete="off"
                      aria-invalid={Boolean(liveIsbnError || errors.isbn)}
                      aria-describedby="isbn-feedback isbn-lookup-feedback"
                      onChange={(event) => {
                        setIsbn(event.target.value)
                        lookupAbort.current?.abort()
                        coverAbort.current?.abort()
                        coverRequest.current++
                        coverInFlight.current = ''
                        setCoverBusy(false)
                        setCoverNotice('')
                        if (coverSource.current === 'auto') clearCover()
                        if (normalizeIsbnInput(event.target.value) !== currentIsbn.current) coverSuppressed.current = ''
                        if (normalizeIsbnInput(event.target.value) !== lastLookup.current) lastLookup.current = ''
                        setErrors((current) => {
                          const next = { ...current }
                          delete next.isbn
                          return next
                        })
                      }}
                      onBlur={() => {
                        const normalized = normalizeIsbnInput(isbn)
                        setIsbn(normalized)
                        if (!isbnInputError(normalized)) void lookupIsbn(normalized, true)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !liveIsbnError) {
                          event.preventDefault()
                          const normalized = normalizeIsbnInput(isbn)
                          setIsbn(normalized)
                          void lookupIsbn(normalized, true)
                        }
                      }}
                      placeholder="10 or 13 digits (e.g. 9780132350884)"
                      className={`${fieldClass} ${
                        liveIsbnError || errors.isbn
                          ? 'border-red-400 focus:border-red-600 focus:ring-red-500/15'
                          : isbn
                            ? 'border-emerald-400'
                            : ''
                      }`}
                    />
                    <span
                      id="isbn-feedback"
                      className={`mt-1.5 block rounded-lg px-2.5 py-1 text-xs font-semibold ${
                        liveIsbnError || errors.isbn
                          ? 'border border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200'
                          : isbn
                            ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                            : 'px-0 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {liveIsbnError ??
                        errors.isbn ??
                        (isbn
                          ? `Valid ${normalizeIsbnInput(isbn).length === 10 ? 'ISBN-10' : 'ISBN-13'} checksum`
                          : 'Enter 10 or 13 digits (hyphens/spaces accepted), or click Generate valid ISBN-13.')}
                    </span>
                    {lookupStatus.message ? (
                      <span
                        id="isbn-lookup-feedback"
                        role={lookupStatus.state === 'error' ? 'alert' : 'status'}
                        className={`mt-1.5 block rounded-lg p-2 text-xs font-semibold ${
                          lookupStatus.state === 'error'
                            ? 'border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                            : 'border border-sky-200 bg-sky-50 text-[#0b5ea2] dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200'
                        }`}
                      >
                        {lookupStatus.message}
                      </span>
                    ) : null}
                  </div>

                  <label>
                    <span className={labelClass}>Number of copies *</span>
                    <input
                      name="numberOfCopies"
                      required
                      type="number"
                      min="1"
                      max="100"
                      value={copyQuantity}
                      onChange={(event) => setCopyQuantity(Number(event.target.value))}
                      className={fieldClass}
                    />
                    <span className="mt-1.5 block text-xs text-slate-500 dark:text-slate-400">
                      Each copy gets its own Accession # (STI-ACC-2026-...) and barcode label.
                    </span>
                  </label>

                  <label className="sm:col-span-2">
                    <span className={labelClass}>Category *</span>
                    <select
                      name="categoryId"
                      required
                      value={categoryId}
                      onChange={(event) => changeCategory(event.target.value)}
                      className={fieldClass}
                    >
                      <option value="">Select category</option>
                      {allCategories.map((category) => (
                        <option key={category.categoryId} value={category.categoryId}>
                          {category.categoryName}
                        </option>
                      ))}
                    </select>
                  </label>

                  <CategorySuggestion
                    subjects={subjects}
                    categories={allCategories}
                    categoryId={categoryId}
                    onSelect={(category, created) => {
                      if (created) setCreatedCategories((current) => [...current, category])
                      setCategoryId(String(category.categoryId))
                      setBookLocation(category.shelfLocation)
                      setShelfColumn(category.shelfColumn ?? 1)
                      setShelfRow(category.shelfRow ?? 1)
                    }}
                  />

                  <ShelfPlacementFields
                    shelves={shownShelves}
                    value={placement}
                    quantity={copyQuantity}
                    disabled={saving || Boolean(batch)}
                    label="Book location"
                    name="bookLocation"
                    error={shelfData.error}
                    onChange={(value) => {
                      setBookLocation(value.shelfLocation)
                      setShelfColumn(value.shelfColumn)
                      setShelfRow(value.shelfRow)
                    }}
                  />

                  <RequiredBookInformation
                    draft={{ title: metadata.title, author: metadata.author, isbn }}
                    requireIsbn
                    disabled={saving || Boolean(batch)}
                    onApply={(patch) => {
                      setMetadata((current) => ({
                        ...current,
                        title: current.title.trim() ? current.title : (patch.title ?? current.title),
                        author: current.author.trim() ? current.author : (patch.author ?? current.author),
                      }))
                      if (patch.isbn) setIsbn((current) => (current.trim() ? current : patch.isbn!))
                    }}
                  />
                </div>
              </div>

              {/* SECTION 2: OPTIONAL DEWEY / DDC + CUTTER & COVER */}
              <div className="grid gap-4 lg:grid-cols-12">
                <div className="lg:col-span-8">
                  <DeweyField
                    isbn={isbn}
                    title={metadata.title}
                    author={metadata.author}
                    categoryName={selectedCategoryName}
                    value={dewey}
                    onChange={setDewey}
                    onGenerateCallNumber={(generated) => setCallNumber(generated.callNumber)}
                    disabled={saving || Boolean(batch)}
                  />
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    The reviewed number applies to every new copy in this entry.
                  </p>
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200/90 bg-slate-50/60 p-4 lg:col-span-4 dark:border-slate-700/70 dark:bg-slate-800/30">
                  <label className="block">
                    <span className={labelClass}>Cover page (optional)</span>
                    <span className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-[#0b5ea2] transition hover:border-[#0b5ea2] dark:border-slate-700 dark:bg-slate-900 dark:text-sky-300">
                      <ImagePlus size={16} />
                      {coverFile ? 'Choose a different cover' : 'Upload cover image'}
                      <input
                        ref={coverInput}
                        disabled={saving || Boolean(batch)}
                        aria-label="Upload cover page"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={selectCover}
                        className="sr-only"
                      />
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={
                      saving ||
                      Boolean(batch) ||
                      coverBusy ||
                      lookupStatus.state === 'loading' ||
                      !normalizeIsbnInput(isbn) ||
                      Boolean(liveIsbnError) ||
                      coverSource.current === 'manual'
                    }
                    onClick={() => void attachLookupCover(normalizeIsbnInput(isbn), true)}
                    className="min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-[#0b5ea2] disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    {coverBusy ? 'Finding cover…' : 'Find cover automatically'}
                  </button>
                  {coverNotice && (
                    <p role="status" className="text-xs text-slate-600 dark:text-slate-300">
                      {coverNotice}
                    </p>
                  )}
                  {coverSource.current === 'manual' && (
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Your uploaded cover is kept. Remove it to find a cover automatically.
                    </p>
                  )}
                  <SelectedFilePreview file={coverFile} onRemove={clearCover} disabled={saving || Boolean(batch)} />
                  {autoCover ? (
                    <p role="status" className="text-xs font-semibold text-[#0b5ea2] dark:text-sky-300">
                      Cover added from the book lookup. Choose a different cover or remove it if it is wrong.
                    </p>
                  ) : null}
                </div>
              </div>

              {/* SECTION 3: MORE BOOK DETAILS & BOOK REGISTER */}
              <details className="rounded-2xl border border-slate-200/90 bg-slate-50/40 p-4 dark:border-slate-700/70 dark:bg-slate-800/20">
                <summary className="min-h-10 cursor-pointer font-bold text-slate-900 dark:text-slate-100">
                  More book details
                </summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Publication year"
                    name="publicationYear"
                    value={metadata.publicationYear}
                    onChange={(publicationYear) => setMetadata((current) => ({ ...current, publicationYear }))}
                  />
                  <Field
                    label="Publisher"
                    name="publisher"
                    value={metadata.publisher}
                    onChange={(publisher) => setMetadata((current) => ({ ...current, publisher }))}
                  />
                  <p className="self-center text-xs text-slate-500 sm:col-span-2 dark:text-slate-400">
                    Supplier quotation optional. You can attach one from the catalog after saving this book.
                  </p>
                  <fieldset className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2 sm:grid-cols-2 dark:border-slate-700 dark:bg-slate-900">
                    <legend className="px-2 text-xs font-black uppercase tracking-wider text-[#0b5ea2] dark:text-sky-300">
                      Book register
                    </legend>
                    <Field
                      label="Call number"
                      name="callNumber"
                      placeholder="DDC + Cutter Table (e.g. 005.133 M378)"
                      value={callNumber}
                      onChange={setCallNumber}
                    />
                    <Field label="Edition" name="edition" placeholder="e.g. 1st edition" />
                    <Field label="Volumes" name="volumes" placeholder="e.g. Vol. 1" />
                    <label>
                      <span className={labelClass}>Pages</span>
                      <input name="pages" type="number" min="1" max="100000" className={fieldClass} />
                    </label>
                    <label>
                      <span className={labelClass}>Source of fund</span>
                      <select name="fundSource" defaultValue="" className={fieldClass}>
                        <option value="">Not recorded</option>
                        {FUND_SOURCES.map((source) => (
                          <option key={source}>{source}</option>
                        ))}
                      </select>
                    </label>
                    <Field label="Fund details" name="fundDetail" />
                    <label>
                      <span className={labelClass}>Cost price (PHP, each copy)</span>
                      <input
                        name="costPhp"
                        type="number"
                        min="0"
                        max="999999.99"
                        step="0.01"
                        inputMode="decimal"
                        className={fieldClass}
                      />
                    </label>
                    <label>
                      <span className={labelClass}>Date received</span>
                      <input name="receivedOn" type="date" className={fieldClass} />
                    </label>
                    <label className="sm:col-span-2">
                      <span className={labelClass}>Remarks</span>
                      <textarea
                        name="remarks"
                        maxLength={2000}
                        rows={2}
                        className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 outline-none focus:border-[#0b5ea2] focus:ring-4 focus:ring-[#0b5ea2]/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </label>
                    <p className="text-xs text-slate-500 sm:col-span-2 dark:text-slate-400">
                      Call number, edition, volumes, pages and remarks are saved when this entry creates a new title. Fund, cost and date received are saved on every copy.
                    </p>
                  </fieldset>
                </div>
              </details>

              {review && !batch ? (
                <section
                  aria-labelledby="book-review-title"
                  className="space-y-3 rounded-2xl border border-[#0b5ea2]/30 bg-[#0b5ea2]/5 p-5 dark:border-sky-500/30 dark:bg-sky-950/30"
                >
                  <h3 id="book-review-title" ref={reviewHeading} tabIndex={-1} className="font-bold text-[#0b5ea2] outline-none dark:text-sky-300">
                    Review book and copies
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Check this entry before adding it. Changes to the draft or lookup results require another review. Existing catalog details are preserved when the ISBN already belongs to a book.
                  </p>
                  <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      ['Title', review.data.title],
                      ['Author', review.data.author],
                      ['ISBN', normalizeIsbnInput(isbn)],
                      ['Copies', copyQuantity],
                      ['Category', allCategories.find((item) => String(item.categoryId) === categoryId)?.categoryName],
                      ['Shelf placement', `${bookLocation}, Column ${shelfColumn}, Row ${shelfRow}`],
                      [
                        'Dewey',
                        dewey?.code
                          ? `${dewey.code}  -  ${dewey.source === 'manual' ? 'Entered manually' : 'Open Library'}  -  Reviewed`
                          : 'Unassigned',
                      ],
                      ['Cover', coverFile?.name ?? 'No new cover selected'],
                      ['Publication year', review.data.publicationYear],
                      ['Publisher', review.data.publisher],
                      ['Call number', review.data.callNumber || callNumber],
                      ['Edition', review.data.edition],
                      ['Volumes', review.data.volumes],
                      ['Pages', review.data.pages],
                      ['Source of fund', review.data.fundSource],
                      ['Fund details', review.data.fundDetail],
                      ['Cost per copy (PHP)', review.data.costPhp],
                      ['Date received', review.data.receivedOn],
                      ['Remarks', review.data.remarks],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-lg bg-white/80 p-2.5 dark:bg-slate-900/60">
                        <dt className="font-bold text-slate-500 dark:text-slate-400">{String(label)}</dt>
                        <dd className="mt-0.5 break-words font-semibold text-slate-900 dark:text-slate-100">
                          {String(value || 'Not recorded')}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setReview(null)}
                    className="min-h-10 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 hover:border-[#0b5ea2] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    Keep editing
                  </button>
                </section>
              ) : null}

              {!allCategories.length ? (
                <p role="alert" className="text-sm font-semibold text-red-700">
                  Create a category and book location before adding physical copies.
                </p>
              ) : null}
            </fieldset>

            {/* FOOTER WITH LIVE READINESS GUIDANCE */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
              {!batch ? (
                <div className="text-xs">
                  {readinessIssues.length > 0 ? (
                    <p className="font-semibold text-amber-800 dark:text-amber-300">
                      To continue: {readinessIssues[0]}
                      {readinessIssues.length > 1 ? ` (+${readinessIssues.length - 1} more)` : ''}
                    </p>
                  ) : (
                    <p className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 size={15} /> All required details ready
                    </p>
                  )}
                </div>
              ) : <div />}

              <div className="flex flex-wrap items-center justify-end gap-2">
                {!batch ? (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => confirmLeave(onClose)}
                      className="h-11 rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={
                        saving ||
                        coverBusy ||
                        lookupStatus.state === 'loading' ||
                        !allCategories.length ||
                        Boolean(liveIsbnError) ||
                        !canPlace ||
                        Boolean(dewey?.code && !dewey.reviewed)
                      }
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#0b5ea2] px-5 text-sm font-bold text-white shadow-xs transition hover:bg-[#094d85] disabled:opacity-50"
                    >
                      <QrCode size={17} />
                      {saving
                        ? 'Saving copy and generating codes…'
                        : review
                          ? `Add book and ${copyQuantity} ${copyQuantity === 1 ? 'copy' : 'copies'}`
                          : 'Review book and copies'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-11 rounded-xl bg-[#0b5ea2] px-5 text-sm font-bold text-white"
                  >
                    Close and view inventory
                  </button>
                )}
              </div>
            </div>
          </form>
          {batch ? (
            <div className="border-t border-slate-200 p-5 dark:border-slate-700">
              <BookLabelSheet batch={batch} />
            </div>
          ) : null}
        </div>
      </div>
    </UnsavedGuard>
  )
}
