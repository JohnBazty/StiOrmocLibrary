import { MoveCopiesDialog, type MovableCopy } from '../shelves/MoveCopiesDialog'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import {
  AlertTriangle, Barcode, BookCopy, CheckCircle2, ChevronDown, Download, PackageSearch,
  FileText, GraduationCap, RefreshCw, Search, ShieldAlert, X, XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { PageHeader, SectionCard, StatCard, cn } from '../../components/ui'
import { AssetCodeModal } from '../catalog/AssetCodeModal'
import { catalogApi } from '../catalog/catalog-api'
import { inventoryApi, InventoryApiError } from './inventory-api'
import type { InventoryCopy, InventoryFilters, InventoryPagination, InventoryRemovalTarget, InventorySummary, ThesisInventoryFilters, ThesisInventoryRow, ThesisInventorySummary } from './types'
import { InventoryRemovalDialog } from './InventoryRemovalDialog'
import { useConfirmSave } from '../../components/ConfirmSaveDialog'

async function downloadBulkBarcodeSheet(
  entries: Array<{ id: number; title: string; accession: string; barcode: string; callNumber?: string | null; assetType: 'book' | 'research' }>,
) {
  if (!entries.length) throw new Error('No copies available for bulk barcode download.')
  const loaded: Array<{ entry: (typeof entries)[number]; img: HTMLImageElement }> = []
  for (let start = 0; start < entries.length; start += 6) {
    const chunk = entries.slice(start, start + 6)
    const assets = await Promise.all(
      chunk.map((entry) =>
        entry.assetType === 'research' ? catalogApi.researchAsset(entry.id) : catalogApi.asset(entry.id),
      ),
    )
    for (let i = 0; i < chunk.length; i++) {
      const asset = assets[i]
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error(`Unable to decode barcode for ${chunk[i].accession}.`))
        img.src = asset.barcodeImageData
      })
      loaded.push({ entry: chunk[i], img })
    }
  }

  const cols = loaded.length === 1 ? 1 : 2
  const rows = Math.ceil(loaded.length / cols)
  const cardW = 480
  const cardH = 220
  const gap = 24
  const pad = 32
  const width = pad * 2 + cols * cardW + (cols - 1) * gap
  const height = pad * 2 + rows * cardH + (rows - 1) * gap
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas rendering is unavailable.')
  ctx.scale(scale, scale)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)

  loaded.forEach(({ entry, img }, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const x = pad + col * (cardW + gap)
    const y = pad + row * (cardH + gap)

    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 1.5
    ctx.strokeRect(x, y, cardW, cardH)

    ctx.fillStyle = '#132a3f'
    ctx.font = '700 12px Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('STI COLLEGE ORMOC LIBRARY', x + cardW / 2, y + 20)

    const shortTitle = entry.title.length > 48 ? `${entry.title.slice(0, 45)}…` : entry.title
    ctx.fillStyle = '#334155'
    ctx.font = '600 11px Arial, sans-serif'
    ctx.fillText(shortTitle, x + cardW / 2, y + 38)

    const maxW = cardW - 48
    const maxH = 112
    const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight)
    const drawW = img.naturalWidth * ratio
    const drawH = img.naturalHeight * ratio
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, x + (cardW - drawW) / 2, y + 52 + (maxH - drawH) / 2, drawW, drawH)

    ctx.fillStyle = '#0b5ea2'
    ctx.font = '700 13px monospace'
    ctx.fillText(entry.barcode, x + cardW / 2, y + 180)

    const meta = [entry.accession, entry.callNumber].filter(Boolean).join('  ·  ')
    ctx.fillStyle = '#475569'
    ctx.font = '600 11px monospace'
    ctx.fillText(meta, x + cardW / 2, y + 200)
  })

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Could not generate bulk barcode sheet.'))), 'image/png'),
  )
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
  link.download = `sti-library-barcodes-${loaded.length}-copies-${stamp}.png`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

const EMPTY_SUMMARY: InventorySummary = { total_catalog_materials: 0, total_physical_copies: 0, damaged_copies_count: 0, lost_copies_count: 0 }
const DEFAULT_FILTERS: InventoryFilters = { page: 1, limit: 25, query: '', conditionState: '', availabilityStatus: '' }
const EMPTY_PAGINATION: InventoryPagination = { page: 1, limit: 25, total: 0, total_pages: 0 }
const EMPTY_THESIS_SUMMARY: ThesisInventorySummary = { total_thesis_materials: 0, damaged_thesis_count: 0, lost_thesis_count: 0 }
const DEFAULT_THESIS_FILTERS: ThesisInventoryFilters = { page: 1, limit: 25, query: '', conditionState: '', availabilityStatus: '', publicationYear: '' }
type ConditionInput = 'good' | 'fair' | 'for_repair' | 'damaged' | 'lost'
type AuditableItem = {
  item_title: string
  accession_number: string
  barcode: string
  availability_status: string
  condition_status?: string
  condition_state?: string
}

type InventoryAction = {
  label: string
  onSelect: () => void
  disabled?: boolean
  description?: string
  destructive?: boolean
}

