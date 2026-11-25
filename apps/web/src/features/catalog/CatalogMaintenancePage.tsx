import { BookOpen, CalendarClock, Clock, GraduationCap, MapPin, Printer, ShieldAlert, SlidersHorizontal, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useConfirmSave } from '../../components/ConfirmSaveDialog'
import { confirmLeave } from '../../components/UnsavedChanges'
import { Button, NoticeBanner, SectionCard } from '../../components/ui'
import { CategoryManagementPage } from '../categories/CategoryManagementPage'
import { AdminFinePoliciesPage } from '../fines/AdminFinePoliciesPage'
import { UrgentAlertRules } from '../fines/UrgentAlertRules'
import { ViolationRulesPanel } from '../fines/ViolationRulesPanel'
import { CopyConditionsPanel } from '../inventory/CopyConditionsPanel'
import { LibrarySchedulePage } from '../notifications/LibrarySchedulePage'
import { PrintingServiceSetup } from '../printing/PrintingServiceSetup'
import { PrintingPaperSettings } from '../printing/PrintingPaperSettings'
import { LibraryCirculationSetupPanel } from '../reservations/LibraryCirculationSetupPanel'
import { ShelfManagementPage } from '../shelves/ShelfManagement'
import { BookCoversPage } from './BookCoversPage'
import { CatalogDetailsPanel, catalogInput } from './CatalogDetailsPanel'
import { CatalogManagementPage } from './CatalogManagementPage'
import { enhancedCatalog, type CatalogRecord, type Option, type Options } from './enhanced-catalog-api'
import { FindBookDetailsPage } from './FindBookDetailsPage'
import { HoldingsImportPage } from './HoldingsImportPage'
import { ResearchImportPanel } from './ResearchImportPanel'

type Kind = 'locations' | 'programs' | 'courses' | 'types'
const maintenanceTabs = [
  'locations',
  'reservations',
  'fine-rules',
  'violation-rules',
  'conditions',
  'printing',
  'schedule',
  'covers',
  'books',
  'details',
  'imports',
  'find',
  'categories',
  'programs',
  'courses',
] as const
type MaintenanceTab = (typeof maintenanceTabs)[number]

const primarySetupSections = [
  { key: 'locations', label: 'Shelves & locations', icon: MapPin, hint: 'Compartment grid & shelf capacity' },
  { key: 'reservations', label: 'Reservations & renewals', icon: CalendarClock, hint: 'Expiry, waitlist cap & student renewals' },
  { key: 'fine-rules', label: 'Fine rules', icon: SlidersHorizontal, hint: 'Hourly, daily & maximum overdue penalty' },
  { key: 'violation-rules', label: 'Violation rules', icon: ShieldAlert, hint: 'Warnings, fines & urgent alert rules' },
  { key: 'conditions', label: 'Book conditions', icon: Wrench, hint: 'Your own conditions & how each behaves' },
  { key: 'programs', label: 'Programs & courses', icon: GraduationCap, hint: 'Programs & courses for research' },
  { key: 'printing', label: 'Printing settings', icon: Printer, hint: 'Paper rates & print service rules' },
  { key: 'schedule', label: 'Library hours', icon: Clock, hint: 'Operating schedule & closures' },
] as const

