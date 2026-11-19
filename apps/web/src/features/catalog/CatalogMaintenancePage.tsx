import { DeweyMaintenancePanel } from './DeweyMaintenancePanel'
import { LibrarySchedulePage } from '../notifications/LibrarySchedulePage'
import {BookCoversPage} from './BookCoversPage'
import { PrintingServiceSetup } from '../printing/PrintingServiceSetup'
import { ResearchGroupsPanel } from './ResearchGroupsPanel'
import { LibraryCirculationSetupPanel } from '../reservations/LibraryCirculationSetupPanel'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, PageHeader, SectionCard } from '../../components/ui'
import { CatalogManagementPage } from './CatalogManagementPage'
import { CategoryManagementPage } from '../categories/CategoryManagementPage'
import { HoldingsImportPage } from './HoldingsImportPage'
import { FindBookDetailsPage } from './FindBookDetailsPage'
import { ShelfManagementPage } from '../shelves/ShelfManagement'
import { confirmLeave } from '../../components/UnsavedChanges'
import { useConfirmSave } from '../../components/ConfirmSaveDialog'
import { CatalogDetailsPanel, catalogInput } from './CatalogDetailsPanel'
import { enhancedCatalog, type CatalogRecord, type Option, type Options } from './enhanced-catalog-api'

type Kind = 'locations' | 'programs' | 'courses' | 'types'
const maintenanceTabs = ['reservations', 'dewey', 'printing', 'research-groups', 'covers', 'schedule', 'books', 'details', 'imports', 'find', 'categories', 'locations', 'programs', 'courses'] as const
type MaintenanceTab = (typeof maintenanceTabs)[number]