function InventoryActions({ accession, actions }: { accession: string; actions: InventoryAction[] }) {
  const dropdown = useRef<HTMLDetailsElement>(null)
  const trigger = useRef<HTMLElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  function close(restoreFocus = false) {
    if (dropdown.current) dropdown.current.open = false
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }
  function toggle(event: MouseEvent) {
    event.preventDefault()
    const next = !open
    if (next) window.dispatchEvent(new CustomEvent('inventory-actions-open', { detail: dropdown.current }))
    if (dropdown.current) dropdown.current.open = next
    setOpen(next)
  }
  useEffect(() => {
    function closeForAnother(event: Event) {
      if ((event as CustomEvent<HTMLDetailsElement>).detail !== dropdown.current) close()
    }
    window.addEventListener('inventory-actions-open', closeForAnother)
    return () => window.removeEventListener('inventory-actions-open', closeForAnother)
  }, [])
  function place() {
    const rect = trigger.current?.getBoundingClientRect()
    if (!rect) return
    const width = 176
    const height = menu.current?.offsetHeight ?? 0
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8)
    const below = rect.bottom + 4
    const top = height > 0 && below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 4) : below
    setPosition({ top, left })
  }
  useLayoutEffect(() => { if (open) place() }, [open, actions.length])
  useEffect(() => {
    if (!open) return
    function dismiss(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node) || dropdown.current?.contains(target) || menu.current?.contains(target)) return
      close()
    }
    document.addEventListener('pointerdown', dismiss)
    window.addEventListener('resize', place)
    document.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('resize', place)
      document.removeEventListener('scroll', place, true)
    }
  }, [open])

  return <>
    <details ref={dropdown} className="group w-44 max-w-full" onKeyDown={event => {
      if (event.key === 'Escape' && open) { event.stopPropagation(); close(true) }
    }}>
      <summary ref={trigger} aria-label={`Actions for ${accession}`} onClick={toggle} className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-[#0b5ea2]/20 px-3 py-2 text-sm font-semibold text-[#0b5ea2] hover:bg-[#0b5ea2]/5 dark:border-white/20 dark:text-white dark:hover:bg-white/10 [&::-webkit-details-marker]:hidden">
        Actions <ChevronDown size={16} aria-hidden="true" className="shrink-0 group-open:rotate-180" />
      </summary>
    </details>
    {open ? createPortal(<div ref={menu} role="group" aria-label={`Actions for ${accession}`} style={{ top: position.top, left: position.left }} className="fixed z-40 w-44 space-y-1 rounded-lg border border-[#0b5ea2]/15 bg-white p-1 shadow-lg dark:border-white/15 dark:bg-[#001a4d]">
      {actions.map(action => <button key={action.label} type="button" disabled={action.disabled} title={action.description}
        aria-label={action.destructive ? `Delete ${accession}` : undefined}
        onClick={() => { close(true); action.onSelect() }}
        className="block min-h-11 w-full rounded-md px-2 py-2 text-left text-sm text-[#0b5ea2] hover:bg-[#0b5ea2]/5 disabled:cursor-not-allowed disabled:opacity-45 dark:text-white dark:hover:bg-white/10">
        {action.label}
        {action.disabled && action.destructive && action.description && <span className="mt-1 block text-xs">{action.description}</span>}
      </button>)}
    </div>, document.body) : null}
  </>
}

function ConditionBadge({ condition }: { condition: string }) {
  if (condition === 'Lost') return <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0b5ea2] px-2.5 py-1 text-[11px] font-bold text-[#FFFFFF]"><XCircle size={13} /> Lost</span>
  if (condition === 'Damaged' || condition === 'For Repair') return <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF200] px-2.5 py-1 text-[11px] font-bold text-[#0b5ea2] ring-1 ring-inset ring-[#0b5ea2]/20"><AlertTriangle size={13} /> {condition}</span>
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFFFFF] px-2.5 py-1 text-[11px] font-bold text-[#0b5ea2] ring-1 ring-inset ring-[#0b5ea2]/25"><CheckCircle2 size={13} /> {condition}</span>
}