function FoundationEditor({ kind }: { kind: Kind }) {
  const [options, setOptions] = useState<Options | null>(null)
  const [edit, setEdit] = useState<Partial<Option>>({ name: '', code: '', recordKind: 'Book', status: 'Active' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const { ask, dialog: confirmSave } = useConfirmSave()

  useEffect(() => {
    setEdit({ name: '', code: '', recordKind: 'Book', status: 'Active' })
    setError('')
    setNotice('')
    enhancedCatalog.options(true).then(setOptions).catch((e) => setError(e.message))
  }, [kind])

  async function save() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      setOptions(await enhancedCatalog.saveFoundation(kind, edit.id ? Number(edit.id) : null, edit))
      setNotice(`${edit.name} saved to ${kind === 'programs' ? 'Programs' : 'Courses'}.`)
      setEdit({ name: '', code: '', recordKind: 'Book', status: 'Active' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 text-slate-900 dark:text-slate-100">
      <SectionCard className="p-5">
        <h2 className="font-display text-lg font-bold">{kind === 'programs' ? 'Programs' : 'Courses'}</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Archived entries remain linked to past catalog records. Choose active entries for new records.
        </p>
        {error ? <NoticeBanner tone="error" className="mt-3">{error}</NoticeBanner> : null}
        {notice ? <NoticeBanner tone="success" className="mt-3">{notice}</NoticeBanner> : null}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            Name
            <input
              className={catalogInput}
              value={edit.name ?? ''}
              maxLength={kind === 'programs' || kind === 'courses' ? 150 : 100}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
          </label>
          {(kind === 'programs' || kind === 'courses') && (
            <label className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
              Code
              <input
                className={catalogInput}
                value={edit.code ?? ''}
                maxLength={40}
                onChange={(e) => setEdit({ ...edit, code: e.target.value })}
              />
            </label>
          )}
          {kind === 'courses' && (
            <label className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
              Program
              <select
                className={catalogInput}
                value={edit.programId ?? ''}
                onChange={(e) => setEdit({ ...edit, programId: Number(e.target.value) })}
              >
                <option value="">Choose program</option>
                {options?.programs.filter((p) => p.status === 'Active').map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
          )}
          {kind === 'types' && (
            <label className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
              Classification
              <select
                className={catalogInput}
                value={edit.recordKind}
                onChange={(e) => setEdit({ ...edit, recordKind: e.target.value })}
              >
                <option>Book</option>
                <option value="Research/Thesis">Research / Thesis</option>
              </select>
            </label>
          )}
          <label className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            Status
            <select
              className={catalogInput}
              value={edit.status}
              onChange={(e) => setEdit({ ...edit, status: e.target.value })}
            >
              <option>Active</option>
              <option>Archived</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <Button
              disabled={busy || !edit.name?.trim() || (kind === 'courses' && !edit.programId)}
              onClick={() => ask(`${edit.id ? 'Save changes to' : 'Add'} ${edit.name}.`, () => { void save() })}
            >
              {edit.id ? 'Save changes' : kind === 'programs' ? 'Add program' : 'Add course'}
            </Button>
            {edit.id && (
              <Button
                variant="secondary"
                onClick={() => setEdit({ name: '', code: '', recordKind: 'Book', status: 'Active' })}
              >
                Cancel edit
              </Button>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard className="divide-y divide-slate-200/70 dark:divide-slate-700/50">
        {options?.[kind].map((entry) => (
          <div key={entry.id} className="flex items-center justify-between gap-3 p-4">
            <div>
              <strong className="text-sm font-bold text-slate-900 dark:text-slate-100">{entry.name}</strong>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {entry.code} {entry.recordKind} · {entry.status}
              </p>
            </div>
            <Button variant="secondary" onClick={() => setEdit(entry)}>Edit</Button>
          </div>
        ))}
      </SectionCard>
      {confirmSave}
    </div>
  )
}

function CatalogInformationEditor() {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<CatalogRecord[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => {
      enhancedCatalog.search(new URLSearchParams({ q: query })).then((r) => { if (active) setItems(r.items) }).catch((e) => { if (active) setError(e.message) })
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [query])
  return (
    <SectionCard className="space-y-4 p-5 text-slate-900 dark:text-slate-100">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Edit copyright year, descriptions, program/course links and digital files without changing existing circulation records.
      </p>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-900">{error}</p>}
      <label className="block text-sm font-semibold">
        Find a title
        <input className={catalogInput} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <label className="block text-sm font-semibold">
        Title
        <select className={catalogInput} value={selected ?? ''} onChange={(e) => setSelected(Number(e.target.value) || null)}>
          <option value="">Choose title</option>
          {items.map((t) => <option key={t.id} value={t.id}>{t.title} · {t.kind}</option>)}
        </select>
      </label>
      {selected && <CatalogDetailsPanel key={selected} titleId={selected} editable />}
    </SectionCard>
  )
}

export function CatalogMaintenancePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  // Research groups were removed (revisions 2026-11-20); old links open Programs & courses.
  const rawRequested = searchParams.get('tab') ?? searchParams.get('section')
  const requested = rawRequested === 'research-groups' ? 'programs' : rawRequested
  const tab: MaintenanceTab = maintenanceTabs.includes(requested as MaintenanceTab) ? (requested as MaintenanceTab) : 'locations'

  function openTab(next: MaintenanceTab) {
    confirmLeave(() => {
      const params = new URLSearchParams(searchParams)
      params.delete('section')
      params.set('tab', next)
      if (next !== 'locations') params.delete('addShelf')
      setSearchParams(params)
    })
  }

  const isAcademicTab = (['programs', 'courses'] as string[]).includes(tab)
  const activeSection = primarySetupSections.find(
    (s) => s.key === tab || (s.key === 'programs' && isAcademicTab),
  )

  return (
    <div className="space-y-5 text-slate-900 dark:text-slate-100">
      <header className="flex flex-col gap-4 rounded-[12px] border border-[var(--sl-border)] border-t-[3px] border-t-[#0b5ea2] bg-gradient-to-r from-[#f0f7ff] via-[var(--sl-bg-elevated)] to-[#fffdf0] p-5 shadow-[var(--sl-shadow-xs)] dark:from-[#16253b] dark:via-[#1a2232] dark:to-[#24251c] lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[#0b5ea2]/14 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[#0b5ea2] dark:bg-[#0b5ea2]/25 dark:text-[#93c5fd]">
              Library administration
            </span>
            {activeSection ? (
              <span className="inline-flex items-center rounded-full bg-[#0f766e]/12 px-2.5 py-0.5 text-[11px] font-semibold text-[#0f766e] dark:bg-[#0f766e]/25 dark:text-[#5eead4]">
                {activeSection.label}
              </span>
            ) : null}
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[var(--sl-text-header)] sm:text-[1.75rem]">
            Library setup
          </h1>
          <p className="mt-1 text-sm text-[var(--sl-text-secondary)]">
            Configure shelves, reservation expiry, waitlist &amp; renewal limits, fine rules, violation rules, academic groups, printing rates, and operating hours.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
          <Link
            className="inline-flex min-h-[40px] items-center gap-2 rounded-[8px] border border-[#0b5ea2]/30 bg-[var(--sl-bg-elevated)] px-4 text-sm font-bold text-[#0b5ea2] shadow-[var(--sl-shadow-xs)] transition hover:bg-[#0b5ea2]/8 dark:border-sky-400/30 dark:text-sky-300"
            to="/librarian/catalog"
          >
            <BookOpen size={16} /> Open catalog
          </Link>
        </div>
      </header>

      <SectionCard className="p-4">
        <nav aria-label="Library setup sections" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {primarySetupSections.map(({ key, label, icon: Icon, hint }) => {
              const isActive = tab === key || (key === 'programs' && isAcademicTab)
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => openTab(key)}
                  className={`group flex flex-col items-start rounded-[10px] border p-3.5 text-left transition-all ${
                    isActive
                      ? 'border-[#0b5ea2] bg-gradient-to-br from-[#132a3f] via-[#0b5ea2] to-[#0f766e] text-white shadow-[var(--sl-shadow-s)]'
                      : 'border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/55 text-[var(--sl-text-header)] hover:-translate-y-0.5 hover:border-[#0b5ea2]/45 hover:bg-[var(--sl-bg-elevated)] hover:shadow-[var(--sl-shadow-xs)]'
                  }`}
                >
                  <span className="flex w-full items-center justify-between gap-2 text-sm font-bold">
                    <span className="flex items-center gap-2">
                      <span
                        className={`inline-flex rounded-[7px] p-1.5 ${
                          isActive
                            ? 'bg-white/15 text-[#FFF200]'
                            : 'bg-[#0b5ea2]/10 text-[#0b5ea2] group-hover:bg-[#0b5ea2]/15 dark:bg-sky-400/15 dark:text-sky-300'
                        }`}
                      >
                        <Icon size={15} />
                      </span>
                      {label}
                    </span>
                    {isActive ? (
                      <span className="size-2 shrink-0 rounded-full bg-[#FFF200]" aria-hidden="true" />
                    ) : null}
                  </span>
                  <span
                    className={`mt-1.5 text-[11px] leading-snug ${
                      isActive ? 'text-white/85' : 'text-[var(--sl-text-muted)]'
                    }`}
                  >
                    {hint}
                  </span>
                </button>
              )
            })}
          </div>

          {isAcademicTab && (
            <div className="flex flex-wrap gap-2 border-t border-slate-200/80 pt-3 dark:border-slate-700/60" aria-label="Academic group settings">
              {([
                ['programs', 'Programs'],
                ['courses', 'Courses'],
              ] as const).map(([key, label]) => (
                <Button key={key} variant={tab === key ? 'primary' : 'secondary'} onClick={() => openTab(key)}>
                  {label}
                </Button>
              ))}
            </div>
          )}

          {(['books', 'details', 'imports', 'find', 'covers', 'categories'] as string[]).includes(tab) && (
            <details open className="border-t border-slate-200/80 pt-3 dark:border-slate-700/60">
              <summary className="cursor-pointer text-sm font-semibold text-[#0b5ea2] dark:text-sky-300">
                Existing catalog link
              </summary>
              <p className="my-2 text-sm text-slate-600 dark:text-slate-300">
                This tool remains available. Use Catalog for titles, import and book-list tools.
              </p>
              <div className="flex flex-wrap gap-2">
                {([
                  ['books', 'Books & research'],
                  ['details', 'Catalog information'],
                  ['imports', 'Add books from Excel/CSV'],
                  ['find', 'Find book details'],
                  ['covers', 'Book covers'],
                  ['categories', 'Book categories'],
                ] as const).map(([key, label]) => (
                  <Button key={key} variant={tab === key ? 'primary' : 'secondary'} onClick={() => openTab(key)}>
                    {label}
                  </Button>
                ))}
              </div>
            </details>
          )}
        </nav>
      </SectionCard>

      {tab === 'reservations' ? (
        <LibraryCirculationSetupPanel />
      ) : tab === 'fine-rules' ? (
        <AdminFinePoliciesPage embedded />
      ) : tab === 'conditions' ? (
        <CopyConditionsPanel />
      ) : tab === 'violation-rules' ? (
        <div className="space-y-5">
          <ViolationRulesPanel />
          <UrgentAlertRules />
        </div>
      ) : tab === 'covers' ? (
        <BookCoversPage />
      ) : tab === 'printing' ? (
        <div className="space-y-5">
          <PrintingServiceSetup />
          <PrintingPaperSettings />
        </div>
      ) : tab === 'schedule' ? (
        <LibrarySchedulePage manage embedded />
      ) : tab === 'books' ? (
        <CatalogManagementPage maintenance />
      ) : tab === 'details' ? (
        <CatalogInformationEditor />
      ) : tab === 'imports' ? (
        <>
          <HoldingsImportPage />
          <ResearchImportPanel />
        </>
      ) : tab === 'find' ? (
        <FindBookDetailsPage />
      ) : tab === 'categories' ? (
        <CategoryManagementPage />
      ) : tab === 'locations' ? (
        <ShelfManagementPage />
      ) : (
        <FoundationEditor key={tab} kind={tab as Kind} />
      )}
    </div>
  )
}
