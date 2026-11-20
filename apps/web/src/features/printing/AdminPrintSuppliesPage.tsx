// ARCHIVED (revisions 2026-11-20): no longer routed or in the menu; /librarian/supplies redirects to
// Library setup -> Printing settings, which keeps paper sizes and prices (PrintingPaperSettings).
// Kept so stock tracking can be restored without rebuilding it.
import { Download, Droplets, PackageOpen, Plus, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { RowActions } from '../../components/RowActions'
import {
  Button,
  FormField,
  LumoDialog,
  NoticeBanner,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBadge,
} from '../../components/ui'
import { DeskDialog } from '../dashboard/DeskDialog'
import { usePaymentUpdates } from '../payments/payment-updates'
import { InkColorTypeDialog } from './InkColorTypeDialog'
import { InkEditDialog } from './InkEditDialog'
import { InkStockDialog } from './InkStockDialog'
import { paperSizeLabel } from './paper-size-presets'
import { PaperSizesDialog } from './PaperSizesDialog'
import { PaperStockDialog } from './PaperStockDialog'
import {
  printingApi,
  type ExpenseSummary,
  type FinanceFilters,
  type FinancePeriod,
  type InkColorType,
  type PaperStock,
  type RestockEntry,
  type RevenueEntry,
  type RevenueSummary,
  type StockUsageEntry,
  type SupplyData,
} from './printing-api'

type Selection = { kind: 'ink' | 'paper'; id: number; name: string; unit: 'bottles' | 'reams'; current: number }
type UsageSelection = { brandId?: number; kind: 'ink' | 'paper'; id: number; name: string; current: number }
type LedgerTab = 'revenue' | 'restocks' | 'usage'

function manilaToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function money(value: number | string | undefined) {
  return `₱${Number(value ?? 0).toFixed(2)}`
}

function whole(value: number | string | null | undefined, fallback = '0') {
  return value == null ? fallback : String(Math.trunc(Number(value)))
}

function manilaTimestamp(value: string) {
  return new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
}

function initialFilters(): FinanceFilters {
  const date = manilaToday()
  return { period: 'monthly', date, month: date.slice(0, 7), week: Math.min(4, Math.ceil(Number(date.slice(8, 10)) / 7)) }
}

export function AdminPrintSuppliesPage() {
  const [data, setData] = useState<SupplyData | null>(null)
  const [selected, setSelected] = useState<Selection | null>(null)
  const [usage, setUsage] = useState<UsageSelection | null>(null)
  const [showInk, setShowInk] = useState(false)
  const [newColor, setNewColor] = useState(false)
  const [paperStock, setPaperStock] = useState<number | null | undefined>(undefined)
  const [showPaperSizes, setShowPaperSizes] = useState(false)
  const [paperFilter, setPaperFilter] = useState('')
  const [inkTypes, setInkTypes] = useState<InkColorType[]>([])
  const [inkFilter, setInkFilter] = useState('')
  const [editingInk, setEditingInk] = useState<InkColorType | null>(null)
  const [editingPaper, setEditingPaper] = useState<number | undefined>(undefined)
  const [deletePaper, setDeletePaper] = useState<PaperStock | null>(null)
  const [deleteInk, setDeleteInk] = useState<{ id: number; name: string } | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [unitCost, setUnitCost] = useState('')
  const [modalError, setModalError] = useState('')
  const [filters, setFilters] = useState<FinanceFilters>(initialFilters)
  const [ledgerTab, setLedgerTab] = useState<LedgerTab>('revenue')
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null)
  const [revenueEntries, setRevenueEntries] = useState<RevenueEntry[]>([])
  const [expenses, setExpenses] = useState<ExpenseSummary | null>(null)
  const [restocks, setRestocks] = useState<RestockEntry[]>([])
  const [usageEntries, setUsageEntries] = useState<StockUsageEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [reportLoading, setReportLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState<'revenue' | 'stock' | 'inventory' | null>(null)
  const reportRequest = useRef(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadSupplies = async () => {
    if (!data) setLoading(true)
    try {
      const [fresh, types] = await Promise.all([printingApi.supplies(), printingApi.inkColorTypes()])
      setData(fresh)
      setInkTypes(types)
      setInkFilter(value => (types.some(type => type.cartridge_type === value) ? value : ''))
      setPaperFilter(value => (value && !fresh.paper.some(item => String(item.paper_stock_id) === value) ? '' : value))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load print supplies.')
    } finally {
      setLoading(false)
    }
  }

  const loadReports = async (current = filters) => {
    const request = ++reportRequest.current
    setReportLoading(true)
    try {
      const [r, re, ex, rh, uh] = await Promise.all([
        printingApi.revenueSummary(current),
        printingApi.revenueEntries(current),
        printingApi.expenseSummary(current),
        printingApi.restockHistory(current),
        printingApi.stockUsage(),
      ])
      if (request !== reportRequest.current) return
      setRevenue(r)
      setRevenueEntries(re)
      setExpenses(ex)
      setRestocks(rh)
      setUsageEntries(uh)
    } catch (e) {
      if (request === reportRequest.current) {
        setError(e instanceof Error ? e.message : 'Unable to load printing reports.')
      }
    } finally {
      if (request === reportRequest.current) setReportLoading(false)
    }
  }

  useEffect(() => {
    setError('')
    void loadSupplies()
  }, [])

  useEffect(() => {
    setError('')
    void loadReports(filters)
  }, [filters.period, filters.date, filters.month, filters.week])

  usePaymentUpdates(async () => {
    await Promise.all([loadSupplies(), loadReports()])
  })

  const openRestock = (selection: Selection) => {
    if (selection.kind === 'paper') {
      setPaperStock(selection.id)
      return
    }
    setSelected(selection)
    setQuantity(1)
    setUnitCost('')
    setModalError('')
    setError('')
    setSuccess('')
  }

  const submitRestock = async (e: FormEvent) => {
    e.preventDefault()
    if (!selected) return
    const parsedCost = Number(unitCost)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
      setModalError('Enter a whole quantity between 1 and 10,000.')
      return
    }
    if (!Number.isFinite(parsedCost) || parsedCost <= 0) {
      setModalError('Enter a valid cost greater than ₱0.00.')
      return
    }
    setSaving(true)
    setModalError('')
    setError('')
    setSuccess('')
    try {
      await printingApi.restock(selected.kind, selected.id, { quantity, unit_cost: parsedCost })
      setSuccess(`${quantity} ${selected.unit} added to ${selected.name}.`)
      setSelected(null)
      await Promise.all([loadSupplies(), loadReports()])
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Unable to save the restock. No stock was changed.')
    } finally {
      setSaving(false)
    }
  }

  const confirmUsage = async () => {
    if (!usage) return
    setSaving(true)
    setModalError('')
    setError('')
    setSuccess('')
    try {
      if (usage.kind === 'ink') await printingApi.useInkBottle(usage.id)
      else await printingApi.openPaperReam(usage.id, usage.brandId)
      setSuccess(
        usage.kind === 'ink'
          ? `One ${usage.name} bottle was recorded as loaded into the printer.`
          : `One ${usage.name} ream was recorded as opened.`,
      )
      setUsage(null)
      await Promise.all([loadSupplies(), loadReports()])
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Unable to update the supply stock.')
    } finally {
      setSaving(false)
    }
  }

  const confirmDeleteInk = async () => {
    if (!deleteInk || saving) return
    setSaving(true)
    setDeleteError('')
    try {
      await printingApi.deleteInk(deleteInk.id)
      await paperSaved(`${deleteInk.name} deleted. Purchase history retained.`)
      setDeleteInk(null)
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : 'Ink could not be deleted.')
    } finally {
      setSaving(false)
    }
  }

  const confirmDeletePaper = async () => {
    if (!deletePaper || saving) return
    setSaving(true)
    setDeleteError('')
    try {
      await printingApi.deletePaperSize(deletePaper.paper_stock_id, Number(deletePaper.configuration_version))
      await paperSaved(`${deletePaper.paper_size_dimension} paper deleted. Purchase and usage history retained.`)
      setDeletePaper(null)
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : 'Paper could not be deleted.')
    } finally {
      setSaving(false)
    }
  }

  const paperSaved = async (message: string) => {
    setSuccess(message)
    setError('')
    await Promise.all([loadSupplies(), loadReports()])
  }

  const refresh = async () => {
    setError('')
    await Promise.all([loadSupplies(), loadReports()])
  }

  const exportReport = async (kind: 'revenue' | 'stock' | 'inventory') => {
    setExporting(kind)
    setError('')
    try {
      if (kind === 'revenue') await printingApi.revenueReport(filters)
      else if (kind === 'stock') await printingApi.stockExpenseReport(filters)
      else await printingApi.supplyReport()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to export the report.')
    } finally {
      setExporting(null)
    }
  }

  const setMonth = (month: string) => setFilters(value => ({ ...value, month, date: `${month}-01` }))
  const totalExpense = Number((quantity * Number(unitCost || 0)).toFixed(2))
  const filteredInk = data?.ink.filter(row => !inkFilter || row.cartridge_type === inkFilter) ?? []
  const filteredPaper = data?.paper.filter(row => !paperFilter || String(row.paper_stock_id) === paperFilter) ?? []

  return (
    <>
      <PageHeader
        eyebrow="Printing inventory"
        title="Print supplies"
        description="Track ink bottles and bond paper stock, record restocks or usage, and review printing revenue and supply expenses separately."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={Boolean(exporting) || loading} onClick={() => void exportReport('inventory')}>
              <Download size={15} aria-hidden="true" />
              {exporting === 'inventory' ? 'Generating…' : 'Export current stock PDF'}
            </Button>
            <Button variant="secondary" onClick={() => setShowInk(true)}>
              <Plus size={15} aria-hidden="true" /> Add ink stock
            </Button>
            <Button variant="secondary" disabled={!data} onClick={() => setPaperStock(null)}>
              <Plus size={15} aria-hidden="true" /> Add paper stock
            </Button>
            <Button variant="secondary" onClick={() => void refresh()}>
              <RefreshCw size={15} aria-hidden="true" /> Refresh
            </Button>
          </div>
        }
      />

      {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
      {success ? <NoticeBanner tone="success">{success}</NoticeBanner> : null}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] px-4 py-3 text-xs text-[var(--sl-text-secondary)]">
        <p>
          Revenue includes cash and verified online printing amounts. User transaction fees, provider costs, and bank settlements are tracked separately.
        </p>
        <a
          className="inline-flex min-h-8 items-center font-semibold text-[#0b5ea2] underline dark:text-[#93c5fd]"
          href="/librarian/reports?kind=printRevenue"
        >
          View payment breakdown
        </a>
      </div>

      <details className="mb-5 rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-4 shadow-[var(--sl-shadow-xs)]">
        <summary className="min-h-9 cursor-pointer py-1 text-sm font-semibold text-[var(--sl-text-header)]">
          Manage supply types
        </summary>
        <p className="mt-2 text-xs text-[var(--sl-text-secondary)]">
          These choices define supply types. Use Restock on an existing item to add quantity.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setNewColor(true)}>
            Add new color type
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowPaperSizes(true)}>
            Add new paper size
          </Button>
        </div>
        {inkTypes.length > 0 || (data?.paper.length ?? 0) > 0 ? (
          <div className="mt-4 grid gap-4 border-t border-[var(--sl-border)] pt-3 sm:grid-cols-2">
            {inkTypes.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--sl-text-muted)]">
                  Edit saved ink types
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {inkTypes.map(type => (
                    <Button key={type.ink_color_type_id} variant="ghost" size="sm" onClick={() => setEditingInk(type)}>
                      Edit {type.cartridge_type} · {type.color_variation}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            {(data?.paper.length ?? 0) > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--sl-text-muted)]">
                  Edit saved paper sizes
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {data?.paper.map(size => (
                    <Button
                      key={size.paper_stock_id}
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingPaper(size.paper_stock_id)}
                    >
                      Edit {size.paper_size_dimension}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </details>

      <div className="mb-6 grid items-start gap-4 xl:grid-cols-2">
        <SectionCard className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sl-border)] px-5 py-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Ink bottles</h2>
              <p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">Unopened bottles currently on shelf</p>
            </div>
            <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
              Show ink type
              <select className="sl-input mt-1 w-48" value={inkFilter} onChange={event => setInkFilter(event.target.value)}>
                <option value="">All ink types</option>
                {[...new Set(inkTypes.map(type => type.cartridge_type))].map(type => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div role="region" aria-label="Ink stock list" className="divide-y divide-[var(--sl-border)]">
            {loading ? (
              <p className="p-8 text-center text-sm text-[var(--sl-text-secondary)]">Loading…</p>
            ) : filteredInk.length === 0 ? (
              <p className="p-8 text-center text-sm font-semibold text-[var(--sl-text-header)]">No ink bottle records.</p>
            ) : (
              filteredInk.map(row => {
                const label = `${row.brand ?? ''} ${row.cartridge_type} ${row.color_variation}`.replace(/\s+/g, ' ').trim()
                const cannotDelete = Number(row.available_bottles) !== 0
                return (
                  <div key={row.ink_id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <span className="rounded-[8px] bg-[#0b5ea2]/10 p-2.5 text-[#0b5ea2] dark:bg-white/10 dark:text-[#93c5fd]">
                      <Droplets size={18} aria-hidden="true" />
                    </span>
                    <div className="min-w-44 flex-1">
                      <p className="font-semibold text-[var(--sl-text-header)]">
                        {row.brand ? `${row.brand} · ` : ''}
                        {row.cartridge_type} · {row.color_variation}
                      </p>
                      <p className="text-xs text-[var(--sl-text-muted)]">
                        Low-stock alert at {row.low_stock_threshold_bottles} bottles
                      </p>
                    </div>
                    <div className="text-right tabular-nums">
                      <p className="text-lg font-bold text-[var(--sl-text-header)]">{row.available_bottles}</p>
                      <p className="text-xs text-[var(--sl-text-muted)]">unopened bottles</p>
                    </div>
                    <StatusBadge status={Number(row.is_low) ? 'Low stock' : 'In stock'} />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={Number(row.available_bottles) < 1}
                        onClick={() => {
                          setModalError('')
                          setUsage({
                            kind: 'ink',
                            id: row.ink_id,
                            name: `${row.cartridge_type} ${row.color_variation}`,
                            current: Number(row.available_bottles),
                          })
                        }}
                      >
                        Use one bottle
                      </Button>
                      <Button
                        size="sm"
                        onClick={() =>
                          openRestock({
                            kind: 'ink',
                            id: row.ink_id,
                            name: `${row.cartridge_type} ${row.color_variation}`,
                            unit: 'bottles',
                            current: Number(row.available_bottles),
                          })
                        }
                      >
                        Restock
                      </Button>
                      <RowActions label={`More actions for ${label}`}>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={cannotDelete}
                          aria-label={`Delete ${label}`}
                          onClick={() => {
                            setDeleteInk({ id: row.ink_id, name: label })
                            setDeleteError('')
                          }}
                        >
                          Delete
                        </Button>
                        {cannotDelete ? (
                          <p className="px-2 py-1 text-[11px] text-[var(--sl-text-muted)]">
                            Deplete stock to 0 before deleting.
                          </p>
                        ) : null}
                      </RowActions>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </SectionCard>

        <SectionCard className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sl-border)] px-5 py-4">
            <div>
              <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Bond paper</h2>
              <p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">Ream stock and page pricing by paper size</p>
            </div>
            <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
              Show paper size
              <select
                className="sl-input mt-1 w-48"
                value={paperFilter}
                onChange={event => setPaperFilter(event.target.value)}
              >
                <option value="">All paper sizes</option>
                {data?.paper.map(size => (
                  <option key={size.paper_stock_id} value={size.paper_stock_id}>
                    {paperSizeLabel(size.paper_size_dimension, size)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div role="region" aria-label="Paper stock list" className="divide-y divide-[var(--sl-border)]">
            {loading ? (
              <p className="p-8 text-center text-sm text-[var(--sl-text-secondary)]">Loading…</p>
            ) : filteredPaper.length === 0 ? (
              <p className="p-8 text-center text-sm font-semibold text-[var(--sl-text-header)]">No paper records.</p>
            ) : (
              filteredPaper.map(row => {
                const cannotDelete =
                  saving ||
                  Number(row.unopened_reams) !== 0 ||
                  Number(row.remaining_reams) !== 0 ||
                  !row.configuration_version
                return (
                  <div key={row.paper_stock_id} className="space-y-3 px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-2.5">
                        <span className="self-start rounded-[8px] bg-[#0b5ea2]/10 p-2 text-[#0b5ea2] dark:bg-white/10 dark:text-[#93c5fd]">
                          <PackageOpen size={16} aria-hidden="true" />
                        </span>
                        <div className="min-w-0 break-words">
                          <p className="font-semibold text-[var(--sl-text-header)]">{row.paper_size_dimension} bond paper</p>
                          {row.is_active === false ? (
                            <p className="mt-0.5 text-xs font-semibold text-[var(--sl-warning-text)]">
                              Unavailable for new print requests
                            </p>
                          ) : null}
                          <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)] tabular-nums">
                            Avg. {money(row.average_expense_cost)}/ream · {row.sheets_per_ream ?? 500} sheets/ream
                          </p>
                          <p className="text-xs text-[var(--sl-text-muted)]">
                            Alert at {Number(row.low_stock_threshold_reams)} reams
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-right">
                        <p className="text-base font-bold tabular-nums text-[var(--sl-text-header)]">
                          {Number(row.unopened_reams)}{' '}
                          <span className="text-xs font-normal text-[var(--sl-text-muted)]">reams</span>
                        </p>
                        <StatusBadge status={Number(row.is_low) ? 'Low stock' : 'In stock'} />
                      </div>
                    </div>

                    {row.brands?.length ? (
                      <div className="space-y-2">
                        {row.brands.map(brand => (
                          <div
                            key={brand.paper_brand_stock_id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] px-3 py-2.5"
                          >
                            <div className="min-w-0 text-xs">
                              <p className="break-words font-semibold text-[var(--sl-text-header)]">
                                {brand.brand}
                                {Number(row.loaded_paper_brand_stock_id) === Number(brand.paper_brand_stock_id) ? (
                                  <span className="ml-2 text-[#0b5ea2] dark:text-[#93c5fd]">Loaded for printing</span>
                                ) : null}
                              </p>
                              <p className="mt-0.5 tabular-nums text-[var(--sl-text-secondary)]">
                                Monochrome {brand.monochrome_price == null ? 'Not set' : money(Number(brand.monochrome_price))}/page · Colored{' '}
                                {brand.colored_price == null ? 'Not set' : money(Number(brand.colored_price))}/page
                              </p>
                              <p className="tabular-nums text-[var(--sl-text-muted)]">
                                {brand.unopened_reams} reams · Avg. {money(brand.average_expense_cost)}/ream
                              </p>
                            </div>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={Number(brand.unopened_reams) < 1}
                              onClick={() => {
                                setModalError('')
                                setUsage({
                                  kind: 'paper',
                                  id: row.paper_stock_id,
                                  brandId: brand.paper_brand_stock_id,
                                  name: `${brand.brand} ${row.paper_size_dimension}`,
                                  current: Number(brand.unopened_reams),
                                })
                              }}
                            >
                              Open one ream
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          openRestock({
                            kind: 'paper',
                            id: row.paper_stock_id,
                            name: `${row.paper_size_dimension} bond paper`,
                            unit: 'reams',
                            current: Number(row.unopened_reams),
                          })
                        }
                      >
                        Restock
                      </Button>
                      <RowActions label={`More actions for ${row.paper_size_dimension} paper`}>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={cannotDelete}
                          aria-label={`Delete ${row.paper_size_dimension} paper`}
                          onClick={() => {
                            setDeletePaper(row)
                            setDeleteError('')
                          }}
                        >
                          Delete
                        </Button>
                        {cannotDelete ? (
                          <p className="px-2 py-1 text-[11px] text-[var(--sl-text-muted)]">
                            Deplete stock to 0 before deleting.
                          </p>
                        ) : null}
                      </RowActions>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard className="mb-5 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
            Report period
            <select
              className="sl-input mt-1"
              value={filters.period}
              onChange={e => setFilters(value => ({ ...value, period: e.target.value as FinancePeriod }))}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          {filters.period === 'daily' ? (
            <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
              Date
              <input
                className="sl-input mt-1"
                type="date"
                value={filters.date}
                onChange={e => setFilters(value => ({ ...value, date: e.target.value, month: e.target.value.slice(0, 7) }))}
              />
            </label>
          ) : (
            <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
              Month
              <input className="sl-input mt-1" type="month" value={filters.month} onChange={e => setMonth(e.target.value)} />
            </label>
          )}
          {filters.period === 'weekly' ? (
            <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
              Week in month
              <select
                className="sl-input mt-1"
                value={filters.week}
                onChange={e => setFilters(value => ({ ...value, week: Number(e.target.value) }))}
              >
                {[1, 2, 3, 4].map(week => (
                  <option key={week} value={week}>
                    Week {week}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <p className="pb-2 text-xs font-medium text-[var(--sl-text-muted)]">
            {reportLoading ? 'Loading selected period…' : revenue?.label ?? 'Select a period'}
          </p>
          <div className="flex flex-wrap gap-2 lg:ml-auto">
            <Button variant="secondary" size="sm" disabled={Boolean(exporting)} onClick={() => void exportReport('revenue')}>
              <Download size={14} aria-hidden="true" />
              {exporting === 'revenue' ? 'Generating…' : 'Export revenue PDF'}
            </Button>
            <Button size="sm" disabled={Boolean(exporting)} onClick={() => void exportReport('stock')}>
              <Download size={14} aria-hidden="true" />
              {exporting === 'stock' ? 'Generating…' : 'Export stock expenses PDF'}
            </Button>
          </div>
        </div>
      </SectionCard>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Paid requests" value={String(revenue?.paid_requests ?? 0)} />
        <StatCard label="Sheets" value={String(revenue?.total_sheets ?? 0)} icon={PackageOpen} />
        <StatCard label="Copies" value={String(revenue?.total_copies ?? 0)} icon={PackageOpen} />
        <StatCard label="Printing revenue" value={money(revenue?.total_revenue)} tone="success" />
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Restock entries" value={String(expenses?.restock_entries ?? 0)} icon={RefreshCw} />
        <StatCard label="Ink restock costs" value={money(expenses?.ink_expenses)} icon={Droplets} />
        <StatCard label="Paper restock costs" value={money(expenses?.paper_expenses)} icon={PackageOpen} />
        <StatCard label="Total restock expenses" value={money(expenses?.total_expenses)} />
      </div>

      <SectionCard className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sl-border)] px-5 pt-3">
          <nav aria-label="Printing supply logs" className="flex flex-wrap gap-1">
            {(
              [
                ['revenue', `Revenue details (${revenueEntries.length})`],
                ['restocks', `Restock history (${restocks.length})`],
                ['usage', `Manual stock usage (${usageEntries.length})`],
              ] as Array<[LedgerTab, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={ledgerTab === key}
                onClick={() => setLedgerTab(key)}
                className={`-mb-px inline-flex min-h-10 items-center border-b-2 px-3.5 py-2 text-sm font-semibold transition-colors ${
                  ledgerTab === key
                    ? 'border-[#0b5ea2] text-[#0b5ea2] dark:border-[#93c5fd] dark:text-[#93c5fd]'
                    : 'border-transparent text-[var(--sl-text-secondary)] hover:border-[var(--sl-border-strong)] hover:text-[var(--sl-text-header)]'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        {ledgerTab === 'revenue' ? (
          <>
            <div className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] px-5 py-2.5 text-xs text-[var(--sl-text-secondary)]">
              Confirmed cash and online printing payments. Updates after payment changes and every 30 seconds while this page is visible.
            </div>
            <ResponsiveTable label="Printing revenue details">
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-elevated)]">
                  <tr>
                    {['Date', 'Request', 'Borrower', 'File', 'Type', 'Paper', 'Pages', 'Copies', 'Sheets', 'Payment method', 'Revenue'].map(
                      label => (
                        <th key={label} scope="col" className="px-3.5 py-2.5">
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--sl-border)]">
                  {reportLoading ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-sm text-[var(--sl-text-secondary)]">
                        Loading revenue…
                      </td>
                    </tr>
                  ) : revenueEntries.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-sm font-semibold text-[var(--sl-text-header)]">
                        No paid printing requests for this period.
                      </td>
                    </tr>
                  ) : (
                    revenueEntries.map((row, index) => (
                      <tr key={row.collection_id ?? `${row.request_id}:${row.received_at}:${index}`} className="tabular-nums">
                        <td className="whitespace-nowrap px-3.5 py-3 text-xs text-[var(--sl-text-secondary)]">
                          {manilaTimestamp(row.received_at)}
                        </td>
                        <td className="px-3.5 py-3 font-mono text-xs text-[var(--sl-text-muted)]">#{row.request_id}</td>
                        <td className="px-3.5 py-3">
                          <p className="font-semibold text-[var(--sl-text-header)]">{row.full_name}</p>
                          <p className="text-xs text-[var(--sl-text-muted)]">{row.school_id}</p>
                        </td>
                        <td className="px-3.5 py-3">{row.file_name}</td>
                        <td className="px-3.5 py-3">{row.print_type}</td>
                        <td className="px-3.5 py-3">{row.paper_size}</td>
                        <td className="px-3.5 py-3">{row.page_count}</td>
                        <td className="px-3.5 py-3">{row.number_of_copies}</td>
                        <td className="px-3.5 py-3">{row.total_sheets}</td>
                        <td className="px-3.5 py-3 text-xs text-[var(--sl-text-secondary)]">
                          {row.payment_method ?? 'Not recorded'}
                        </td>
                        <td className="px-3.5 py-3 font-semibold text-[var(--sl-text-header)]">{money(row.amount_paid)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </ResponsiveTable>
          </>
        ) : ledgerTab === 'restocks' ? (
          <ResponsiveTable label="Restock history">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
                <tr>
                  {['Date', 'Type', 'Supply', 'Quantity', 'Unit cost', 'Total expense', 'Before', 'After', 'Recorded by'].map(
                    label => (
                      <th key={label} scope="col" className="px-3.5 py-2.5">
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sl-border)]">
                {reportLoading ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-sm text-[var(--sl-text-secondary)]">
                      Loading restock history…
                    </td>
                  </tr>
                ) : restocks.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-sm font-semibold text-[var(--sl-text-header)]">
                      No restocks for this period.
                    </td>
                  </tr>
                ) : (
                  restocks.map((row, index) => (
                    <tr key={`${row.created_at}-${index}`} className="tabular-nums">
                      <td className="whitespace-nowrap px-3.5 py-3 text-xs text-[var(--sl-text-secondary)]">
                        {manilaTimestamp(row.created_at)}
                      </td>
                      <td className="px-3.5 py-3">{row.supply_type}</td>
                      <td className="px-3.5 py-3 font-semibold text-[var(--sl-text-header)]">{row.supply_name}</td>
                      <td className="px-3.5 py-3">
                        {whole(row.quantity)} {row.unit}
                      </td>
                      <td className="px-3.5 py-3">{money(row.unit_cost)}</td>
                      <td className="px-3.5 py-3 font-semibold text-[var(--sl-text-header)]">{money(row.total_expense)}</td>
                      <td className="px-3.5 py-3">{whole(row.balance_before, 'Legacy')}</td>
                      <td className="px-3.5 py-3">{whole(row.balance_after, 'Legacy')}</td>
                      <td className="px-3.5 py-3 text-xs text-[var(--sl-text-secondary)]">{row.recorded_by ?? 'System'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ResponsiveTable>
        ) : (
          <ResponsiveTable label="Manual stock usage">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
                <tr>
                  {['Date', 'Type', 'Supply', 'Action', 'Quantity', 'Before', 'After', 'Recorded by'].map(label => (
                    <th key={label} scope="col" className="px-3.5 py-2.5">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sl-border)]">
                {usageEntries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-sm font-semibold text-[var(--sl-text-header)]">
                      No bottles or reams have been manually opened yet.
                    </td>
                  </tr>
                ) : (
                  usageEntries.map((row, index) => (
                    <tr key={`${row.created_at}-${index}`} className="tabular-nums">
                      <td className="whitespace-nowrap px-3.5 py-3 text-xs text-[var(--sl-text-secondary)]">
                        {manilaTimestamp(row.created_at)}
                      </td>
                      <td className="px-3.5 py-3">{row.supply_type}</td>
                      <td className="px-3.5 py-3 font-semibold text-[var(--sl-text-header)]">{row.supply_name}</td>
                      <td className="px-3.5 py-3">
                        {row.activity_code === 'LoadedIntoPrinter' ? 'Bottle loaded' : 'Ream opened'}
                      </td>
                      <td className="px-3.5 py-3">
                        {whole(row.quantity)} {row.unit}
                      </td>
                      <td className="px-3.5 py-3">{whole(row.balance_before)}</td>
                      <td className="px-3.5 py-3">{whole(row.balance_after)}</td>
                      <td className="px-3.5 py-3 text-xs text-[var(--sl-text-secondary)]">{row.recorded_by ?? 'System'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ResponsiveTable>
        )}
      </SectionCard>

      {usage ? (
        <LumoDialog
          title={usage.kind === 'ink' ? 'Load one ink bottle' : 'Open one paper ream'}
          busy={saving}
          onClose={() => setUsage(null)}
          footer={
            <>
              <Button variant="secondary" disabled={saving} onClick={() => setUsage(null)}>
                Cancel
              </Button>
              <Button disabled={saving} onClick={() => void confirmUsage()}>
                {saving ? 'Saving…' : 'Confirm usage'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-[var(--sl-text)]">
            {usage.name} currently has <strong>{usage.current}</strong> unopened{' '}
            {usage.kind === 'ink' ? 'bottles' : 'reams'}. This deducts exactly one and records today’s date and your account.
          </p>
          {modalError ? <NoticeBanner tone="error">{modalError}</NoticeBanner> : null}
        </LumoDialog>
      ) : null}

      {selected ? (
        <LumoDialog
          title={selected.kind === 'paper' ? 'Restock paper' : 'Restock ink bottles'}
          description={`${selected.name} · Current stock: ${selected.current} ${selected.unit}`}
          busy={saving}
          onClose={() => setSelected(null)}
        >
          <form onSubmit={submitRestock} className="space-y-4">
            {modalError ? <NoticeBanner tone="error">{modalError}</NoticeBanner> : null}
            <FormField id="restock-qty" label={selected.kind === 'paper' ? 'Reams to add' : 'Bottles to add'} required>
              <input
                id="restock-qty"
                required
                className="sl-input"
                type="number"
                min="1"
                max="10000"
                step="1"
                value={quantity}
                onChange={e => setQuantity(Number(e.target.value))}
              />
            </FormField>
            <FormField id="restock-cost" label={selected.kind === 'paper' ? 'Cost per ream' : 'Cost per bottle'} required>
              <input
                id="restock-cost"
                required
                className="sl-input"
                type="number"
                min="0.01"
                max="1000000"
                step="0.01"
                value={unitCost}
                onChange={e => setUnitCost(e.target.value)}
              />
            </FormField>
            <div className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-3 text-sm text-[var(--sl-text-header)] tabular-nums">
              Total restocking expense: <strong>{money(totalExpense)}</strong>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" disabled={saving} onClick={() => setSelected(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : selected.kind === 'paper' ? 'Add paper stock' : 'Add bottles'}
              </Button>
            </div>
          </form>
        </LumoDialog>
      ) : null}

      {paperStock !== undefined && data ? (
        <PaperStockDialog sizes={data.paper} initialId={paperStock ?? undefined} onClose={() => setPaperStock(undefined)} onSaved={paperSaved} />
      ) : null}
      {editingInk ? <InkEditDialog ink={editingInk} onClose={() => setEditingInk(null)} onSaved={paperSaved} /> : null}
      {editingPaper !== undefined ? (
        <PaperSizesDialog initialId={editingPaper} onClose={() => setEditingPaper(undefined)} onSaved={paperSaved} />
      ) : null}
      {showPaperSizes ? <PaperSizesDialog startCreating onClose={() => setShowPaperSizes(false)} onSaved={paperSaved} /> : null}
      {newColor ? <InkColorTypeDialog onClose={() => setNewColor(false)} onSaved={paperSaved} /> : null}
      {showInk ? <InkStockDialog onClose={() => setShowInk(false)} onSaved={paperSaved} /> : null}
      {deletePaper ? (
        <DeskDialog title="Delete paper item" busy={saving} onClose={() => setDeletePaper(null)}>
          <p className="text-pretty text-sm">
            Delete <strong>{deletePaper.paper_size_dimension} paper</strong> from current stock? This is allowed only at zero stock. Purchase and usage history stay recorded.
          </p>
          {deleteError ? (
            <p role="alert" className="auth-error rounded-[8px] p-3 text-sm">
              {deleteError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={saving} onClick={() => setDeletePaper(null)}>
              Keep paper item
            </Button>
            <Button variant="danger" disabled={saving} onClick={() => void confirmDeletePaper()}>
              {saving ? 'Deleting…' : 'Delete paper item'}
            </Button>
          </div>
        </DeskDialog>
      ) : null}
      {deleteInk ? (
        <DeskDialog title="Delete ink item" busy={saving} onClose={() => setDeleteInk(null)}>
          <p className="text-pretty text-sm">
            Delete <strong>{deleteInk.name}</strong> from current stock? Purchase and usage history stay recorded.
          </p>
          {deleteError ? (
            <p role="alert" className="auth-error rounded-[8px] p-3 text-sm">
              {deleteError}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={saving} onClick={() => setDeleteInk(null)}>
              Keep ink item
            </Button>
            <Button variant="danger" disabled={saving} onClick={() => void confirmDeleteInk()}>
              {saving ? 'Deleting…' : 'Delete ink item'}
            </Button>
          </div>
        </DeskDialog>
      ) : null}
    </>
  )
}
