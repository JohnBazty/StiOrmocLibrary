import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  FileText,
  ImageUp,
  Info,
  LocateFixed,
  Play,
  RefreshCw,
  ScanBarcode,
  Search,
  X,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, PageHeader, SectionCard as Card, StatusBadge } from '../../components/ui'
import {
  stocktakeApi,
  type InventoryOutcome,
  type LookupResult,
  type SavedCount,
  type ScanResponse,
  type StocktakeDetail,
} from './stocktake-api'
import { decodeUploadedBarcodeFile } from './barcode-image-decoder'
import { StocktakeCameraScanner } from './StocktakeCameraScanner'
import { StocktakeConditionDialog, type ObservedCondition } from './StocktakeConditionDialog'

/** A label the camera has read and that is waiting for staff to confirm its condition. */
type Detected = {
  code: string
  lookup: LookupResult | null
  saving: boolean
  error: string
  attempt: { condition: ObservedCondition; requestKey: string } | null
}

type ToastTone = 'success' | 'warning' | 'error' | 'info'
type ToastState = {
  tone: ToastTone
  title: string
  text: string
  link?: { to: string; label: string } | null
  locate?: { code: string; bucket: 'in_scope' | 'exception' } | null
}

type RecentScan = {
  id: string
  code: string
  label: string
  statusText: string
  tone: 'ok' | 'warn' | 'error'
  bucket: 'in_scope' | 'exception'
  source: 'camera' | 'scanner'
  at: string
  link: { to: string; label: string } | null
}

type TableTab = 'all' | 'scanned' | 'not_checked' | 'exceptions' | 'damaged' | 'changed'

type ScanEvidence = {
  code?: string
  shelf?: string
  condition?: string | null
  item?: {
    title?: string
    accession?: string
    barcode?: string
    shelf?: string
    kind?: string
    lifecycle?: string
  } | null
}

type ExceptionScanRow = {
  key: string
  codeType: 'unexpected' | 'unknown'
  label: string
  code: string
  title: string | null
  kind: string | null
  accession: string | null
  homeShelf: string | null
  scannedAt: string | null
  observedCondition: string | null
}

const MAX_RECENT_SCANS = 8
const TOAST_AUTO_HIDE_MS = 8500
const PAGE_SIZE = 25

const conditionKey = (value: string) => value.toLowerCase().replaceAll(' ', '_')

function formatManilaTime(date: Date) {
  try {
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date)
  } catch {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
}

function formatConditionLabel(value: string) {
  const key = conditionKey(value)
  if (key === 'good') return 'Good'
  if (key === 'fair') return 'Worn but usable'
  if (key === 'for_repair') return 'For Repair'
  if (key === 'damaged') return 'Damaged'
  if (key === 'lost') return 'Lost'
  return value.replaceAll('_', ' ')
}

/** Where an inventory change shows up, so staff can open the list it now belongs to. */
function kpiLink(kind: 'book' | 'research', to: string) {
  const key = conditionKey(to)
  if (kind === 'book') {
    if (key === 'for_repair') return { to: '/librarian/inventory?condition=For%20Repair', label: 'See Books in repair' }
    if (key === 'damaged') return { to: '/librarian/inventory?condition=Damaged', label: 'See Damaged copies' }
    return null
  }
  if (key === 'for_repair') return { to: '/librarian/inventory?resource=research&condition=for_repair', label: 'See Research in repair' }
  if (key === 'damaged') return { to: '/librarian/inventory?resource=research&condition=damaged', label: 'See Damaged research' }
  return null
}

function scanMessage(
  response: ScanResponse,
  lookup: LookupResult | null,
  code: string,
  condition: ObservedCondition,
) {
  const title = lookup?.found ? lookup.item.title : code
  const outcome: InventoryOutcome = response.scanResult?.inventory ?? { status: 'none' }
  const isOutsideScope = Boolean(lookup?.found && !lookup.inScope)
  const bucket: 'in_scope' | 'exception' = !lookup?.found || isOutsideScope ? 'exception' : 'in_scope'

  if (!lookup?.found) {
    return {
      title: 'Unrecognized barcode saved for review',
      text: `Code ${code} is unrecognized. Recorded for review under Outside scope & Unknown.`,
      link: null,
      tone: 'error' as const,
      bucket,
    }
  }
  if (outcome.status === 'applied') {
    const to = outcome.to ?? ''
    const scopeNote = isOutsideScope ? ` Saved under Outside scope (home shelf: ${lookup.item.shelf || 'Unassigned'}).` : ''
    return {
      title: 'Condition saved & inventory updated',
      text: `Saved. “${title}” is now marked ${to.replaceAll('_', ' ')}. The count and the inventory record are both updated.${scopeNote}`,
      link: kpiLink(lookup.item.kind, to),
      tone: 'warn' as const,
      bucket,
    }
  }
  if (outcome.status === 'unchanged') {
    return {
      title: isOutsideScope ? 'Saved under Outside scope' : 'Item counted',
      text: `Recorded “${title}”. It was already marked ${(outcome.to ?? '').replaceAll('_', ' ')}.${isOutsideScope ? ` Home shelf is ${lookup.item.shelf || 'Unassigned'}.` : ''}`,
      link: null,
      tone: 'warn' as const,
      bucket,
    }
  }
  if (outcome.status === 'failed') {
    return {
      title: 'Counted, but inventory was not changed',
      text: `Counted “${title}”, but its status was not changed: ${outcome.message ?? 'the inventory could not be updated.'} Update it from Inventory.`,
      link: null,
      tone: 'error' as const,
      bucket,
    }
  }
  if (outcome.status === 'skipped') {
    return {
      title: 'Counted (inventory status kept)',
      text: `Counted “${title}”. ${outcome.message ?? ''}`.trim(),
      link: null,
      tone: 'warn' as const,
      bucket,
    }
  }
  if (isOutsideScope) {
    return {
      title: 'Saved under Outside scope',
      text: `Recorded “${title}” (${code}) as ${condition === 'fair' ? 'worn but usable' : condition} under Outside scope (home shelf: ${lookup.item.shelf || 'Unassigned'}).`,
      link: null,
      tone: 'warn' as const,
      bucket,
    }
  }
  return {
    title: 'Item scanned & counted',
    text: `Recorded “${title}” as ${condition === 'fair' ? 'worn but usable' : condition}. Each physical item counts once.`,
    link: null,
    tone: 'ok' as const,
    bucket,
  }
}

function extractExceptionScans(findings: StocktakeDetail['report']['findings']): ExceptionScanRow[] {
  return findings
    .filter(f => f.code === 'unexpected' || f.code === 'unknown')
    .map(f => {
      const ev = (f.evidence ?? {}) as ScanEvidence
      return {
        key: f.key,
        codeType: f.code as 'unexpected' | 'unknown',
        label: f.label,
        code: String(ev.code ?? ''),
        title: ev.item?.title ?? null,
        kind: ev.item?.kind ?? null,
        accession: ev.item?.accession ?? null,
        homeShelf: ev.item?.shelf ?? null,
        scannedAt: ev.shelf ?? null,
        observedCondition: ev.condition ?? null,
      }
    })
}

function outcomeTone(outcome: string): 'success' | 'info' | 'warning' | 'error' | 'neutral' {
  const normalized = outcome.toLowerCase()
  if (normalized === 'found') return 'success'
  if (normalized.includes('loan')) return 'info'
  if (normalized.includes('lost')) return 'error'
  if (normalized.includes('outside')) return 'warning'
  if (normalized.includes('unrecognized')) return 'error'
  return 'neutral'
}

const FINDING_META: Record<string, { title: string; priority: 'high' | 'routine'; tone: 'error' | 'warning' | 'info' | 'neutral' }> = {
  unknown: { title: 'Unrecognized barcodes', priority: 'high', tone: 'error' },
  unexpected: { title: 'Items outside this count scope', priority: 'high', tone: 'warning' },
  wrong_location: { title: 'Scanned at a different shelf', priority: 'high', tone: 'warning' },
  loan_scan: { title: 'Scanned while marked on loan / in use', priority: 'high', tone: 'info' },
  lost_scan: { title: 'Known lost items found during scan', priority: 'high', tone: 'error' },
  condition_conflict: { title: 'Conflicting observed conditions', priority: 'high', tone: 'warning' },
  condition_observed: { title: 'Observed condition differs from record', priority: 'high', tone: 'warning' },
  not_checked: { title: 'Physical check still needed (not yet scanned)', priority: 'routine', tone: 'neutral' },
  changed: { title: 'Record or circulation changed during count', priority: 'routine', tone: 'neutral' },
}

