import { Download, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { Button, NoticeBanner, SectionCard, StatusBadge } from '../../components/ui'
import { ViolationRecordDrawer } from './ViolationRecordDrawer'
import { ViolationRecordForm } from './ViolationRecordForm'
import type { ViolationCategory } from './violation-categories-api'
import { adminViolationsBase, ownViolationsBase, violationRequest, violationsApi, type Incident, type OwnStanding } from './violations-api'
import { RefreshButton } from '../../components/RefreshButton'

const date = (value: string) => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
const PAGE_SIZE = 25

export function WarningsLeft({ items }: { items: OwnStanding[] }) {
  if (!items.length) return null
  return (
    <div className="mb-4 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-4">
      <h3 className="text-sm font-semibold text-[var(--sl-text-header)]">Warnings left</h3>
      <ul className="mt-2 grid gap-2 sm:grid-cols-3">
        {items.map(item => (
          <li key={item.category} className="rounded-[6px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-3 text-sm">
            <p className="font-semibold text-[var(--sl-text-header)]">{item.category}</p>
            <p className="tabular-nums">
              {item.warningsBeforeFine === 0 ? 'No warnings: a fine applies at once' : item.warningsLeft > 0
                ? `${item.warningsLeft} of ${item.warningsBeforeFine} warnings left`
                : `No warnings left. The next offense is a fine of PHP ${item.fineAmount.toFixed(2)}`}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ViolationsRecords({ admin = false, onSaved, incidentId = null, onIncidentChange }: {
  admin?: boolean
  onSaved?: () => void
  /** Record open in the drawer, kept in the page address so a link opens it. */
  incidentId?: number | null
  onIncidentChange?: (id: number | null) => void
}) {
  const base = admin ? adminViolationsBase : ownViolationsBase
  const [items, setItems] = useState<Incident[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [categories, setCategories] = useState<ViolationCategory[]>([])
  const [own, setOwn] = useState<OwnStanding[]>([])
  const [opened, setOpened] = useState<Incident | null>(null)
  const [missing, setMissing] = useState(false)
  const [localId, setLocalId] = useState<number | null>(null)
  const selectedId = onIncidentChange ? incidentId : localId
  const select = (id: number | null) => (onIncidentChange ?? setLocalId)(id)

  useEffect(() => {
    let active = true
    const load = admin ? violationRequest<ViolationCategory[]>('/api/v1/admin/violation-categories') : Promise.resolve(null)
    void load.then(list => { if (active && list) setCategories(list) }).catch(cause => { if (active) setError(`The violation categories could not be loaded. ${cause instanceof Error ? cause.message : ''}`.trim()) })
    if (!admin) void violationsApi.ownStanding().then(list => { if (active) setOwn(list) }).catch(() => undefined)
    return () => { active = false }
  }, [admin, refresh])

  useEffect(() => {
    let active = true
    setLoading(true)
    void violationRequest<{ items: Incident[]; total: number }>(`${base}?${new URLSearchParams({ search, category, from, to, page: String(page) })}`)
      .then(data => { if (active) { setItems(data.items); setTotal(data.total); setError('') } })
      .catch(cause => { if (active) setError(cause.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [base, search, category, from, to, page, refresh])

  // A record linked by address may not be on this page of the list, so it is fetched by number.
  useEffect(() => {
    setMissing(false)
    if (!selectedId) { setOpened(null); return }
    const found = items.find(item => item.incident_id === selectedId)
    if (found) { setOpened(found); return }
    let active = true
    void violationRequest<{ items: Incident[] }>(`${base}?${new URLSearchParams({ incidentId: String(selectedId) })}`)
      .then(data => { if (active) { setOpened(data.items[0] ?? null); setMissing(!data.items[0]) } })
      .catch(() => { if (active) { setOpened(null); setMissing(true) } })
    return () => { active = false }
  }, [selectedId, items, base])

  async function download(format: 'csv' | 'pdf') {
    setError('')
    try {
      const response = await fetch(`${base}/report.${format}?${new URLSearchParams({ search, category, from, to })}`, { credentials: 'include' })
      if (!response.ok) throw new Error((await response.json()).message ?? 'Export failed.')
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `violations-records.${format}`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (cause) {
      setError((cause as Error).message)
    }
  }

  const filterNames = admin ? categories.map(item => item.name) : own.map(item => item.category)
  const closeDrawer = () => select(null)
  const input = 'sl-input'

  return (
    <SectionCard className="my-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sl-border)] px-5 py-4">
        <div>
          <h2 id="violation-records-heading" tabIndex={-1} className="font-display text-base font-semibold text-[var(--sl-text-header)] outline-none">{admin ? 'Violation records' : 'My violations and warnings'}</h2>
          {!admin ? <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">A warning does not block borrowing or clearance. Counts do not reset each term.</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <RefreshButton onRefresh={() => setRefresh(value => value + 1)} variant="secondary" />
          {admin ? (
            <>
              <Button variant="secondary" onClick={() => void download('csv')}><Download size={16} aria-hidden="true" /> Export CSV</Button>
              <Button variant="secondary" onClick={() => void download('pdf')}><Download size={16} aria-hidden="true" /> Export PDF</Button>
              <Button onClick={() => setFormOpen(value => !value)}><Plus size={16} aria-hidden="true" /> {formOpen ? 'Close form' : 'Record violation'}</Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="p-5">
        {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
        {selectedId && missing ? (
          <NoticeBanner tone="warning" action={<Button size="sm" variant="secondary" onClick={closeDrawer}>Show all records</Button>}>
            Violation record {selectedId} could not be found. It may have been removed, or the link is wrong.
          </NoticeBanner>
        ) : null}
        {notice ? <NoticeBanner tone="success">{notice}</NoticeBanner> : null}
        {!admin ? <WarningsLeft items={own} /> : null}

        {formOpen && admin ? (
          <ViolationRecordForm
            categories={categories.filter(item => item.isActive).map(item => item.name)}
            onCancel={() => setFormOpen(false)}
            onSaved={message => { setFormOpen(false); setNotice(message); setRefresh(value => value + 1); onSaved?.() }}
          />
        ) : null}

        <div className="mb-4 flex flex-wrap items-end gap-3">
          {admin ? (
            <label className="grow text-xs font-semibold text-[var(--sl-text-secondary)]">Search person or school ID
              <input value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} className={`${input} mt-1`} />
            </label>
          ) : null}
          <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">From
            <input type="date" value={from} onChange={event => { setFrom(event.target.value); setPage(1) }} className={`${input} mt-1`} />
          </label>
          <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">Through
            <input type="date" value={to} onChange={event => { setTo(event.target.value); setPage(1) }} className={`${input} mt-1`} />
          </label>
          <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">Category filter
            <select value={category} onChange={event => { setCategory(event.target.value); setPage(1) }} className={`${input} mt-1`}>
              <option value="">All categories</option>
              {filterNames.map(name => <option key={name}>{name}</option>)}
            </select>
          </label>
        </div>

        {loading ? <p role="status" className="text-sm">Loading violations…</p> : items.length === 0 ? (
          <p className="py-4 text-sm text-[var(--sl-text-secondary)]">No violation records match.</p>
        ) : (
          <ResponsiveTable label="Violation records">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
                <tr>{[...(admin ? ['Person'] : []), 'Category', 'Step', 'Date', 'Fine status'].map(heading => <th key={heading} scope="col" className="px-3 py-2.5">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[var(--sl-border)]">
                {items.map(item => {
                  const state = item.voided_at ? 'Voided' : item.events.some(event => event.type === 'Resolved') ? 'Resolved' : ''
                  return (
                    <tr key={item.incident_id} className="align-top">
                      {admin ? <td className="px-3 py-3"><p className="font-semibold text-[var(--sl-text-header)]">{item.full_name}</p><p className="text-xs text-[var(--sl-text-muted)]">{item.school_id}</p></td> : null}
                      <td className="px-3 py-3">
                        <button type="button" className="min-h-9 font-semibold text-[#0b5ea2] underline dark:text-[#93c5fd]" onClick={() => select(item.incident_id)}>
                          {item.category}<span className="sr-only"> record, view details</span>
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <p>{item.action}</p>
                        <p className="mt-0.5 flex flex-wrap gap-1 text-xs text-[var(--sl-text-secondary)]">
                          {item.source === 'Paper log' ? <StatusBadge status="Paper log" tone="neutral" /> : null}
                          {state ? <StatusBadge status={state} tone="neutral" /> : null}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-xs tabular-nums text-[var(--sl-text-secondary)]">{date(item.incident_at)}</td>
                      <td className="px-3 py-3">{item.fine_amount ? <><p className="font-semibold tabular-nums">PHP {Number(item.fine_amount).toFixed(2)}</p><p className="text-xs">{item.payment_status}</p></> : <span className="text-[var(--sl-text-muted)]">No charge</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ResponsiveTable>
        )}

        <div className="mt-4 flex items-center gap-3 text-sm">
          <Button variant="secondary" disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</Button>
          <span>Page {page}</span>
          <Button variant="secondary" disabled={page * PAGE_SIZE >= total || loading} onClick={() => setPage(value => value + 1)}>Next</Button>
        </div>
      </div>

      {selectedId && opened ? (
        <ViolationRecordDrawer
          key={opened.incident_id}
          item={opened} base={base} admin={admin} onClose={closeDrawer}
          onSaved={message => { closeDrawer(); setNotice(message); setRefresh(value => value + 1) }}
        />
      ) : null}
    </SectionCard>
  )
}