function AvailabilityBadge({ status }: { status: string }) {
  const unavailable = status === 'Unavailable' || status === 'Archived'
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset', unavailable ? 'bg-[#0b5ea2] text-[#FFFFFF] ring-[#0b5ea2]' : status === 'Reserved' ? 'bg-[#FFF200] text-[#0b5ea2] ring-[#0b5ea2]/20' : 'bg-[#FFFFFF] text-[#0b5ea2] ring-[#0b5ea2]/25')}>{unavailable ? <ShieldAlert size={13} /> : <CheckCircle2 size={13} />}{status}</span>
}

function formatDate(value: string | null) {
  if (!value) return 'Never verified'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila', hour12: true }).format(date)
}

function displayThesisCondition(value: string) {
  return value === 'for_repair' ? 'For Repair' : value.charAt(0).toUpperCase() + value.slice(1)
}

function displayThesisAvailability(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function ConditionModal({ copy, onClose, onSaved, saveCondition, initialCondition = 'good' }: { copy: AuditableItem; onClose: () => void; onSaved: () => Promise<void>; saveCondition: (barcode: string, condition: ConditionInput) => Promise<unknown>; initialCondition?: ConditionInput }) {
  const [condition, setCondition] = useState<ConditionInput>(initialCondition)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { ask, dialog: confirmSave } = useConfirmSave()
  const persist = async () => {
    setSaving(true); setError(null)
    try { await saveCondition(copy.barcode, condition); await onSaved(); onClose() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update this physical copy.') }
    finally { setSaving(false) }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    ask(`Set the condition of ${copy.accession_number} to ${condition.replace('_', ' ')}.`, () => { void persist() })
  }
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0b5ea2]/55 p-4" role="dialog" aria-modal="true" aria-labelledby="condition-title">
    <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-[#FFFFFF] shadow-2xl shadow-[#0b5ea2]/25">
      <div className="flex items-start justify-between border-b border-[#0b5ea2]/15 p-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0b5ea2]/60">Condition audit</p><h2 id="condition-title" className="mt-1 text-xl font-bold text-[#0b5ea2]">Update physical condition</h2></div><button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-[#0b5ea2]/60 hover:bg-[#0b5ea2]/5"><X size={18} /></button></div>
      <div className="space-y-4 p-5">
        <div className="rounded-xl bg-[#0b5ea2]/5 p-4 text-sm text-[#0b5ea2]"><p className="font-bold">{copy.item_title}</p><p className="mt-1 text-xs text-[#0b5ea2]/65">Accession {copy.accession_number} · Barcode {copy.barcode}</p><p className="mt-2 text-xs">Current: <strong>{copy.condition_status ?? copy.condition_state}</strong> · {copy.availability_status}</p></div>

    {error ? <div className="rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#0b5ea2]" role="alert">{error}</div> : null}
        <fieldset><legend className="mb-2 text-sm font-bold text-[#0b5ea2]">New condition</legend><div className="grid grid-cols-2 gap-3">{(['good', 'fair', 'for_repair', 'damaged', 'lost'] as const).map((value) => <label key={value} className={cn('cursor-pointer rounded-xl border p-4 text-sm font-bold transition', condition === value ? 'border-[#0b5ea2] bg-[#FFF200] text-[#0b5ea2]' : 'border-[#0b5ea2]/15 bg-[#FFFFFF] text-[#0b5ea2]')}><input className="sr-only" type="radio" name="condition" value={value} checked={condition === value} onChange={() => setCondition(value)} />{value === 'lost' ? <XCircle className="mb-2" size={20} /> : value === 'damaged' || value === 'for_repair' ? <AlertTriangle className="mb-2" size={20} /> : <CheckCircle2 className="mb-2" size={20} />}<span className="capitalize">{value.replace('_', ' ')}</span></label>)}</div></fieldset>
        <div className="flex gap-3 rounded-xl border border-[#0b5ea2]/20 bg-[#FFF200]/40 p-3 text-xs leading-5 text-[#0b5ea2]"><ShieldAlert className="mt-0.5 shrink-0" size={17} /><p>{condition === 'lost' ? <>Lost is the only automatic exception: availability will be forced to <strong>Unavailable</strong> and this copy will leave reservation allocation.</> : <>Availability remains <strong>{copy.availability_status}</strong>. Use the separate availability control to change it manually.</>}</p></div>
      </div>
      <div className="flex justify-end gap-2 border-t border-[#0b5ea2]/15 p-5"><button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border border-[#0b5ea2]/20 px-4 text-sm font-bold text-[#0b5ea2] disabled:opacity-50">Cancel</button><button disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0b5ea2] px-4 text-sm font-bold text-[#FFFFFF] disabled:opacity-50">{saving ? <RefreshCw className="animate-spin" size={15} /> : <ShieldAlert size={15} />}{saving ? 'Updating…' : 'Confirm override'}</button></div>
    </form>
    {confirmSave}
  </div>
}

function AvailabilityConfirmationDialog({
  copy, saving, error, onCancel, onConfirm,
}: {
  copy: AuditableItem
  saving: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const confirmButton = useRef<HTMLButtonElement>(null)
  const nextStatus = copy.availability_status.toLowerCase() === 'available' ? 'Unavailable' : 'Available'
  const becomingUnavailable = nextStatus === 'Unavailable'

  useEffect(() => {
    confirmButton.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onCancel()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onCancel, saving])

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0b5ea2]/60 p-4" role="presentation">
    <section className="w-full max-w-md overflow-hidden rounded-2xl border border-[#0b5ea2]/20 bg-[#FFFFFF] shadow-2xl shadow-[#0b5ea2]/30" role="alertdialog" aria-modal="true" aria-labelledby="availability-dialog-title" aria-describedby="availability-dialog-description">
      <div className="flex items-start gap-4 border-b border-[#0b5ea2]/15 p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF200] text-[#0b5ea2]"><ShieldAlert size={22} /></span>
        <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0b5ea2]/60">Availability control</p><h2 id="availability-dialog-title" className="mt-1 text-xl font-black text-[#0b5ea2]">Make copy {nextStatus.toLowerCase()}?</h2></div>
        <button type="button" onClick={onCancel} disabled={saving} aria-label="Close confirmation" className="rounded-lg p-2 text-[#0b5ea2]/60 hover:bg-[#0b5ea2]/5 disabled:opacity-40"><X size={18} /></button>
      </div>
      <div className="space-y-4 p-5">
        <div className="rounded-xl bg-[#0b5ea2]/5 p-4 text-[#0b5ea2]"><p className="font-bold">{copy.item_title}</p><p className="mt-1 text-xs text-[#0b5ea2]/65">Accession {copy.accession_number} · Barcode {copy.barcode}</p><p className="mt-2 text-xs">Current availability: <strong>{copy.availability_status}</strong></p></div>
        <div id="availability-dialog-description" className="flex gap-3 rounded-xl border border-[#0b5ea2]/20 bg-[#FFF200]/45 p-4 text-sm leading-6 text-[#0b5ea2]">
          {becomingUnavailable ? <ShieldAlert className="mt-0.5 shrink-0" size={19} /> : <CheckCircle2 className="mt-0.5 shrink-0" size={19} />}
          <p>{becomingUnavailable ? <>Students cannot borrow this copy. They can still reserve the title and wait. This copy is not set aside for anyone until you make it available again.</> : <>Students can borrow this copy again. It can also be set aside for someone on the waiting list.</>}</p>
        </div>
        {error ? <div className="rounded-xl bg-[#FFF200] p-3 text-sm font-semibold text-[#0b5ea2]" role="alert">{error}</div> : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-[#0b5ea2]/15 p-5">
        <button type="button" onClick={onCancel} disabled={saving} className="h-10 rounded-xl border border-[#0b5ea2]/20 bg-[#FFFFFF] px-4 text-sm font-bold text-[#0b5ea2] disabled:opacity-40">Cancel</button>
        <button ref={confirmButton} type="button" onClick={onConfirm} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0b5ea2] px-4 text-sm font-bold text-[#FFFFFF] disabled:opacity-50">{saving ? <RefreshCw className="animate-spin" size={15} /> : becomingUnavailable ? <ShieldAlert size={15} /> : <CheckCircle2 size={15} />}{saving ? 'Updating…' : `Confirm ${nextStatus.toLowerCase()}`}</button>
      </div>
    </section>
  </div>
}

const BOOK_CONDITION_QUERY_VALUES = new Set(['Good', 'Fair', 'For Repair', 'Damaged', 'Lost'])
const THESIS_CONDITION_QUERY_VALUES = new Set(['good', 'fair', 'for_repair', 'damaged', 'lost'])

function initialConditionParam(valid: Set<string>) {
  const value = new URLSearchParams(window.location.search).get('condition') ?? ''
  return valid.has(value) ? value : ''
}

export function InventoryDashboard() {
  const [resource, setResource] = useState<'books' | 'research'>(() => new URLSearchParams(window.location.search).get('resource') === 'research' ? 'research' : 'books')
  const [summary, setSummary] = useState(EMPTY_SUMMARY)
  const [thesisSummary, setThesisSummary] = useState(EMPTY_THESIS_SUMMARY)
  const [copies, setCopies] = useState<InventoryCopy[]>([])
  const [thesisRows, setThesisRows] = useState<ThesisInventoryRow[]>([])
  const [pagination, setPagination] = useState(EMPTY_PAGINATION)
  const [thesisPagination, setThesisPagination] = useState(EMPTY_PAGINATION)
  const [filters, setFilters] = useState(() => ({...DEFAULT_FILTERS,query:new URLSearchParams(window.location.search).get('q')??'',conditionState:initialConditionParam(BOOK_CONDITION_QUERY_VALUES)}))
  const [thesisDraftFilters, setThesisDraftFilters] = useState(() => ({...DEFAULT_THESIS_FILTERS,query:new URLSearchParams(window.location.search).get('q')??'',conditionState:initialConditionParam(THESIS_CONDITION_QUERY_VALUES)}))
  const [thesisFilters, setThesisFilters] = useState(() => ({...DEFAULT_THESIS_FILTERS,query:new URLSearchParams(window.location.search).get('q')??'',conditionState:initialConditionParam(THESIS_CONDITION_QUERY_VALUES)}))
  const [loading, setLoading] = useState(true)
  const [thesisLoading, setThesisLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [moving, setMoving] = useState<{kind:'Book'|'Research/Thesis';copies:MovableCopy[]} | null>(null)
  const [selected, setSelected] = useState<InventoryCopy | null>(null)
  const [lostTarget, setLostTarget] = useState<InventoryCopy | null>(null)
  const [availabilityTarget, setAvailabilityTarget] = useState<InventoryCopy | null>(null)
  const [selectedThesis, setSelectedThesis] = useState<ThesisInventoryRow | null>(null)
  const [thesisAvailabilityTarget, setThesisAvailabilityTarget] = useState<ThesisInventoryRow | null>(null)
  const [availabilitySaving, setAvailabilitySaving] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const [thesisExportingPdf, setThesisExportingPdf] = useState(false)
  const [removalTarget, setRemovalTarget] = useState<InventoryRemovalTarget | null>(null)
  const [selectedCopyIds, setSelectedCopyIds] = useState<Set<number>>(() => new Set())
  const [selectedThesisIds, setSelectedThesisIds] = useState<Set<number>>(() => new Set())
  const [downloadingBarcodeId, setDownloadingBarcodeId] = useState<string | null>(null)
  const [bulkBarcodeBusy, setBulkBarcodeBusy] = useState(false)
  const [assetModalTarget, setAssetModalTarget] = useState<{ kind: 'book' | 'research'; id: number } | null>(null)

  const toggleCopySelection = (id: number) => {
    setSelectedCopyIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const allCopiesSelected = copies.length > 0 && copies.every((copy) => selectedCopyIds.has(copy.physical_copy_id))
  const toggleAllCopies = () => {
    if (allCopiesSelected) setSelectedCopyIds(new Set())
    else setSelectedCopyIds(new Set(copies.map((copy) => copy.physical_copy_id)))
  }

  const toggleThesisSelection = (id: number) => {
    setSelectedThesisIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const allThesisSelected = thesisRows.length > 0 && thesisRows.every((row) => selectedThesisIds.has(row.research_inventory_id))
  const toggleAllThesis = () => {
    if (allThesisSelected) setSelectedThesisIds(new Set())
    else setSelectedThesisIds(new Set(thesisRows.map((row) => row.research_inventory_id)))
  }

  const downloadSingleBarcode = async (id: number, accession: string, kind: 'book' | 'research' = 'book') => {
    const key = `${kind}-${id}`
    if (downloadingBarcodeId) return
    setDownloadingBarcodeId(key); setError(null)
    try {
      await catalogApi.downloadAssetPng(id, 'barcode', kind)
      setNotice(`Barcode PNG downloaded for ${accession}.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to download the barcode PNG.')
    } finally {
      setDownloadingBarcodeId(null)
    }
  }

  const downloadBulkBarcodes = async (kind: 'book' | 'research') => {
    if (bulkBarcodeBusy) return
    setBulkBarcodeBusy(true); setError(null)
    try {
      const entries =
        kind === 'book'
          ? (selectedCopyIds.size > 0 ? copies.filter((c) => selectedCopyIds.has(c.physical_copy_id)) : copies).map((c) => ({
              id: c.physical_copy_id,
              title: c.item_title,
              accession: c.accession_number,
              barcode: c.barcode,
              callNumber: c.call_number,
              assetType: 'book' as const,
            }))
          : (selectedThesisIds.size > 0 ? thesisRows.filter((t) => selectedThesisIds.has(t.research_inventory_id)) : thesisRows).map((t) => ({
              id: t.research_inventory_id,
              title: t.title,
              accession: t.accession_number,
              barcode: t.barcode,
              callNumber: t.shelf_location,
              assetType: 'research' as const,
            }))
      await downloadBulkBarcodeSheet(entries)
      setNotice(`Downloaded bulk barcode sheet for ${entries.length} ${entries.length === 1 ? 'copy' : 'copies'}.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to generate the bulk barcode sheet.')
    } finally {
      setBulkBarcodeBusy(false)
    }
  }

  const load = useCallback(async (nextFilters: InventoryFilters) => {
    setLoading(true); setError(null)
    try {
      const [nextSummary, register] = await Promise.all([
        inventoryApi.summary(), inventoryApi.copies(nextFilters),
      ])
      setSummary(nextSummary); setCopies(register.items); setPagination(register.pagination)
    } catch (reason) { setError(reason instanceof InventoryApiError ? reason.message : 'Unable to load the inventory register.') }
    finally { setLoading(false) }
  }, [])

  const loadThesis = useCallback(async (nextFilters: ThesisInventoryFilters) => {
    setThesisLoading(true); setError(null)
    try {
      const [nextSummary, register] = await Promise.all([
        inventoryApi.thesisSummary(), inventoryApi.thesisRows(nextFilters),
      ])
      setThesisSummary(nextSummary); setThesisRows(register.items); setThesisPagination(register.pagination)
    } catch (reason) { setError(reason instanceof InventoryApiError ? reason.message : 'Unable to load the research and thesis inventory.') }
    finally { setThesisLoading(false) }
  }, [])

  useEffect(() => { const timer = window.setTimeout(() => { void load(filters) }, 250); return () => window.clearTimeout(timer) }, [filters, load])
  useEffect(() => { void loadThesis(thesisFilters) }, [loadThesis, thesisFilters])

  const downloadPdf = async () => {
    setExportingPdf(true); setError(null)
    try { await inventoryApi.download('pdf'); setNotice('PDF inventory report downloaded.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to download the inventory report.') }
    finally { setExportingPdf(false) }
  }

  const downloadThesisPdf = async () => {
    setThesisExportingPdf(true); setError(null)
    try { await inventoryApi.downloadThesis('pdf'); setNotice('Thesis PDF report downloaded.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to download the thesis report.') }
    finally { setThesisExportingPdf(false) }
  }

  const requestAvailabilityChange = (copy: InventoryCopy) => {
    setAvailabilityError(null)
    setAvailabilityTarget(copy)
  }

  const confirmAvailabilityChange = async () => {
    if (!availabilityTarget) return
    const next = availabilityTarget.availability_status === 'Available' ? 'unavailable' : 'available'
    setAvailabilitySaving(true); setAvailabilityError(null); setError(null); setNotice(null)
    try {
      const updated = await inventoryApi.changeAvailability(availabilityTarget.barcode, next)
      setNotice(`${availabilityTarget.accession_number} is now ${updated.availability_status}.`)
      setAvailabilityTarget(null)
      await load(filters)
    } catch (reason) { setAvailabilityError(reason instanceof Error ? reason.message : 'Unable to update availability.') }
    finally { setAvailabilitySaving(false) }
  }

  const requestThesisAvailabilityChange = (copy: ThesisInventoryRow) => {
    setAvailabilityError(null)
    setThesisAvailabilityTarget(copy)
  }

  const confirmThesisAvailabilityChange = async () => {
    if (!thesisAvailabilityTarget) return
    const next = thesisAvailabilityTarget.availability_status === 'available' ? 'unavailable' : 'available'
    setAvailabilitySaving(true); setAvailabilityError(null); setError(null); setNotice(null)
    try {
      const updated = await inventoryApi.changeThesisAvailability(thesisAvailabilityTarget.barcode, next)
      setNotice(`${thesisAvailabilityTarget.accession_number} is now ${updated.availability_status}.`)
      setThesisAvailabilityTarget(null)
      await loadThesis(thesisFilters)
    } catch (reason) { setAvailabilityError(reason instanceof Error ? reason.message : 'Unable to update thesis availability.') }
    finally { setAvailabilitySaving(false) }
  }

  const completeRemoval = async (action: 'deleted' | 'archived') => {
    const target = removalTarget
    if (!target) return
    setRemovalTarget(null)
    setNotice(`${target.accession_number} ${action} successfully.`)
    if (target.kind === 'book') {
      const nextFilters = copies.length === 1 && pagination.page > 1
        ? { ...filters, page: pagination.page - 1 }
        : filters
      if (nextFilters.page !== filters.page) setFilters(nextFilters)
      else await load(nextFilters)
      return
    }
    const nextFilters = thesisRows.length === 1 && thesisPagination.page > 1
      ? { ...thesisFilters, page: thesisPagination.page - 1 }
      : thesisFilters
    if (nextFilters.page !== thesisFilters.page) setThesisFilters(nextFilters)
    else await loadThesis(nextFilters)
  }

  return <div className="flex flex-col">
    <a href="/librarian/inventory/stocktake" className="mb-3 inline-flex min-h-11 w-fit items-center rounded-lg bg-[#0b5ea2] px-4 py-2 font-semibold text-white">Start inventory now</a>
    <PageHeader eyebrow="Collection control" title="Inventory management" description="Verify accessioned copies, track physical condition, and protect unavailable assets from reservation workflows." action={resource === 'books' ? <button disabled={exportingPdf} onClick={() => void downloadPdf()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#FFF200] px-4 text-sm font-bold text-[#0b5ea2] disabled:opacity-50"><Download size={15} />{exportingPdf ? 'Preparing PDF…' : 'Export book inventory PDF'}</button> : <button disabled={thesisExportingPdf} onClick={() => void downloadThesisPdf()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold"><Download size={15} />{thesisExportingPdf ? 'Preparing PDF…' : 'Export research inventory PDF'}</button>} />
        <nav aria-label="Inventory resources" className="mb-5 flex flex-wrap gap-2">
      {([['books', 'Books'], ['research', 'Research & thesis']] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={resource === key} onClick={() => setResource(key)} className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold ${resource === key ? 'bg-[#0b5ea2] text-white' : 'bg-white text-[#0b5ea2]'}`}>{label}</button>)}
    </nav>
    {error ? <div className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-[#FFF200] p-4 text-sm font-semibold text-[#0b5ea2]" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError(null)}><X size={17} /></button></div> : null}
    {notice ? <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-[#0b5ea2]/20 bg-[#FFFFFF] p-4 text-sm font-semibold text-[#0b5ea2]" role="status"><span className="flex items-center gap-2"><CheckCircle2 size={17} />{notice}</span><button aria-label="Dismiss notice" onClick={() => setNotice(null)}><X size={17} /></button></div> : null}
    <div hidden={resource !== 'books'}>
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Catalog materials" value={summary.total_catalog_materials} note="Active title records" icon={PackageSearch} tone="blue" /><StatCard label="Physical copies" value={summary.total_physical_copies} note="Active accession rows" icon={BookCopy} tone="blue" /><StatCard label="Damaged copies" value={summary.damaged_copies_count} note="Audited condition records" icon={AlertTriangle} tone="amber" /><StatCard label="Lost copies" value={summary.lost_copies_count} note="Forced unavailable" icon={XCircle} tone="red" /></div>
    </div>
    <section hidden={resource !== 'research'} aria-labelledby="thesis-inventory-title" className="mb-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <SectionCard className="p-5"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0b5ea2] text-[#FFFFFF]"><GraduationCap size={21} /></span><p className="mt-4 text-xs font-bold uppercase tracking-wide text-[#0b5ea2]/60">Published papers</p><p className="mt-1 text-3xl font-black text-[#0b5ea2]">{thesisSummary.total_thesis_materials}</p></SectionCard>
        <SectionCard className="p-5"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFF200]/45 text-[#0b5ea2]"><AlertTriangle size={21} /></span><p className="mt-4 text-xs font-bold uppercase tracking-wide text-[#0b5ea2]/60">Damaged research copies</p><p className="mt-1 text-3xl font-black text-[#0b5ea2]">{thesisSummary.damaged_thesis_count}</p></SectionCard>
        <SectionCard className="p-5"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFF200] text-[#0b5ea2]"><XCircle size={21} /></span><p className="mt-4 text-xs font-bold uppercase tracking-wide text-[#0b5ea2]/60">Lost research papers</p><p className="mt-1 text-3xl font-black text-[#0b5ea2]">{thesisSummary.lost_thesis_count}</p></SectionCard>
      </div>
      <SectionCard className="mt-5 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#0b5ea2]/15 p-5 sm:flex-row sm:items-center"><h2 id="thesis-inventory-title" className="flex-1 text-lg font-black text-[#0b5ea2]">Research and thesis inventory</h2><button type="button" disabled={bulkBarcodeBusy || thesisRows.length === 0} onClick={() => void downloadBulkBarcodes('research')} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0b5ea2] px-4 text-sm font-bold text-white disabled:opacity-50"><Download size={15} />{bulkBarcodeBusy ? 'Building barcodes…' : selectedThesisIds.size > 0 ? `Download selected barcodes (${selectedThesisIds.size})` : `Bulk download barcodes (${thesisRows.length})`}</button></div>
        <form onSubmit={(event) => { event.preventDefault(); setThesisFilters({ ...thesisDraftFilters, page: 1 }) }} className="grid gap-3 border-b border-[#0b5ea2]/15 bg-[#0b5ea2]/5 p-4 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_180px_180px_140px_auto_auto]">
          <label className="relative"><span className="sr-only">Search research inventory</span><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0b5ea2]/45" size={15} /><input value={thesisDraftFilters.query} onChange={(event) => setThesisDraftFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Title, author, adviser, barcode…" className="h-10 w-full rounded-xl border border-[#0b5ea2]/20 bg-[#FFFFFF] pl-9 pr-3 text-sm text-[#0b5ea2] outline-none focus:ring-2 focus:ring-[#0b5ea2]/20" /></label>
          <select aria-label="Filter research by condition" value={thesisDraftFilters.conditionState} onChange={(event) => setThesisDraftFilters((current) => ({ ...current, conditionState: event.target.value }))} className="h-10 rounded-xl border border-[#0b5ea2]/20 bg-[#FFFFFF] px-3 text-sm text-[#0b5ea2]"><option value="">All conditions</option><option value="good">Good</option><option value="fair">Fair</option><option value="for_repair">For repair</option><option value="damaged">Damaged</option><option value="lost">Lost</option></select>
          <select aria-label="Filter research by availability" value={thesisDraftFilters.availabilityStatus} onChange={(event) => setThesisDraftFilters((current) => ({ ...current, availabilityStatus: event.target.value }))} className="h-10 rounded-xl border border-[#0b5ea2]/20 bg-[#FFFFFF] px-3 text-sm text-[#0b5ea2]"><option value="">All availability</option><option value="available">Available</option><option value="unavailable">Unavailable</option><option value="borrowed">Borrowed</option><option value="reserved">Reserved</option></select>
          <input aria-label="Filter research by publication year" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={thesisDraftFilters.publicationYear} onChange={(event) => setThesisDraftFilters((current) => ({ ...current, publicationYear: event.target.value.replace(/\D/g, '').slice(0, 4) }))} placeholder="Year" className="h-10 rounded-xl border border-[#0b5ea2]/20 bg-[#FFFFFF] px-3 text-sm text-[#0b5ea2] outline-none focus:ring-2 focus:ring-[#0b5ea2]/20" />
          <button type="submit" disabled={thesisLoading} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0b5ea2] px-4 text-sm font-bold text-[#FFFFFF] disabled:opacity-50"><Search size={15} />{thesisLoading ? 'Searching…' : 'Search'}</button>
          <button type="button" onClick={() => { setThesisDraftFilters(DEFAULT_THESIS_FILTERS); setThesisFilters(DEFAULT_THESIS_FILTERS) }} className="h-10 rounded-xl border border-[#0b5ea2]/20 bg-[#FFFFFF] px-4 text-sm font-bold text-[#0b5ea2]">Clear</button>
        </form>
        <ResponsiveTable><table className="w-full min-w-[1160px] text-left text-sm"><thead className="bg-[#0b5ea2] text-[11px] uppercase tracking-wider text-[#FFFFFF]"><tr><th className="w-10 px-3 py-3"><input type="checkbox" aria-label="Select all research copies on this page" checked={allThesisSelected} onChange={toggleAllThesis} className="h-4 w-4 rounded accent-[#FFF200]" /></th><th className="px-4 py-3">Title and authors</th><th className="px-4 py-3">Adviser / year</th><th className="px-4 py-3">Accession / barcode</th><th className="px-4 py-3">Shelf</th><th className="px-4 py-3">Condition</th><th className="px-4 py-3">Availability</th><th className="px-4 py-3">Actions</th></tr></thead><tbody className="divide-y divide-[#0b5ea2]/10">
          {thesisLoading && thesisRows.length === 0 ? <tr><td colSpan={8} className="px-5 py-12 text-center text-[#0b5ea2]/65"><RefreshCw className="mx-auto mb-3 animate-spin" size={22} />Loading research inventory…</td></tr> : null}
          {!thesisLoading && thesisRows.length === 0 ? <tr><td colSpan={8} className="px-5 py-12 text-center"><GraduationCap className="mx-auto text-[#0b5ea2]/45" size={28} /><p className="mt-3 font-bold text-[#0b5ea2]">No bound research papers found</p></td></tr> : null}
          {thesisRows.map((thesis) => { const activeCirculation = thesis.availability_status === 'borrowed' || thesis.availability_status === 'reserved'; const availabilityLocked = activeCirculation || thesis.condition_state === 'lost'; const removalLocked = activeCirculation || thesis.condition_state !== 'lost'; const removalTitle = activeCirculation ? 'Resolve the active allocation before removing this research copy.' : thesis.condition_state !== 'lost' ? 'Mark this research copy as Lost before removing it.' : 'Remove this Lost research copy from active inventory.'; return <tr key={thesis.research_inventory_id} className="hover:bg-[#0b5ea2]/5"><td className="px-3 py-4"><input type="checkbox" aria-label={`Select ${thesis.accession_number}`} checked={selectedThesisIds.has(thesis.research_inventory_id)} onChange={() => toggleThesisSelection(thesis.research_inventory_id)} className="h-4 w-4 rounded accent-[#0b5ea2]" /></td><td className="px-4 py-4"><p className="font-bold text-[#0b5ea2]">{thesis.title}</p><p className="mt-1 text-xs text-[#0b5ea2]/60">{thesis.authors}</p></td><td className="px-4 py-4 text-[#0b5ea2]"><p>{thesis.adviser}</p><p className="mt-1 text-xs text-[#0b5ea2]/60">{thesis.publication_year}</p></td><td className="px-4 py-4 font-mono text-xs text-[#0b5ea2]"><p className="font-bold">{thesis.accession_number}</p><p className="mt-1 text-[#0b5ea2]/60">{thesis.barcode}</p><button type="button" disabled={downloadingBarcodeId !== null} onClick={() => void downloadSingleBarcode(thesis.research_inventory_id, thesis.accession_number, 'research')} className="mt-1.5 inline-flex items-center gap-1 rounded-[4px] border border-[#0b5ea2]/25 bg-white px-2 py-0.5 font-sans text-[11px] font-semibold text-[#0b5ea2] hover:bg-[#0b5ea2]/10 disabled:opacity-50"><Download size={11} />{downloadingBarcodeId === `research-${thesis.research_inventory_id}` ? 'Downloading…' : 'Barcode PNG'}</button></td><td className="px-4 py-4 text-[#0b5ea2]">{thesis.shelf_location}</td><td className="px-4 py-4"><ConditionBadge condition={displayThesisCondition(thesis.condition_state)} /></td><td className="px-4 py-4"><AvailabilityBadge status={displayThesisAvailability(thesis.availability_status)} /></td><td className="px-4 py-4"><InventoryActions accession={thesis.accession_number} actions={[
            { label: 'Download barcode PNG', description: 'Download Code-128 barcode image', onSelect: () => void downloadSingleBarcode(thesis.research_inventory_id, thesis.accession_number, 'research') },
            { label: 'View barcode & QR', description: 'Preview and print asset labels', onSelect: () => setAssetModalTarget({ kind: 'research', id: thesis.research_inventory_id }) },
            { label: 'Move copies', description: 'Choose another shelf compartment', onSelect: () => setMoving({kind:'Research/Thesis',copies:[{id:thesis.research_inventory_id,accession:thesis.accession_number,shelfLocation:thesis.shelf_location,shelfColumn:thesis.shelf_column ?? 1,shelfRow:thesis.shelf_row ?? 1}]}) },
            { label: 'Audit condition', onSelect: () => setSelectedThesis(thesis) },
            { label: thesis.availability_status === 'available' ? 'Make unavailable' : 'Make available', disabled: availabilityLocked,
              description: availabilityLocked ? 'Borrowed, reserved, or lost papers cannot be manually toggled.' : 'Toggle thesis availability',
              onSelect: () => requestThesisAvailabilityChange(thesis) },
            { label: 'Delete', destructive: true, disabled: removalLocked, description: removalTitle,
              onSelect: () => setRemovalTarget({ kind: 'thesis', id: thesis.research_inventory_id, item_title: thesis.item_title, accession_number: thesis.accession_number, barcode: thesis.barcode }) },
          ]} /></td></tr>})}
        </tbody></table></ResponsiveTable>
        <div className="flex flex-col gap-3 border-t border-[#0b5ea2]/15 p-4 text-xs text-[#0b5ea2]/70 sm:flex-row sm:items-center sm:justify-between"><span>{thesisPagination.total} research {thesisPagination.total === 1 ? 'record' : 'records'}</span><div className="flex items-center gap-2"><button disabled={thesisPagination.page <= 1 || thesisLoading} onClick={() => setThesisFilters((current) => ({ ...current, page: current.page - 1 }))} className="rounded-lg border border-[#0b5ea2]/20 px-3 py-2 font-bold disabled:opacity-35">Previous</button><span className="font-bold text-[#0b5ea2]">Page {thesisPagination.page} of {Math.max(thesisPagination.total_pages, 1)}</span><button disabled={thesisPagination.page >= thesisPagination.total_pages || thesisLoading} onClick={() => setThesisFilters((current) => ({ ...current, page: current.page + 1 }))} className="rounded-lg border border-[#0b5ea2]/20 px-3 py-2 font-bold disabled:opacity-35">Next</button></div></div>
      </SectionCard>
    </section>
    <div hidden={resource !== 'books'}>
    <SectionCard className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#0b5ea2]/15 p-4 lg:flex-row lg:flex-wrap lg:items-center">
        <h2 className="flex-1 font-bold text-[#0b5ea2]">Physical copy register</h2>
        <label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0b5ea2]/45" size={15} /><input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, page: 1, query: event.target.value }))} placeholder="Title, author, barcode, accession…" className="h-10 w-full rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] pl-9 pr-3 text-sm text-[var(--sl-text)] outline-none focus:border-[#0b5ea2] lg:w-64" /></label>
        <select aria-label="Filter by condition" value={filters.conditionState} onChange={(event) => setFilters((current) => ({ ...current, page: 1, conditionState: event.target.value }))} className="h-10 rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3 text-sm text-[var(--sl-text)]"><option value="">All conditions</option>{['Good', 'Fair', 'For Repair', 'Damaged', 'Lost'].map((item) => <option key={item}>{item}</option>)}</select>
        <button type="button" disabled={bulkBarcodeBusy || copies.length === 0} onClick={() => void downloadBulkBarcodes('book')} className="inline-flex h-10 items-center justify-center gap-2 rounded-[6px] bg-[#0b5ea2] px-3.5 text-sm font-semibold text-white transition hover:bg-[#094e87] disabled:opacity-50"><Download size={15} />{bulkBarcodeBusy ? 'Building barcodes…' : selectedCopyIds.size > 0 ? `Download selected barcodes (${selectedCopyIds.size})` : `Bulk download barcodes (${copies.length})`}</button>
        <button onClick={() => void load(filters)} className="inline-flex h-10 items-center justify-center gap-2 rounded-[6px] border border-[var(--sl-border-strong)] px-3.5 text-sm font-semibold text-[var(--sl-text-header)] hover:bg-[var(--sl-bg-subtle)]"><RefreshCw className={cn(loading && 'animate-spin')} size={15} />Refresh</button>
      </div>
      <ResponsiveTable><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-[#0b5ea2] text-[11px] uppercase tracking-wider text-[#FFFFFF]"><tr><th className="w-10 px-3 py-3"><input type="checkbox" aria-label="Select all physical copies on this page" checked={allCopiesSelected} onChange={toggleAllCopies} className="h-4 w-4 rounded accent-[#FFF200]" /></th><th className="px-4 py-3">Item title</th><th className="px-4 py-3">Accession</th><th className="px-4 py-3">Barcode</th><th className="px-4 py-3">Shelf</th><th className="px-4 py-3">Condition</th><th className="px-4 py-3">Availability</th><th className="px-4 py-3">Last verified</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-[#0b5ea2]/10">
        {loading && copies.length === 0 ? <tr><td colSpan={9} className="px-5 py-14 text-center text-[#0b5ea2]/65"><RefreshCw className="mx-auto mb-3 animate-spin" size={22} />Loading physical inventory…</td></tr> : null}
        {!loading && copies.length === 0 ? <tr><td colSpan={9} className="px-5 py-14 text-center"><Barcode className="mx-auto text-[#0b5ea2]/45" size={28} /><p className="mt-3 font-bold text-[#0b5ea2]">No physical copies found</p></td></tr> : null}
          {copies.map((copy) => { const activeCirculation = copy.availability_status === 'Borrowed' || copy.availability_status === 'Reserved'; const availabilityLocked = activeCirculation || copy.condition_status === 'Lost'; const removalLocked = activeCirculation || copy.condition_status !== 'Lost'; const removalTitle = activeCirculation ? 'Process the return or cancel the reservation before removing this copy.' : copy.condition_status !== 'Lost' ? 'Mark this copy as Lost before removing it.' : 'Remove this Lost copy from active inventory.'; return <tr key={copy.physical_copy_id} className="hover:bg-[#0b5ea2]/5"><td className="px-3 py-4"><input type="checkbox" aria-label={`Select ${copy.accession_number}`} checked={selectedCopyIds.has(copy.physical_copy_id)} onChange={() => toggleCopySelection(copy.physical_copy_id)} className="h-4 w-4 rounded accent-[#0b5ea2]" /></td><td className="px-4 py-4"><p className="font-bold text-[#0b5ea2]">{copy.item_title}</p><p className="mt-1 text-xs text-[#0b5ea2]/60">{copy.authors.join(', ') || copy.category_name || 'No author metadata'}</p></td><td className="px-4 py-4 font-mono text-xs font-bold text-[#0b5ea2]">{copy.accession_number}</td><td className="px-4 py-4 font-mono text-xs text-[#0b5ea2]/80"><p className="font-semibold">{copy.barcode}</p><button type="button" disabled={downloadingBarcodeId !== null} onClick={() => void downloadSingleBarcode(copy.physical_copy_id, copy.accession_number, 'book')} className="mt-1.5 inline-flex items-center gap-1 rounded-[4px] border border-[#0b5ea2]/25 bg-white px-2 py-0.5 font-sans text-[11px] font-semibold text-[#0b5ea2] hover:bg-[#0b5ea2]/10 disabled:opacity-50"><Download size={11} />{downloadingBarcodeId === `book-${copy.physical_copy_id}` ? 'Downloading…' : 'Download barcode'}</button></td><td className="px-4 py-4 text-[#0b5ea2]"><p className="font-bold">{copy.shelf_location ? `${copy.shelf_location} · C${copy.shelf_column} · R${copy.shelf_row}` : 'Unassigned shelf'}</p><p className="mt-1 font-mono text-[10px] text-[#0b5ea2]/60">{copy.call_number||'Call number pending'}</p><p className="mt-1 text-xs">Dewey: {copy.dewey_code??'Not assigned'}</p></td><td className="px-4 py-4"><ConditionBadge condition={copy.condition_status} /></td><td className="px-4 py-4"><AvailabilityBadge status={copy.availability_status} /></td><td className="px-4 py-4 text-xs text-[#0b5ea2]/70">{formatDate(copy.last_verified_at)}</td><td className="px-4 py-4"><InventoryActions accession={copy.accession_number} actions={[
            { label: 'Download barcode PNG', description: 'Download Code-128 barcode image', onSelect: () => void downloadSingleBarcode(copy.physical_copy_id, copy.accession_number, 'book') },
            { label: 'View barcode & QR', description: 'Preview and print asset labels', onSelect: () => setAssetModalTarget({ kind: 'book', id: copy.physical_copy_id }) },
            { label: 'Move copies', description: 'Choose another shelf compartment', onSelect: () => setMoving({kind:'Book',copies:[{id:copy.physical_copy_id,accession:copy.accession_number,shelfLocation:copy.shelf_location??'',shelfColumn:copy.shelf_column,shelfRow:copy.shelf_row}]}) },
            { label: 'Condition', description: 'Change physical condition', onSelect: () => setSelected(copy) },
            ...(copy.condition_status !== 'Lost' ? [{ label: 'Report lost', disabled: copy.availability_status === 'Borrowed',
              description: copy.availability_status === 'Borrowed' ? 'Report a borrowed copy from Circulation.' : 'Record this copy as lost.',
              onSelect: () => setLostTarget(copy) }] : []),
            { label: copy.availability_status === 'Available' ? 'Make unavailable' : 'Make available', disabled: availabilityLocked,
              description: availabilityLocked ? 'Active circulation and Lost copies cannot be manually toggled.' : 'Toggle availability manually',
              onSelect: () => requestAvailabilityChange(copy) },
            { label: 'Delete', destructive: true, disabled: removalLocked, description: removalTitle,
              onSelect: () => setRemovalTarget({ kind: 'book', id: copy.physical_copy_id, item_title: copy.item_title, accession_number: copy.accession_number, barcode: copy.barcode }) },
          ]} /></td></tr>})}
      </tbody></table></ResponsiveTable>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-[#0b5ea2]/15 p-4 text-xs text-[#0b5ea2]/70"><span>{pagination.total} physical {pagination.total === 1 ? 'copy' : 'copies'}</span><div className="flex items-center gap-2"><button disabled={pagination.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))} className="rounded-lg border border-[#0b5ea2]/20 px-3 py-2 font-bold disabled:opacity-35">Previous</button><span className="font-bold text-[#0b5ea2]">Page {pagination.page} of {Math.max(pagination.total_pages, 1)}</span><button disabled={pagination.page >= pagination.total_pages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))} className="rounded-lg border border-[#0b5ea2]/20 px-3 py-2 font-bold disabled:opacity-35">Next</button></div></div>
    </SectionCard>
    </div>
    {moving ? <MoveCopiesDialog kind={moving.kind} copies={moving.copies} onClose={() => setMoving(null)} onMoved={async () => { await Promise.all([load(filters),loadThesis(thesisFilters)]) }} /> : null}
    {selected ? <ConditionModal copy={selected} onClose={() => setSelected(null)} onSaved={() => load(filters)} saveCondition={inventoryApi.changeCondition} /> : null}
    {lostTarget ? <ConditionModal copy={lostTarget} initialCondition="lost" onClose={() => setLostTarget(null)} onSaved={() => load(filters)} saveCondition={inventoryApi.changeCondition} /> : null}
    {selectedThesis ? <ConditionModal copy={selectedThesis} onClose={() => setSelectedThesis(null)} onSaved={() => loadThesis(thesisFilters)} saveCondition={inventoryApi.auditThesis} /> : null}
    {availabilityTarget ? <AvailabilityConfirmationDialog copy={availabilityTarget} saving={availabilitySaving} error={availabilityError} onCancel={() => { if (!availabilitySaving) setAvailabilityTarget(null) }} onConfirm={() => void confirmAvailabilityChange()} /> : null}
    {thesisAvailabilityTarget ? <AvailabilityConfirmationDialog copy={thesisAvailabilityTarget} saving={availabilitySaving} error={availabilityError} onCancel={() => { if (!availabilitySaving) setThesisAvailabilityTarget(null) }} onConfirm={() => void confirmThesisAvailabilityChange()} /> : null}
    {assetModalTarget ? (
      assetModalTarget.kind === 'research' ? (
        <AssetCodeModal assetType="research" researchInventoryId={assetModalTarget.id} onClose={() => setAssetModalTarget(null)} />
      ) : (
        <AssetCodeModal physicalCopyId={assetModalTarget.id} onClose={() => setAssetModalTarget(null)} />
      )
    ) : null}
    {removalTarget ? <InventoryRemovalDialog
      key={`${removalTarget.kind}-${removalTarget.id}`}
      target={removalTarget}
      deleteItem={() => removalTarget.kind === 'book'
        ? inventoryApi.deleteBookCopy(removalTarget.id)
        : inventoryApi.deleteThesisCopy(removalTarget.id)}
      archiveItem={(reason) => removalTarget.kind === 'book'
        ? inventoryApi.archiveBookCopy(removalTarget.id, reason)
        : inventoryApi.archiveThesisCopy(removalTarget.id, reason)}
      onCancel={() => setRemovalTarget(null)}
      onCompleted={completeRemoval}
    /> : null}
  </div>
}