function FoundationEditor({ kind }: { kind: Kind }) {
  const [options, setOptions] = useState<Options | null>(null)
  const [edit, setEdit] = useState<Partial<Option>>({ name: '', code: '', recordKind: 'Book', status: 'Active' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { ask, dialog: confirmSave } = useConfirmSave()
  useEffect(() => {
    setEdit({ name: '', code: '', recordKind: 'Book', status: 'Active' })
    enhancedCatalog.options(true).then(setOptions).catch((e) => setError(e.message))
  }, [kind])
  async function save() {
    setBusy(true)
    setError('')
    try {
      setOptions(await enhancedCatalog.saveFoundation(kind, edit.id ? Number(edit.id) : null, edit))
      setEdit({ name: '', code: '', recordKind: 'Book', status: 'Active' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">{kind === 'programs' ? 'Programs' : 'Courses'}</h2>
      <p className="text-sm">Archived entries remain linked to past catalog records. Choose active entries for new records.</p>
      {error && <p role="alert" className="rounded-xl bg-[#b42318] p-3 text-white">{error}</p>}
      <SectionCard className="grid gap-3 p-4 sm:grid-cols-2">
        <label>Name<input className={catalogInput} value={edit.name ?? ''} maxLength={kind === 'programs' || kind === 'courses' ? 150 : 100} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
        {(kind === 'programs' || kind === 'courses') && <label>Code<input className={catalogInput} value={edit.code ?? ''} maxLength={40} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></label>}
        {kind === 'courses' && <label>Program<select className={catalogInput} value={edit.programId ?? ''} onChange={(e) => setEdit({ ...edit, programId: Number(e.target.value) })}><option value="">Choose program</option>{options?.programs.filter((p) => p.status === 'Active').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        {kind === 'types' && <label>Classification<select className={catalogInput} value={edit.recordKind} onChange={(e) => setEdit({ ...edit, recordKind: e.target.value })}><option>Book</option><option value="Research/Thesis">Research / Thesis</option></select></label>}
        <label>Status<select className={catalogInput} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option>Active</option><option>Archived</option></select></label>
        <div className="flex gap-3 sm:col-span-2"><Button disabled={busy || !edit.name?.trim()} onClick={() => ask(`${edit.id ? 'Save changes to' : 'Add'} ${edit.name}.`, () => { void save() })}>{edit.id ? 'Save changes' : kind === 'programs' ? 'Add program' : 'Add course'}</Button>{edit.id && <Button variant="secondary" onClick={() => setEdit({ name: '', code: '', recordKind: 'Book', status: 'Active' })}>Cancel edit</Button>}</div>
      </SectionCard>
      <SectionCard className="divide-y">{options?.[kind].map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 p-3"><div><strong>{entry.name}</strong><p className="text-xs">{entry.code} {entry.recordKind} · {entry.status}</p></div><Button variant="secondary" onClick={() => setEdit(entry)}>Edit</Button></div>)}</SectionCard>
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
    <div>
      <p className="text-sm">Edit copyright year, descriptions, program/course links and digital files without changing existing circulation records.</p>
      {error && <p role="alert">{error}</p>}
      <label className="mt-3 block">Find a title<input className={catalogInput} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <label className="mt-3 block">Title<select className={catalogInput} value={selected ?? ''} onChange={(e) => setSelected(Number(e.target.value) || null)}><option value="">Choose title</option>{items.map((t) => <option key={t.id} value={t.id}>{t.title} · {t.kind}</option>)}</select></label>
      {selected && <CatalogDetailsPanel key={selected} titleId={selected} editable />}
    </div>
  )
}

export function CatalogMaintenancePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = (searchParams.get('tab') ?? searchParams.get('section'))
  const tab: MaintenanceTab = maintenanceTabs.includes(requested as MaintenanceTab) ? requested as MaintenanceTab : 'locations'
  function openTab(next: MaintenanceTab) {
    confirmLeave(() => {
      const params = new URLSearchParams(searchParams)
      params.delete('section')
      params.set('tab', next)
      if (next !== 'locations') params.delete('addShelf')
      setSearchParams(params)
    })
  }
  return (
    <div className="text-[#0b5ea2] dark:text-white">
      <PageHeader eyebrow="Library administration" title="Library setup" />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm">Configure shelves, academic groups and library services. Daily book work is in Catalog.</p><Link className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-bold" to="/librarian/catalog">Open catalog</Link></div>
      <nav aria-label="Library setup sections" className="mb-5 space-y-3">
        <div className="flex flex-wrap gap-2">{([['locations','Shelves & locations'],['reservations','Reservations & renewals'],['research-groups','Academic groups'],['printing','Printing settings'],['schedule','Library hours'],['dewey','Dewey classifications']] as const).map(([key,label]) => <Button key={key} variant={tab === key ? 'primary' : 'secondary'} onClick={() => openTab(key)}>{label}</Button>)}</div>
        {(['research-groups','programs','courses'] as string[]).includes(tab) && <div className="flex flex-wrap gap-2" aria-label="Academic group settings">{([['research-groups','Research groups'],['programs','Programs'],['courses','Courses']] as const).map(([key,label]) => <Button key={key} variant={tab === key ? 'primary' : 'secondary'} onClick={() => openTab(key)}>{label}</Button>)}</div>}
        {(['books','details','imports','find','covers','categories'] as string[]).includes(tab) && <details open><summary className="cursor-pointer text-sm font-semibold">Existing catalog link</summary><p className="my-2 text-sm">This tool remains available. Use Catalog for titles, import and book-list tools.</p><div className="flex flex-wrap gap-2">{([['books','Books & research'],['details','Catalog information'],['imports','Add books from Excel/CSV'],['find','Find book details'],['covers','Book covers'],['categories','Book categories']] as const).map(([key,label]) => <Button key={key} variant={tab === key ? 'primary' : 'secondary'} onClick={() => openTab(key)}>{label}</Button>)}</div></details>}
      </nav>
      {tab === 'reservations' ? <LibraryCirculationSetupPanel /> : tab === 'dewey' ? <DeweyMaintenancePanel /> : tab === 'covers' ? <BookCoversPage /> : tab === 'research-groups' ? <ResearchGroupsPanel /> : tab === 'printing' ? <PrintingServiceSetup /> : tab === 'schedule' ? <LibrarySchedulePage manage embedded /> : tab === 'books' ? <CatalogManagementPage maintenance /> : tab === 'details' ? <CatalogInformationEditor /> : tab === 'imports' ? <HoldingsImportPage /> : tab === 'find' ? <FindBookDetailsPage /> : tab === 'categories' ? <CategoryManagementPage /> : tab === 'locations' ? <ShelfManagementPage /> : <FoundationEditor key={tab} kind={tab as Kind} />}
    </div>
  )
}
