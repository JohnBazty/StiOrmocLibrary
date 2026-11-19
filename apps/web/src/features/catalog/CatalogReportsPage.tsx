import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, PageHeader, SectionCard } from '../../components/ui'
import { ExportMenu } from '../../components/ExportMenu'
import { collectionReviewApi } from './collection-review-api'
import { OperationalReports } from './OperationalReports'
import { dashboardApi } from '../dashboard/dashboard-api'

const sections = [['operational', 'Operational reports'], ['dashboard', 'Dashboard summary'], ['collection', 'Collection review']] as const

export function CatalogReportsPage() {
  const [params, setParams] = useSearchParams()
  const section = sections.some(([key]) => key === params.get('section')) ? params.get('section')! : 'operational'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function openSection(next: string) {
    const updated = new URLSearchParams(params)
    if (next === 'operational') updated.delete('section')
    else updated.set('section', next)
    setError('')
    setParams(updated)
  }

  async function download(format: 'csv' | 'pdf', scope: string) {
    setBusy(true)
    setError('')
    try {
      if (scope === 'dashboard') await dashboardApi.downloadAdminSummary()
      else await collectionReviewApi.download(scope, format)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Export failed.')
    } finally { setBusy(false) }
  }

  return <div className="space-y-5 text-[#0b5ea2] dark:text-white">
    <PageHeader eyebrow="Library records" title="Reports" />
    <nav aria-label="Report sections" className="flex flex-wrap gap-2">
      {sections.map(([key, title]) => <Button key={key} variant={section === key ? 'primary' : 'secondary'} aria-pressed={section === key} onClick={() => openSection(key)}>{title}</Button>)}
    </nav>
    {error && <p role="alert" className="rounded-xl bg-[#b42318] p-3 text-white">{error}</p>}
    {section === 'operational' && <OperationalReports />}
    {section === 'dashboard' && <SectionCard className="space-y-3 p-5">
      <h2 className="font-bold">Current operational dashboard summary</h2>
      <p className="text-sm">Current library totals. Date filters in Operational reports do not apply to this summary.</p>
      <ExportMenu label="Export dashboard summary" disabled={busy} exports={[{ label: 'Dashboard summary PDF', onSelect: () => void download('pdf', 'dashboard') }]} />
    </SectionCard>}
    {section === 'collection' && <SectionCard className="space-y-4 p-5">
      <h2 className="text-lg font-bold">Book collection review reports</h2>
      <p className="text-sm">Full collection includes all book records and copy counts, including archived holdings. Updated and Exclusions partition that same collection using the approved reference year: copyright age under five, known valid year, active title and a usable physical or digital holding.</p>
      <p className="text-sm">These reports show the school’s age-review rule. They do not certify CHED compliance.</p>
      <Link className="text-sm font-bold underline" to="/librarian/collection-review">Review collection and approved requirements</Link>
      <div className="grid gap-3 lg:grid-cols-3">{[['full', 'Full collection'], ['updated', 'Updated collection'], ['exclusions', 'Exclusions / review list']].map(([scope, title]) => <div key={scope} className="space-y-3 rounded-xl border border-[#0b5ea2]/15 p-4 dark:border-white/20">
        <h3 className="font-semibold">{title}</h3>
        <ExportMenu label={`Export ${title.toLowerCase()}`} disabled={busy} exports={['csv', 'pdf'].map(format => ({ label: `${title} ${format.toUpperCase()}`, onSelect: () => void download(format as 'csv' | 'pdf', scope) }))} />
      </div>)}</div>
    </SectionCard>}
  </div>
}