function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sl-border)] px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold text-[var(--sl-text-header)]">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">{subtitle}</p> : null}
        </div>
        {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </Card>
  )
}

function StocktakeToast({
  toast,
  onDismiss,
  onLocate,
}: {
  toast: ToastState
  onDismiss: () => void
  onLocate: (target: { code: string; bucket: 'in_scope' | 'exception' }) => void
}) {
  const styles: Record<ToastTone, string> = {
    success: 'border-[#166534] bg-[#166534] text-white',
    error: 'border-[#b42318] bg-[#b42318] text-white',
    info: 'border-[#0b5ea2] bg-[#0b5ea2] text-white',
    warning:
      'border-[#d97706] border-l-4 bg-[#fffbeb] text-[#92400e] dark:border-[#fbbf24] dark:bg-[#292013] dark:text-[#fde68a]',
  }
  const Icon =
    toast.tone === 'success'
      ? CheckCircle2
      : toast.tone === 'error'
        ? AlertCircle
        : toast.tone === 'warning'
          ? AlertTriangle
          : Info

  const isLightSurface = toast.tone === 'warning'

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
      data-testid="stocktake-toast"
      className={`fixed bottom-5 right-5 z-[140] w-[calc(100vw-2rem)] max-w-md rounded-[8px] border px-4 py-3.5 shadow-[0_12px_48px_rgba(19,42,63,0.28),0_3px_18px_rgba(19,42,63,0.14)] transition-all ${styles[toast.tone]}`}
    >
      <div className="flex items-start gap-3">
        <Icon size={20} aria-hidden="true" className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1 space-y-1.5 text-sm">
          <p className="font-bold leading-snug">{toast.title}</p>
          <p className={`text-xs leading-relaxed ${isLightSurface ? 'opacity-90' : 'text-white/95'}`}>
            {toast.text}
          </p>
          {toast.link || toast.locate ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {toast.locate ? (
                <button
                  type="button"
                  onClick={() => onLocate(toast.locate!)}
                  className={`inline-flex items-center gap-1 rounded-[5px] px-2.5 py-1 text-xs font-semibold transition-colors ${
                    isLightSurface
                      ? 'bg-[#92400e] text-white hover:bg-[#78350f]'
                      : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                >
                  <LocateFixed size={13} aria-hidden="true" />
                  Locate in table
                </button>
              ) : null}
              {toast.link ? (
                <Link
                  to={toast.link.to}
                  className={`inline-flex items-center rounded-[5px] px-2.5 py-1 text-xs font-semibold underline underline-offset-2 ${
                    isLightSurface
                      ? 'bg-[#fef3c7] text-[#92400e] hover:bg-[#fde68a]'
                      : 'bg-white/15 text-white hover:bg-white/25'
                  }`}
                >
                  {toast.link.label}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className={`shrink-0 rounded-[5px] p-1 transition-colors ${
            isLightSurface ? 'hover:bg-black/10' : 'hover:bg-white/20'
          }`}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export function StocktakePage() {
  const [params, setParams] = useSearchParams()
  const selected = Number(params.get('count')) || null

  const [saved, setSaved] = useState<SavedCount[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [data, setData] = useState<StocktakeDetail | null>(null)

  const [name, setName] = useState('')
  const [nameError, setNameError] = useState('')
  const [kind, setKind] = useState('both')
  const [scope, setScope] = useState('')

  const [location, setLocation] = useState('')
  const [code, setCode] = useState('')
  const [codeType, setCodeType] = useState('barcode')
  const [condition, setCondition] = useState('')
  const [scanFieldErrors, setScanFieldErrors] = useState<{
    location?: string
    condition?: string
    code?: string
  }>({})

  const [cameraOn, setCameraOn] = useState(false)
  const [imageScanBusy, setImageScanBusy] = useState(false)
  const [detected, setDetected] = useState<Detected | null>(null)
  const [recentScans, setRecentScans] = useState<RecentScan[]>([])

  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)

  const [activeTab, setActiveTab] = useState<TableTab>('all')
  const [scannedFirst, setScannedFirst] = useState(true)
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)

  const [review, setReview] = useState(false)
  const [note, setNote] = useState('')
  const [checked, setChecked] = useState(false)
  const [cancel, setCancel] = useState(false)
  const [reason, setReason] = useState('')

  const nameInput = useRef<HTMLInputElement>(null)
  const locationInput = useRef<HTMLInputElement>(null)
  const conditionSelect = useRef<HTMLSelectElement>(null)
  const scanInput = useRef<HTMLInputElement>(null)
  const resultsSectionRef = useRef<HTMLDivElement>(null)
  const pending = useRef<{
    code: string
    location: string
    codeType: string
    condition: string
    requestKey: string
  } | null>(null)
  const running = useRef(false)

  const active = data?.session.status === 'in_progress'
  const currentId = data?.session.stocktake_session_id
  const sessionRef = useRef<number | null>(null)
  sessionRef.current = currentId ?? null

  function showToast(next: ToastState) {
    setToast(next)
  }

  // Auto-hide non-error toasts after a comfortable reading window while keeping errors visible until dismissed.
  useEffect(() => {
    if (!toast || toast.tone === 'error') return
    const timer = window.setTimeout(() => setToast(null), TOAST_AUTO_HIDE_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  async function loadList() {
    setSaved(await stocktakeApi.list())
  }

  useEffect(() => {
    void Promise.all([loadList(), stocktakeApi.locations().then(setLocations)]).catch(e =>
      showToast({
        tone: 'error',
        title: 'Could not load counts',
        text: e instanceof Error ? e.message : 'Unable to load saved counts.',
      }),
    )
  }, [])

  useEffect(() => {
    let live = true
    setData(null)
    setCameraOn(false)
    setDetected(null)
    setRecentScans([])
    setReview(false)
    setCancel(false)
    setChecked(false)
    setNote('')
    setReason('')
    setCondition('')
    setScanFieldErrors({})
    setToast(null)
    setLastScannedCode(null)
    setActiveTab('all')
    setFilter('')
    setPage(1)
    pending.current = null
    if (selected) {
      setBusy(true)
      void stocktakeApi
        .get(selected)
        .then(result => {
          if (live) {
            setData(result)
            setLocation(result.session.scope_label === 'All locations' ? '' : result.session.scope_label)
          }
        })
        .catch(e => {
          if (live) {
            showToast({
              tone: 'error',
              title: 'Could not open count',
              text: e instanceof Error ? e.message : 'The count could not be loaded.',
            })
          }
        })
        .finally(() => {
          if (live) setBusy(false)
        })
    }
    return () => {
      live = false
    }
  }, [selected])

  // The camera is released when this tab is hidden so it is never left running in the background.
  useEffect(() => {
    const hide = () => {
      if (document.hidden) setCameraOn(false)
    }
    document.addEventListener('visibilitychange', hide)
    return () => document.removeEventListener('visibilitychange', hide)
  }, [])

  async function run(work: () => Promise<void>) {
    if (running.current) return
    running.current = true
    setBusy(true)
    try {
      await work()
    } catch (e) {
      showToast({
        tone: 'error',
        title: 'Action could not be completed',
        text: e instanceof Error ? e.message : 'The count could not be updated. Try again.',
      })
    } finally {
      setBusy(false)
      running.current = false
    }
  }

  function locateInTable(target: { code: string; bucket: 'in_scope' | 'exception' }) {
    setLastScannedCode(target.code)
    setFilter('')
    setPage(1)
    setActiveTab(target.bucket === 'exception' ? 'exceptions' : 'all')
    if (target.bucket === 'in_scope') setScannedFirst(true)
    requestAnimationFrame(() => {
      resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function jumpToTab(tab: TableTab) {
    setActiveTab(tab)
    setPage(1)
    requestAnimationFrame(() => {
      resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function start(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      const msg = 'Enter a count name (for example: November Shelf 3B count).'
      setNameError(msg)
      showToast({ tone: 'error', title: 'Count name required', text: msg })
      nameInput.current?.focus()
      return
    }
    setNameError('')
    void run(async () => {
      const trimmed = name.trim()
      const result = await stocktakeApi.start({ name: trimmed, kind, location: scope })
      setParams({ count: String(result.session.stocktake_session_id) })
      await loadList()
      showToast({
        tone: 'success',
        title: 'Physical count started',
        text: `Opened “${trimmed}” (${result.report.summary.expected} expected items).`,
      })
    })
  }

  function scan(e: FormEvent) {
    e.preventDefault()
    if (!currentId || busy) return
    const entered = code.trim()
    const nextErrors: { location?: string; condition?: string; code?: string } = {}
    if (!location.trim()) nextErrors.location = 'Choose the location being checked first.'
    if (!condition) nextErrors.condition = 'Choose the item’s observed condition before recording.'
    if (!entered) nextErrors.code = 'Scan or enter a barcode or accession number.'

    if (Object.keys(nextErrors).length > 0) {
      setScanFieldErrors(nextErrors)
      const firstMsg = nextErrors.location ?? nextErrors.condition ?? nextErrors.code ?? 'Complete all required fields.'
      showToast({
        tone: 'error',
        title: 'Cannot record item yet',
        text: firstMsg,
      })
      if (nextErrors.location) locationInput.current?.focus()
      else if (nextErrors.condition) conditionSelect.current?.focus()
      else scanInput.current?.focus()
      return
    }

    setScanFieldErrors({})
    void run(async () => {
      const prior = pending.current
      const req =
        prior &&
        prior.code === entered &&
        prior.location === location &&
        prior.codeType === codeType &&
        prior.condition === condition
          ? prior
          : {
              code: entered,
              location,
              codeType,
              condition,
              requestKey: crypto.randomUUID(),
            }
      pending.current = req
      const result = await stocktakeApi.scan(currentId, req)
      pending.current = null
      setData(result)
      setCode('')
      setChecked(false)

      const unknownFinding = result.report.findings.find(
        f => f.code === 'unknown' && (f.evidence as ScanEvidence | undefined)?.code === entered,
      )
      const unexpectedFinding = result.report.findings.find(
        f =>
          f.code === 'unexpected' &&
          ((f.evidence as ScanEvidence | undefined)?.code === entered ||
            (f.evidence as ScanEvidence | undefined)?.item?.barcode === entered ||
            (f.evidence as ScanEvidence | undefined)?.item?.accession === entered),
      )
      const matchedRow = result.report.rows.find(
        r => r.original.barcode === entered || r.original.accession === entered,
      )
      const outcome = result.scanResult?.inventory
      const bucket: 'in_scope' | 'exception' = unknownFinding || unexpectedFinding ? 'exception' : 'in_scope'
      setLastScannedCode(entered)

      let toastNext: ToastState
      let recentTone: 'ok' | 'warn' | 'error' = 'ok'
      let label = matchedRow ? `${matchedRow.original.title} (${matchedRow.original.accession})` : entered

      if (unknownFinding) {
        recentTone = 'error'
        toastNext = {
          tone: 'error',
          title: 'Unrecognized code recorded for review',
          text: `Code ${entered} is unrecognized. Recorded for review under Outside scope & Unknown.`,
          locate: { code: entered, bucket: 'exception' },
        }
      } else if (unexpectedFinding) {
        const ev = unexpectedFinding.evidence as ScanEvidence | undefined
        if (ev?.item?.title) label = `${ev.item.title} (${ev.item.accession ?? entered})`
        recentTone = 'warn'
        toastNext = {
          tone: 'warning',
          title: 'Recorded under Outside scope',
          text: `Recorded ${entered} under Outside scope (home shelf: ${ev?.item?.shelf || 'another shelf'}). Open Outside scope & Unknown to inspect it.`,
          locate: { code: entered, bucket: 'exception' },
        }
      } else if (outcome?.status === 'applied') {
        const to = outcome.to ?? ''
        const link = matchedRow ? kpiLink(matchedRow.original.kind === 'research' ? 'research' : 'book', to) : null
        recentTone = 'warn'
        toastNext = {
          tone: 'warning',
          title: 'Item recorded & inventory updated',
          text: `Recorded ${entered}. Marked ${to.replaceAll('_', ' ')} in inventory.`,
          link,
          locate: { code: entered, bucket: 'in_scope' },
        }
      } else {
        toastNext = {
          tone: 'success',
          title: 'Item scanned & counted',
          text: `Recorded ${entered}${matchedRow ? ` — ${matchedRow.original.title}` : ''}. Each physical item counts once.`,
          locate: { code: entered, bucket: 'in_scope' },
        }
      }

      showToast(toastNext)
      setRecentScans(previous =>
        [
          {
            id: req.requestKey,
            code: entered,
            label,
            statusText: unknownFinding
              ? 'Unrecognized'
              : unexpectedFinding
                ? 'Outside scope'
                : outcome?.status === 'applied'
                  ? `Marked ${(outcome.to ?? '').replaceAll('_', ' ')}`
                  : `Found · ${formatConditionLabel(condition)}`,
            tone: recentTone,
            bucket,
            source: 'scanner' as const,
            at: formatManilaTime(new Date()),
            link: toastNext.link ?? null,
          },
          ...previous,
        ].slice(0, MAX_RECENT_SCANS),
      )
      requestAnimationFrame(() => scanInput.current?.focus())
    })
  }

  function cameraDetected(scannedCode: string) {
    if (detected || busy || !currentId) return
    const targetId = currentId
    setToast(null)
    setDetected({ code: scannedCode, lookup: null, saving: false, error: '', attempt: null })
    stocktakeApi
      .lookup(targetId, scannedCode, 'barcode')
      .then(lookup => {
        if (sessionRef.current === targetId) {
          setDetected(current => (current?.code === scannedCode ? { ...current, lookup } : current))
        }
      })
      .catch(e => {
        if (sessionRef.current !== targetId) return
        const msg = e instanceof Error ? e.message : 'This label could not be looked up. Try again.'
        setDetected(null)
        showToast({ tone: 'error', title: 'Could not look up label', text: msg })
        if (/finished/i.test(msg)) setCameraOn(false)
      })
  }

  async function handleDirectBarcodeImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy || imageScanBusy || detected) return
    if (!location.trim()) {
      const msg = 'Choose the location being checked first.'
      setScanFieldErrors(prev => ({ ...prev, location: msg }))
      showToast({ tone: 'error', title: 'Location required', text: msg })
      locationInput.current?.focus()
      return
    }
    setImageScanBusy(true)
    try {
      const decoded = await decodeUploadedBarcodeFile(file)
      if (!decoded) {
        showToast({
          tone: 'error',
          title: 'Could not read barcode image',
          text: 'No Code-128 barcode or QR code was found in that image. Upload a downloaded barcode PNG, QR label, or a sharper photo of one copy label.',
        })
        return
      }
      cameraDetected(decoded)
    } finally {
      setImageScanBusy(false)
    }
  }

  async function saveDetected(chosenCondition: ObservedCondition) {
    if (!detected || !currentId || detected.saving) return
    if (!location.trim()) {
      setDetected({ ...detected, error: 'Choose the location being checked first.' })
      return
    }
    // A retry of the same choice reuses its reference, so a lost reply can never save the scan twice.
    const requestKey =
      detected.attempt?.condition === chosenCondition ? detected.attempt.requestKey : crypto.randomUUID()
    const targetId = currentId
    const { code: scannedCode, lookup } = detected
    setDetected({
      ...detected,
      saving: true,
      error: '',
      attempt: { condition: chosenCondition, requestKey },
    })
    try {
      const response = await stocktakeApi.scan(targetId, {
        code: scannedCode,
        location,
        codeType: 'barcode',
        condition: chosenCondition,
        requestKey,
      })
      if (sessionRef.current !== targetId) return
      const result = scanMessage(response, lookup, scannedCode, chosenCondition)
      setData(response)
      setChecked(false)
      setDetected(null)
      setLastScannedCode(scannedCode)

      const toastTone: ToastTone =
        result.tone === 'error' ? 'warning' : result.tone === 'warn' ? 'warning' : 'success'
      showToast({
        tone: toastTone,
        title: result.title,
        text: result.text,
        link: result.link,
        locate: { code: scannedCode, bucket: result.bucket },
      })

      setRecentScans(previous =>
        [
          {
            id: requestKey,
            code: scannedCode,
            label: lookup?.found ? `${lookup.item.title} (${lookup.item.accession})` : scannedCode,
            statusText: !lookup?.found
              ? 'Unrecognized'
              : !lookup.inScope
                ? 'Outside scope'
                : response.scanResult?.inventory?.status === 'applied'
                  ? `Marked ${(response.scanResult.inventory.to ?? '').replaceAll('_', ' ')}`
                  : `Found · ${formatConditionLabel(chosenCondition)}`,
            tone: result.tone,
            bucket: result.bucket,
            source: 'camera' as const,
            at: formatManilaTime(new Date()),
            link: result.link,
          },
          ...previous,
        ].slice(0, MAX_RECENT_SCANS),
      )
    } catch (e) {
      if (sessionRef.current !== targetId) return
      const msg = e instanceof Error ? e.message : 'Try again.'
      if (/finished/i.test(msg)) {
        setCameraOn(false)
        setDetected(null)
        showToast({ tone: 'error', title: 'Count already finished', text: msg })
        return
      }
      setDetected(current => (current ? { ...current, saving: false, error: `Not saved. ${msg}` } : current))
    }
  }

  const allRows = data?.report.rows ?? []
  const exceptionScans = useMemo(
    () => (data ? extractExceptionScans(data.report.findings) : []),
    [data],
  )

  const tabCounts = useMemo(
    () => ({
      all: allRows.length,
      scanned: allRows.filter(r => r.scans > 0 || r.outcome === 'Found').length,
      not_checked: allRows.filter(r => r.outcome === 'Not yet checked').length,
      exceptions: exceptionScans.length,
      damaged: allRows.filter(
        r =>
          r.damaged ||
          r.observedCondition === 'for_repair' ||
          r.observedCondition === 'damaged',
      ).length,
      changed: allRows.filter(r => r.changed).length,
    }),
    [allRows, exceptionScans],
  )

  const filteredRows = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const byTab = allRows.filter(row => {
      if (activeTab === 'scanned') return row.scans > 0 || row.outcome === 'Found'
      if (activeTab === 'not_checked') return row.outcome === 'Not yet checked'
      if (activeTab === 'damaged') {
        return (
          row.damaged ||
          row.observedCondition === 'for_repair' ||
          row.observedCondition === 'damaged'
        )
      }
      if (activeTab === 'changed') return row.changed
      return true
    })
    const searched = q
      ? byTab.filter(row =>
          `${row.original.title} ${row.original.barcode} ${row.original.accession} ${row.item.shelf} ${row.outcome} ${row.item.condition} ${row.observedCondition ?? ''}`
            .toLowerCase()
            .includes(q),
        )
      : byTab

    if (!scannedFirst) return searched

    return [...searched].sort((a, b) => {
      const aLatest =
        lastScannedCode !== null &&
        (a.original.barcode === lastScannedCode || a.original.accession === lastScannedCode)
          ? 1
          : 0
      const bLatest =
        lastScannedCode !== null &&
        (b.original.barcode === lastScannedCode || b.original.accession === lastScannedCode)
          ? 1
          : 0
      if (aLatest !== bLatest) return bLatest - aLatest
      const aScanned = a.scans > 0 ? 1 : 0
      const bScanned = b.scans > 0 ? 1 : 0
      if (aScanned !== bScanned) return bScanned - aScanned
      return b.scans - a.scans
    })
  }, [allRows, activeTab, filter, scannedFirst, lastScannedCode])

  const filteredExceptions = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const searched = q
      ? exceptionScans.filter(ex =>
          `${ex.title ?? ''} ${ex.code} ${ex.accession ?? ''} ${ex.homeShelf ?? ''} ${ex.scannedAt ?? ''} ${ex.label}`
            .toLowerCase()
            .includes(q),
        )
      : exceptionScans
    if (!lastScannedCode) return searched
    return [...searched].sort((a, b) => {
      const aHit = a.code === lastScannedCode || a.accession === lastScannedCode ? 1 : 0
      const bHit = b.code === lastScannedCode || b.accession === lastScannedCode ? 1 : 0
      return bHit - aHit
    })
  }, [exceptionScans, filter, lastScannedCode])

  const groupedFindings = useMemo(() => {
    if (!data) return []
    const rowTitleMap = new Map(data.report.rows.map(r => [r.expectedId, r.original.title]))
    const map = new Map<string, Array<{ key: string; subtitle: string; detail: string }>>()
    for (const f of data.report.findings) {
      const list = map.get(f.code) ?? []
      const ev = (f.evidence ?? {}) as ScanEvidence
      const title = f.expectedId ? rowTitleMap.get(f.expectedId) ?? `Item #${f.expectedId}` : ev.item?.title ?? String(ev.code ?? '')
      const detail =
        f.code === 'unexpected'
          ? `${ev.code ?? ''} · Home shelf: ${ev.item?.shelf || 'Unassigned'} → Scanned at ${ev.shelf || 'unknown'}`
          : f.code === 'unknown'
            ? `Scanned code: ${ev.code ?? ''} at ${ev.shelf || 'unknown'}`
            : f.label
      list.push({ key: f.key, subtitle: title, detail })
      map.set(f.code, list)
    }
    return [...map.entries()].sort((a, b) => {
      const pa = FINDING_META[a[0]]?.priority === 'high' ? 0 : 1
      const pb = FINDING_META[b[0]]?.priority === 'high' ? 0 : 1
      return pa - pb
    })
  }, [data])

  const activeListCount = activeTab === 'exceptions' ? filteredExceptions.length : filteredRows.length
  const pages = Math.max(1, Math.ceil(activeListCount / PAGE_SIZE))
  const safePage = Math.min(page, pages)
  const visibleRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const visibleExceptions = filteredExceptions.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const expectedCount = data?.report.summary.expected ?? 0
  const foundCount = data?.report.summary.found ?? 0
  const progressPct = expectedCount > 0 ? Math.min(100, Math.round((foundCount / expectedCount) * 100)) : 0

  const missingScanFields = [
    !location.trim() && 'Location being checked',
    !condition && 'Observed condition',
    !code.trim() && 'Barcode or accession',
  ].filter((x): x is string => Boolean(x))

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        eyebrow="Inventory Audit"
        title="Stocktake"
        description="Count books and research copies with a webcam or Barcode to PC, track outside-scope items clearly, and review exceptions before saving."
        action={
          <Link
            to="/librarian/inventory"
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3.5 py-2 text-sm font-semibold text-[var(--sl-text-header)] shadow-[var(--sl-shadow-xs)] hover:bg-[var(--sl-bg-subtle)]"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Back to inventory
          </Link>
        }
      />

      {toast ? (
        <StocktakeToast
          toast={toast}
          onDismiss={() => setToast(null)}
          onLocate={locateInTable}
        />
      ) : null}

      {/* Saved counts switcher */}
      <SectionCard
        title="Saved counts"
        subtitle="Switch between an existing physical count or start a new one."
      >
        <div className="max-w-xl">
          <label className="block text-[13px] font-semibold text-[var(--sl-text-header)]">
            Open a count
            <select
              aria-label="Open a count"
              className="sl-input mt-1.5 min-h-[38px] w-full"
              value={selected ?? ''}
              disabled={busy}
              onChange={e => setParams(e.target.value ? { count: e.target.value } : {})}
            >
              <option value="">Start a new count</option>
              {saved.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.kind} · {s.location} · {s.status.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
        </div>
      </SectionCard>

      {/* New count creation form */}
      {!selected ? (
        <SectionCard
          title="Start a physical count"
          subtitle="Save a snapshot list of physical items to check. Active loans stay separate and nothing is marked lost automatically."
        >
          <form onSubmit={start} noValidate className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="block text-[13px] font-semibold text-[var(--sl-text-header)] md:col-span-1">
                Count name
                <input
                  ref={nameInput}
                  required
                  maxLength={200}
                  aria-invalid={Boolean(nameError)}
                  className={`sl-input mt-1.5 min-h-[38px] w-full ${nameError ? 'border-[#b42318] ring-1 ring-[#b42318]' : ''}`}
                  value={name}
                  onChange={e => {
                    setName(e.target.value)
                    if (nameError) setNameError('')
                  }}
                  placeholder="November Shelf 3B count"
                />
                {nameError ? (
                  <span className="mt-1 block text-xs font-medium text-[#b42318] dark:text-[#fca5a5]">
                    {nameError}
                  </span>
                ) : null}
              </label>

              <label className="block text-[13px] font-semibold text-[var(--sl-text-header)]">
                Collection
                <select
                  className="sl-input mt-1.5 min-h-[38px] w-full"
                  value={kind}
                  onChange={e => setKind(e.target.value)}
                >
                  <option value="both">Books and research</option>
                  <option value="book">Books</option>
                  <option value="research">Research</option>
                </select>
              </label>

              <label className="block text-[13px] font-semibold text-[var(--sl-text-header)]">
                Count scope
                <select
                  className="sl-input mt-1.5 min-h-[38px] w-full"
                  value={scope}
                  onChange={e => setScope(e.target.value)}
                >
                  <option value="">All locations</option>
                  {locations.map(l => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sl-border)] pt-4">
              <p className="text-xs text-[var(--sl-text-secondary)]">
                This saves a list of physical items to check. Loans remain separate. Nothing is marked lost automatically.
              </p>
              <Button type="submit" disabled={busy}>
                <Play size={15} aria-hidden="true" />
                {busy ? 'Starting…' : 'Start inventory now'}
              </Button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      {selected && !data ? (
        <Card className="p-5">
          <p role="status" className="text-sm font-medium text-[var(--sl-text-secondary)]">
            {busy ? 'Opening saved count…' : 'Select another count or refresh to try again.'}
          </p>
        </Card>
      ) : null}

      {data ? (
        <>
          {/* Active Session Overview + Clickable KPI Grid + Toolbar */}
          <SectionCard
            title={data.session.session_name}
            subtitle={`${data.session.asset_kind === 'both' ? 'Books and research' : data.session.asset_kind === 'book' ? 'Books' : 'Research'} · ${data.session.scope_label} · ${data.session.status.replaceAll('_', ' ')}`}
            action={
              <>
                <StatusBadge status={data.session.status} />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      setData(await stocktakeApi.get(currentId!))
                      setChecked(false)
                      showToast({
                        tone: 'info',
                        title: 'Count refreshed',
                        text: 'Latest count loaded.',
                      })
                      await loadList()
                    })
                  }
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  Refresh count
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await stocktakeApi.download(currentId!, 'csv')
                      showToast({
                        tone: 'info',
                        title: 'CSV downloaded',
                        text: `Saved stocktake-${currentId}.csv to your downloads folder.`,
                      })
                    })
                  }
                >
                  <FileSpreadsheet size={14} aria-hidden="true" />
                  Download CSV
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await stocktakeApi.download(currentId!, 'pdf')
                      showToast({
                        tone: 'info',
                        title: 'PDF downloaded',
                        text: `Saved stocktake-${currentId}.pdf to your downloads folder.`,
                      })
                    })
                  }
                >
                  <FileText size={14} aria-hidden="true" />
                  Download PDF
                </Button>
                {active && !review && !cancel ? (
                  <>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          setData(await stocktakeApi.get(currentId!))
                          setChecked(false)
                          setReview(true)
                        })
                      }
                    >
                      <ClipboardCheck size={14} aria-hidden="true" />
                      Review and finish
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => setCancel(true)}
                      className="text-[#b42318] hover:bg-[#fef2f2] hover:text-[#991b1b] dark:text-[#fca5a5]"
                    >
                      <XCircle size={14} aria-hidden="true" />
                      Cancel count
                    </Button>
                  </>
                ) : null}
              </>
            }
          >
            {data.legacy ? (
              <div className="mb-4 flex items-start gap-2 rounded-[8px] border border-[#fde68a] bg-[#fffbeb] px-3.5 py-2.5 text-xs font-medium text-[#92400e] dark:border-[rgba(251,191,36,0.35)] dark:bg-[rgba(180,83,9,0.24)] dark:text-[#fcd34d]">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  Earlier count. Its original records are preserved; live details may reflect later inventory changes.
                </span>
              </div>
            ) : null}

            {/* Live Progress Bar */}
            <div className="mb-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--sl-text-header)]">
                  Shelf progress · {foundCount} of {expectedCount} expected items verified
                </span>
                <span className="font-mono font-bold tabular-nums text-[#0b5ea2] dark:text-[#93c5fd]">
                  {progressPct}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--sl-bg-muted)]">
                <div
                  className="h-full rounded-full bg-[#0b5ea2] transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Interactive KPI tiles — clicking any tile filters the table directly */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {(
                [
                  { label: 'Expected', value: data.report.summary.expected, tab: 'all' as TableTab, accent: '' },
                  {
                    label: 'Found',
                    value: data.report.summary.found,
                    tab: 'scanned' as TableTab,
                    accent: 'border-l-[3px] border-l-[#166534]',
                  },
                  {
                    label: 'Not yet checked',
                    value: data.report.summary.notChecked,
                    tab: 'not_checked' as TableTab,
                    accent: '',
                  },
                  {
                    label: 'On loan / in use',
                    value: data.report.summary.onLoan,
                    tab: 'all' as TableTab,
                    accent: '',
                  },
                  {
                    label: 'Known lost',
                    value: data.report.summary.knownLost,
                    tab: 'all' as TableTab,
                    accent: data.report.summary.knownLost > 0 ? 'border-l-[3px] border-l-[#b42318]' : '',
                  },
                  {
                    label: 'Damaged / for repair',
                    value: data.report.summary.damaged,
                    tab: 'damaged' as TableTab,
                    accent: data.report.summary.damaged > 0 ? 'border-l-[3px] border-l-[#d97706]' : '',
                  },
                  {
                    label: 'Unknown scans',
                    value: data.report.summary.unknown,
                    tab: 'exceptions' as TableTab,
                    accent: data.report.summary.unknown > 0 ? 'border-l-[3px] border-l-[#b42318]' : '',
                  },
                  {
                    label: 'Outside scope',
                    value: data.report.summary.unexpected,
                    tab: 'exceptions' as TableTab,
                    accent: data.report.summary.unexpected > 0 ? 'border-l-[3px] border-l-[#d97706]' : '',
                  },
                ] as const
              ).map(metric => (
                <button
                  key={metric.label}
                  type="button"
                  onClick={() => jumpToTab(metric.tab)}
                  className={`rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-3 text-left transition-colors hover:border-[#0b5ea2] hover:bg-[var(--sl-bg-hover)] ${metric.accent}`}
                >
                  <span className="block text-[11px] font-semibold text-[var(--sl-text-secondary)]">
                    {metric.label}
                  </span>
                  <strong className="mt-1 block font-display text-xl font-bold tabular-nums text-[var(--sl-text-header)]">
                    {metric.value}
                  </strong>
                </button>
              ))}
            </div>

            <p className="mt-3 text-xs text-[var(--sl-text-secondary)]">
              Duplicates: <strong>{data.report.summary.duplicates}</strong> · Changed records:{' '}
              <strong>{data.report.summary.changed}</strong> · Archived:{' '}
              <strong>{data.report.summary.archived}</strong>. Damage is shown separately from the count result. Click any metric card above to jump to those items.
            </p>
          </SectionCard>

          {/* Review & Finish panel */}
          {review && active ? (
            <SectionCard
              title="Review before finishing"
              subtitle="Confirm your follow-up note to lock this stocktake into a permanent historical report."
            >
              <div className="space-y-4">
                <p className="text-sm text-[var(--sl-text-secondary)]">
                  Review the item list and findings below. Not yet checked means a physical check is still needed. Finishing saves this report permanently. Exceptions remain for follow-up; holdings, loans and fines stay unchanged.
                </p>

                <label className="block text-[13px] font-semibold text-[var(--sl-text-header)]">
                  Review note
                  <textarea
                    className="sl-input mt-1.5 min-h-24 w-full py-2"
                    maxLength={500}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Describe follow-up for any unchecked items or exceptions."
                  />
                </label>

                <label className="flex cursor-pointer items-start gap-2.5 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-3 text-sm text-[var(--sl-text-header)]">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[#0b5ea2]"
                    checked={checked}
                    onChange={e => setChecked(e.target.checked)}
                  />
                  <span>I reviewed the results and will follow up any exceptions.</span>
                </label>

                {(!note.trim() || !checked) ? (
                  <p className="text-xs font-medium text-[#92400e] dark:text-[#fcd34d]">
                    To finish:{' '}
                    {[
                      !note.trim() && 'enter a follow-up review note',
                      !checked && 'tick the confirmation box above',
                    ]
                      .filter(Boolean)
                      .join(' and ')}
                    .
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    disabled={busy || !checked || !note.trim()}
                    onClick={() =>
                      void run(async () => {
                        setData(
                          await stocktakeApi.finish(currentId!, {
                            reviewToken: data.reviewToken,
                            reviewed: checked,
                            note,
                          }),
                        )
                        setReview(false)
                        showToast({
                          tone: 'success',
                          title: 'Stocktake completed',
                          text: 'Stocktake finished. Historical report saved.',
                        })
                        await loadList()
                      })
                    }
                  >
                    <CheckCircle2 size={15} aria-hidden="true" />
                    Finish and save report
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => setReview(false)}>
                    Keep counting
                  </Button>
                </div>
              </div>
            </SectionCard>
          ) : null}

          {/* Cancel panel */}
          {cancel && active ? (
            <SectionCard
              title="Cancel this count"
              subtitle="Keep its scan history and leave all holdings unchanged."
            >
              <div className="space-y-3">
                <label className="block text-[13px] font-semibold text-[var(--sl-text-header)]">
                  Reason
                  <textarea
                    className="sl-input mt-1.5 min-h-20 w-full py-2"
                    maxLength={500}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Explain why this count is being cancelled."
                  />
                </label>
                {!reason.trim() ? (
                  <p className="text-xs text-[var(--sl-text-muted)]">
                    Enter a brief reason to enable Confirm cancellation.
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="danger"
                    disabled={busy || !reason.trim()}
                    onClick={() =>
                      void run(async () => {
                        setData(await stocktakeApi.cancel(currentId!, reason))
                        setCancel(false)
                        showToast({
                          tone: 'info',
                          title: 'Count cancelled',
                          text: 'Count cancelled. Scan history was kept and all holdings remain unchanged.',
                        })
                        await loadList()
                      })
                    }
                  >
                    Confirm cancellation
                  </Button>
                  <Button variant="secondary" onClick={() => setCancel(false)}>
                    Keep counting
                  </Button>
                </div>
              </div>
            </SectionCard>
          ) : null}

          {/* Active Scan Workspace */}
          {active && !review && !cancel ? (
            <SectionCard
              title="Scan physical items"
              subtitle="Scan with your webcam (asks for condition per book) or use Barcode to PC / manual entry."
            >
              <form onSubmit={scan} noValidate className="space-y-5">
                {/* Step 1: Shelf & Label Type */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="block text-[13px] font-semibold text-[var(--sl-text-header)]">
                    Location being checked
                    <input
                      ref={locationInput}
                      required
                      list="stocktake-locations"
                      aria-invalid={Boolean(scanFieldErrors.location)}
                      className={`sl-input mt-1.5 min-h-[38px] w-full ${
                        scanFieldErrors.location ? 'border-[#b42318] ring-1 ring-[#b42318]' : ''
                      }`}
                      maxLength={100}
                      value={location}
                      onChange={e => {
                        setLocation(e.target.value)
                        if (scanFieldErrors.location) {
                          setScanFieldErrors(prev => ({ ...prev, location: undefined }))
                        }
                      }}
                    />
                    <datalist id="stocktake-locations">
                      {locations.map(l => (
                        <option key={l} value={l} />
                      ))}
                    </datalist>
                    {scanFieldErrors.location ? (
                      <span className="mt-1 block text-xs font-medium text-[#b42318] dark:text-[#fca5a5]">
                        {scanFieldErrors.location}
                      </span>
                    ) : null}
                  </label>

                  <label className="block text-[13px] font-semibold text-[var(--sl-text-header)]">
                    Label type
                    <select
                      className="sl-input mt-1.5 min-h-[38px] w-full"
                      value={codeType}
                      onChange={e => setCodeType(e.target.value)}
                    >
                      <option value="barcode">Copy barcode</option>
                      <option value="accession">Accession number</option>
                    </select>
                  </label>

                  <label className="block text-[13px] font-semibold text-[var(--sl-text-header)]">
                    Observed condition
                    <select
                      ref={conditionSelect}
                      required
                      disabled={busy}
                      aria-invalid={Boolean(scanFieldErrors.condition)}
                      className={`sl-input mt-1.5 min-h-[38px] w-full ${
                        scanFieldErrors.condition ? 'border-[#b42318] ring-1 ring-[#b42318]' : ''
                      }`}
                      value={condition}
                      onChange={e => {
                        setCondition(e.target.value)
                        if (scanFieldErrors.condition) {
                          setScanFieldErrors(prev => ({ ...prev, condition: undefined }))
                        }
                        requestAnimationFrame(() => scanInput.current?.focus())
                      }}
                    >
                      <option value="">Choose the item’s condition</option>
                      <option value="good">Good</option>
                      <option value="fair">Worn but usable</option>
                      <option value="for_repair">Needs repair</option>
                      <option value="damaged">Damaged beyond repair</option>
                    </select>
                    {scanFieldErrors.condition ? (
                      <span className="mt-1 block text-xs font-medium text-[#b42318] dark:text-[#fca5a5]">
                        {scanFieldErrors.condition}
                      </span>
                    ) : null}
                  </label>
                </div>

                {/* Two clear scan paths side-by-side / stacked */}
                <div className="grid gap-4 lg:grid-cols-12">
                  {/* Webcam Scanner Panel */}
                  <div className="space-y-3 rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-4 lg:col-span-7">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-[var(--sl-text-header)]">
                          Webcam barcode scanner
                        </h3>
                        <p className="text-xs text-[var(--sl-text-secondary)]">
                          {location.trim()
                            ? 'The camera reads the copy label, then asks for the book’s condition. Damaged books are saved to the inventory lists.'
                            : 'Choose the location being checked first.'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant={cameraOn ? 'secondary' : 'primary'}
                          disabled={busy || !location.trim()}
                          onClick={() => setCameraOn(on => !on)}
                        >
                          <Camera size={15} aria-hidden="true" />
                          {cameraOn ? 'Stop camera' : 'Scan with camera'}
                        </Button>
                        <label
                          className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-[6px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3.5 py-2 text-sm font-semibold text-[var(--sl-text-header)] shadow-[var(--sl-shadow-xs)] transition-colors ${
                            busy || imageScanBusy || !location.trim()
                              ? 'cursor-not-allowed opacity-45'
                              : 'cursor-pointer hover:bg-[var(--sl-bg-hover)]'
                          }`}
                        >
                          <ImageUp size={15} className="text-[#0b5ea2] dark:text-[#93c5fd]" aria-hidden="true" />
                          <span>{imageScanBusy ? 'Reading image…' : 'Upload barcode image'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            disabled={busy || imageScanBusy || !location.trim()}
                            onChange={e => void handleDirectBarcodeImageUpload(e)}
                          />
                        </label>
                      </div>
                    </div>

                    {cameraOn ? (
                      <StocktakeCameraScanner paused={Boolean(detected)} onDetected={cameraDetected} />
                    ) : null}
                  </div>

                  {/* Manual / Barcode to PC Panel */}
                  <div className="flex flex-col justify-between space-y-3 rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-4 lg:col-span-5">
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-sm font-bold text-[var(--sl-text-header)]">
                          Barcode to PC or manual entry
                        </h3>
                        <p className="text-xs text-[var(--sl-text-secondary)]">
                          Uses the Observed condition above. Change it before scanning an item in a different condition. The camera asks for each book&rsquo;s condition instead.
                        </p>
                      </div>

                      <label className="block text-[13px] font-semibold text-[var(--sl-text-header)]">
                        Scan barcode or enter accession
                        <input
                          ref={scanInput}
                          disabled={busy}
                          required
                          aria-invalid={Boolean(scanFieldErrors.code)}
                          className={`sl-input mt-1.5 min-h-[42px] w-full font-mono text-sm ${
                            scanFieldErrors.code ? 'border-[#b42318] ring-1 ring-[#b42318]' : ''
                          }`}
                          autoComplete="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          maxLength={100}
                          placeholder="e.g. STIORMOC2026000008"
                          value={code}
                          onChange={e => {
                            setCode(e.target.value)
                            if (scanFieldErrors.code) {
                              setScanFieldErrors(prev => ({ ...prev, code: undefined }))
                            }
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              if (!busy) scan(e)
                            }
                          }}
                          aria-describedby="scan-help"
                        />
                        {scanFieldErrors.code ? (
                          <span className="mt-1 block text-xs font-medium text-[#b42318] dark:text-[#fca5a5]">
                            {scanFieldErrors.code}
                          </span>
                        ) : null}
                      </label>

                      <p id="scan-help" className="text-xs text-[var(--sl-text-secondary)]">
                        Barcode to PC sends the code here, then Enter saves it. Leading zeros are kept. Scan one item at a time.
                      </p>
                    </div>

                    <div className="space-y-2 border-t border-[var(--sl-border)] pt-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Button type="submit" disabled={busy}>
                          <ScanBarcode size={15} aria-hidden="true" />
                          {busy ? 'Saving scan…' : 'Record item'}
                        </Button>
                        {missingScanFields.length > 0 ? (
                          <span className="text-[11px] font-medium text-[#92400e] dark:text-[#fcd34d]">
                            Needed: {missingScanFields.join(' · ')}
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-[#166534] dark:text-[#86efac]">
                            Ready · {location} · {formatConditionLabel(condition)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Unified Live Recent Scans Strip (Camera + Manual/USB) */}
                {recentScans.length > 0 ? (
                  <div className="space-y-2 rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--sl-text-secondary)]">
                        Recent scans in this session ({recentScans.length})
                      </p>
                      <span className="text-[11px] text-[var(--sl-text-muted)]">
                        Click Locate to highlight any scanned item in the table below
                      </span>
                    </div>
                    <ul aria-label="Recent camera scans" className="space-y-1.5 text-sm">
                      {recentScans.map(entry => (
                        <li
                          key={entry.id}
                          className={`flex flex-wrap items-center justify-between gap-2 rounded-[8px] border px-3 py-2 text-xs ${
                            entry.tone === 'error'
                              ? 'border-[#fecaca] bg-[#fef2f2] text-[#991b1b] dark:border-[rgba(248,113,113,0.35)] dark:bg-[rgba(180,35,24,0.22)] dark:text-[#fca5a5]'
                              : entry.tone === 'warn'
                                ? 'border-[#fde68a] bg-[#fffbeb] text-[#92400e] dark:border-[rgba(251,191,36,0.35)] dark:bg-[rgba(180,83,9,0.24)] dark:text-[#fcd34d]'
                                : 'border-[#bbf7d0] bg-[#f0fdf4] text-[#166534] dark:border-[rgba(74,222,128,0.35)] dark:bg-[rgba(22,101,52,0.24)] dark:text-[#86efac]'
                          }`}
                        >
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                            <span className="font-bold">{entry.label}</span>
                            <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-semibold dark:bg-white/10">
                              {entry.statusText}
                            </span>
                            <span className="opacity-75">· {entry.at}</span>
                            {entry.link ? (
                              <Link to={entry.link.to} className="font-semibold underline">
                                {entry.link.label}
                              </Link>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => locateInTable({ code: entry.code, bucket: entry.bucket })}
                            className="inline-flex shrink-0 items-center gap-1 rounded-[5px] border border-current/25 bg-white/60 px-2 py-1 text-[11px] font-semibold hover:bg-white dark:bg-black/20"
                          >
                            <LocateFixed size={12} aria-hidden="true" />
                            Locate
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </form>
            </SectionCard>
          ) : null}

          {data.reviewNote ? (
            <Card className="border-l-4 border-l-[#0b5ea2] p-4 text-sm">
              <strong className="text-[var(--sl-text-header)]">Review note:</strong>{' '}
              <span className="text-[var(--sl-text-secondary)]">{data.reviewNote}</span>
            </Card>
          ) : null}

          {/* Tabbed, Scanned-First Physical Item Results Table */}
          <div ref={resultsSectionRef}>
            <SectionCard
              title="Physical item results"
              subtitle="Scanned items float to the top automatically. Switch tabs to focus on scanned, unchecked, damaged, or outside-scope items."
              action={
                activeTab !== 'exceptions' ? (
                  <button
                    type="button"
                    aria-pressed={scannedFirst}
                    onClick={() => {
                      setScannedFirst(v => !v)
                      setPage(1)
                    }}
                    className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      scannedFirst
                        ? 'border-[#0b5ea2] bg-[rgba(11,94,162,0.10)] text-[#0b5ea2] dark:border-[#38bdf8] dark:bg-[rgba(56,146,224,0.22)] dark:text-[#93c5fd]'
                        : 'border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text-secondary)] hover:bg-[var(--sl-bg-subtle)]'
                    }`}
                  >
                    <ArrowUpDown size={13} aria-hidden="true" />
                    {scannedFirst ? 'Scanned items first: On' : 'Scanned items first: Off'}
                  </button>
                ) : null
              }
            >
              {/* Filter Tabs + Search Bar */}
              <div className="mb-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter stocktake items">
                  {(
                    [
                      { id: 'all' as TableTab, label: 'All items', count: tabCounts.all },
                      { id: 'scanned' as TableTab, label: 'Scanned / Found', count: tabCounts.scanned },
                      { id: 'not_checked' as TableTab, label: 'Not yet checked', count: tabCounts.not_checked },
                      { id: 'exceptions' as TableTab, label: 'Outside scope & Unknown', count: tabCounts.exceptions },
                      { id: 'damaged' as TableTab, label: 'Damaged / Repair', count: tabCounts.damaged },
                      { id: 'changed' as TableTab, label: 'Changed', count: tabCounts.changed },
                    ] as const
                  ).map(tab => {
                    const isSelected = activeTab === tab.id
                    const highlightAlert = tab.id === 'exceptions' && tab.count > 0 && !isSelected
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={isSelected}
                        onClick={() => {
                          setActiveTab(tab.id)
                          setPage(1)
                        }}
                        className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-[6px] border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          isSelected
                            ? 'border-[#0b5ea2] bg-[#0b5ea2] text-white shadow-[var(--sl-shadow-xs)]'
                            : highlightAlert
                              ? 'border-[#d97706] bg-[#fffbeb] text-[#92400e] hover:bg-[#fef3c7] dark:border-[#fbbf24] dark:bg-[rgba(180,83,9,0.24)] dark:text-[#fcd34d]'
                              : 'border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] text-[var(--sl-text-secondary)] hover:bg-[var(--sl-bg-hover)] hover:text-[var(--sl-text-header)]'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-black/5 text-current dark:bg-white/10'
                          }`}
                        >
                          {tab.count}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="relative block w-full sm:max-w-md">
                    <span className="sr-only">Find a title, code or result</span>
                    <Search
                      size={15}
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sl-text-muted)]"
                    />
                    <input
                      aria-label="Find a title, code or result"
                      placeholder="Find a title, accession, barcode, shelf, or result…"
                      className="sl-input min-h-[38px] w-full pl-9 pr-9"
                      value={filter}
                      onChange={e => {
                        setFilter(e.target.value)
                        setPage(1)
                      }}
                    />
                    {filter ? (
                      <button
                        type="button"
                        aria-label="Clear search"
                        onClick={() => {
                          setFilter('')
                          setPage(1)
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--sl-text-muted)] hover:text-[var(--sl-text-header)]"
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    ) : null}
                  </label>

                  {lastScannedCode ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--sl-info-soft)] px-3 py-1 text-xs font-semibold text-[#0b5ea2] dark:text-[#93c5fd]">
                      <LocateFixed size={13} aria-hidden="true" />
                      Last scanned: <span className="font-mono">{lastScannedCode}</span>
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Dedicated Outside scope & Unknown scans table */}
              {activeTab === 'exceptions' ? (
                <div className="overflow-x-auto rounded-[8px] border border-[var(--sl-border)]">
                  <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] text-[11px] font-bold uppercase tracking-wider text-[var(--sl-text-secondary)]">
                        <th className="px-3.5 py-2.5">Scanned Item</th>
                        <th className="px-3.5 py-2.5">Accession / Barcode</th>
                        <th className="px-3.5 py-2.5">Shelf Mismatch</th>
                        <th className="px-3.5 py-2.5">Result</th>
                        <th className="px-3.5 py-2.5">Observed Condition</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--sl-border)]">
                      {visibleExceptions.map(ex => {
                        const isJustScanned =
                          lastScannedCode !== null &&
                          (ex.code === lastScannedCode || ex.accession === lastScannedCode)
                        return (
                          <tr
                            key={ex.key}
                            className={
                              isJustScanned
                                ? 'bg-[rgba(11,94,162,0.08)] dark:bg-[rgba(56,146,224,0.16)]'
                                : 'hover:bg-[var(--sl-bg-subtle)]'
                            }
                          >
                            <td className="px-3.5 py-3">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-[var(--sl-text-header)]">
                                  {ex.title ?? 'Unrecognized label'}
                                </span>
                                {isJustScanned ? (
                                  <span className="rounded-full bg-[#0b5ea2] px-2 py-0.5 text-[10px] font-bold text-white">
                                    Just scanned
                                  </span>
                                ) : null}
                              </div>
                              {ex.kind ? (
                                <span className="block text-xs capitalize text-[var(--sl-text-muted)]">
                                  {ex.kind}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3.5 py-3 font-mono text-xs tabular-nums">
                              {ex.accession ? (
                                <span className="block font-semibold text-[var(--sl-text-header)]">
                                  {ex.accession}
                                </span>
                              ) : null}
                              <span className="block text-[var(--sl-text-secondary)]">{ex.code}</span>
                            </td>
                            <td className="px-3.5 py-3 text-xs">
                              {ex.codeType === 'unexpected' ? (
                                <div className="space-y-0.5">
                                  <span className="block text-[var(--sl-text-secondary)]">
                                    Home: <strong className="text-[var(--sl-text-header)]">{ex.homeShelf || 'Unassigned'}</strong>
                                  </span>
                                  <span className="block text-[#92400e] dark:text-[#fcd34d]">
                                    Scanned at: <strong>{ex.scannedAt || 'Unknown'}</strong>
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[var(--sl-text-secondary)]">
                                  Scanned at <strong>{ex.scannedAt || 'Unknown'}</strong>
                                </span>
                              )}
                            </td>
                            <td className="px-3.5 py-3">
                              <StatusBadge
                                status={ex.codeType === 'unknown' ? 'Unrecognized' : 'Outside scope'}
                                tone={ex.codeType === 'unknown' ? 'error' : 'warning'}
                              />
                              <span className="mt-1 block text-[11px] text-[var(--sl-text-muted)]">{ex.label}</span>
                            </td>
                            <td className="px-3.5 py-3 text-xs font-medium text-[var(--sl-text-header)]">
                              {ex.observedCondition ? formatConditionLabel(ex.observedCondition) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {!filteredExceptions.length ? (
                    <p className="p-6 text-center text-sm text-[var(--sl-text-secondary)]">
                      No outside-scope or unrecognized scans in this count.
                    </p>
                  ) : null}
                </div>
              ) : (
                /* Main Expected Physical Items Table */
                <div className="overflow-x-auto rounded-[8px] border border-[var(--sl-border)]">
                  <table className="w-full min-w-[740px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] text-[11px] font-bold uppercase tracking-wider text-[var(--sl-text-secondary)]">
                        <th className="px-3.5 py-2.5">Item</th>
                        <th className="px-3.5 py-2.5">Accession / Barcode</th>
                        <th className="px-3.5 py-2.5">Location</th>
                        <th className="px-3.5 py-2.5">Result</th>
                        <th className="px-3.5 py-2.5">Condition</th>
                        <th className="px-3.5 py-2.5 text-right">Scans</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--sl-border)]">
                      {visibleRows.map(row => {
                        const isJustScanned =
                          lastScannedCode !== null &&
                          (row.original.barcode === lastScannedCode ||
                            row.original.accession === lastScannedCode)
                        return (
                          <tr
                            key={row.expectedId}
                            className={
                              isJustScanned
                                ? 'bg-[rgba(11,94,162,0.08)] dark:bg-[rgba(56,146,224,0.16)]'
                                : row.scans > 0
                                  ? 'bg-[#f0fdf4]/50 dark:bg-[rgba(22,101,52,0.10)]'
                                  : 'hover:bg-[var(--sl-bg-subtle)]'
                            }
                          >
                            <td className="px-3.5 py-3">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-[var(--sl-text-header)]">
                                  {row.original.title}
                                </span>
                                {isJustScanned ? (
                                  <span className="rounded-full bg-[#0b5ea2] px-2 py-0.5 text-[10px] font-bold text-white">
                                    Just scanned
                                  </span>
                                ) : null}
                              </div>
                              <span className="block text-xs capitalize text-[var(--sl-text-muted)]">
                                {row.original.kind}
                              </span>
                            </td>
                            <td className="px-3.5 py-3 font-mono text-xs tabular-nums">
                              <span className="block font-semibold text-[var(--sl-text-header)]">
                                {row.original.accession}
                              </span>
                              <span className="block text-[var(--sl-text-secondary)]">
                                {row.original.barcode}
                              </span>
                            </td>
                            <td className="px-3.5 py-3 text-xs font-medium text-[var(--sl-text-header)]">
                              {row.item.shelf}
                            </td>
                            <td className="px-3.5 py-3">
                              <StatusBadge status={row.outcome} tone={outcomeTone(row.outcome)} />
                              {row.changed ? (
                                <span className="mt-1 block text-[11px] font-medium text-[#92400e] dark:text-[#fcd34d]">
                                  Changed during count
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3.5 py-3">
                              <StatusBadge status={row.item.condition} />
                              {row.observedCondition ? (
                                <span className="mt-1 block text-[11px] text-[var(--sl-text-secondary)]">
                                  Observed: {row.observedCondition.replaceAll('_', ' ')}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3.5 py-3 text-right font-mono text-sm font-bold tabular-nums text-[var(--sl-text-header)]">
                              {row.scans}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {!filteredRows.length ? (
                    <p className="p-6 text-center text-sm text-[var(--sl-text-secondary)]">
                      {activeTab === 'scanned'
                        ? 'No expected items have been scanned in this count yet.'
                        : 'No items match this search.'}
                    </p>
                  ) : null}
                </div>
              )}

              {/* Pagination Footer */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-medium text-[var(--sl-text-secondary)]">
                  Page {safePage} of {pages} · {activeListCount} {activeListCount === 1 ? 'item' : 'items'}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={safePage <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={safePage >= pages}
                    onClick={() => setPage(p => Math.min(pages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Grouped, Collapsible Review Findings */}
          <SectionCard
            title={`Review findings (${data.report.findings.length})`}
            subtitle="Grouped by type so urgent exceptions stay clear without repeating routine items. No finding automatically changes an item."
            action={
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await stocktakeApi.download(currentId!, 'csv')
                    showToast({
                      tone: 'info',
                      title: 'CSV downloaded',
                      text: `Saved stocktake-${currentId}.csv to your downloads folder.`,
                    })
                  })
                }
              >
                <Download size={14} aria-hidden="true" />
                Export full list
              </Button>
            }
          >
            {groupedFindings.length === 0 ? (
              <p className="text-sm text-[var(--sl-text-secondary)]">No exceptions found.</p>
            ) : (
              <div className="space-y-2.5">
                {groupedFindings.map(([groupCode, items]) => {
                  const meta = FINDING_META[groupCode] ?? {
                    title: groupCode.replaceAll('_', ' '),
                    priority: 'routine' as const,
                    tone: 'warning' as const,
                  }
                  return (
                    <details
                      key={groupCode}
                      open={meta.priority === 'high'}
                      className="group rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[var(--sl-text-header)] hover:bg-[var(--sl-bg-hover)] rounded-[8px]">
                        <span className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={`${items.length} ${items.length === 1 ? 'item' : 'items'}`} tone={meta.tone} />
                          <span>{meta.title}</span>
                        </span>
                        <span className="text-xs font-medium text-[var(--sl-text-muted)] group-open:hidden">
                          Expand
                        </span>
                        <span className="hidden text-xs font-medium text-[var(--sl-text-muted)] group-open:inline">
                          Collapse
                        </span>
                      </summary>
                      <ul className="divide-y divide-[var(--sl-border)] border-t border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] px-4">
                        {items.slice(0, 50).map(entry => (
                          <li key={entry.key} className="py-2.5 text-xs">
                            <p className="font-semibold text-[var(--sl-text-header)]">{entry.subtitle}</p>
                            <p className="mt-0.5 text-[var(--sl-text-secondary)]">{entry.detail}</p>
                          </li>
                        ))}
                        {items.length > 50 ? (
                          <li className="py-2.5 text-xs font-medium text-[var(--sl-text-muted)]">
                            Showing first 50 of {items.length}. Download CSV or PDF for the complete list.
                          </li>
                        ) : null}
                      </ul>
                    </details>
                  )
                })}
              </div>
            )}
          </SectionCard>
        </>
      ) : null}

      {detected ? (
        <StocktakeConditionDialog
          code={detected.code}
          lookup={detected.lookup}
          saving={detected.saving}
          error={detected.error}
          onSave={chosenCondition => void saveDetected(chosenCondition)}
          onCancel={() => setDetected(null)}
        />
      ) : null}
    </div>
  )
}
