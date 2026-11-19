import {
  Activity,
  Camera,
  Clock3,
  Download,
  RefreshCw,
  Search,
  Settings2,
  UserCheck,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConfirmSave } from '../../components/ConfirmSaveDialog'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import {
  Button,
  NoticeBanner,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBadge,
} from '../../components/ui'
import { formatManilaTime12, formatPhDate } from '../notifications/LibrarySchedulePage'
import {
  attendanceApi,
  type AcademicTerm,
  type AttendanceAnalytics,
  type AttendanceFilters,
  type AttendanceRow,
  type AttendanceSummary,
  type Capacity,
  type Pagination,
} from './attendance-api'
import { useAttendanceRefresh } from './attendance-updates'
import { AttendanceScannerModal } from './AttendanceScannerModal'
import { LibraryOperationsPanel } from './LibraryOperationsPanel'

const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())

const initial: AttendanceFilters = {
  period: 'daily',
  date: today,
  weekStart: today,
  year: Number(today.slice(0, 4)),
  month: Number(today.slice(5, 7)),
  academicTermId: '',
  q: '',
  role: '',
  purpose: '',
  presence: '',
  page: 1,
  limit: 25,
}

const hourLabel = (hour: number) => `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function AdminAttendancePage() {
  const [f, setF] = useState(initial)
  const [terms, setTerms] = useState<AcademicTerm[]>([])
  const [summary, setSummary] = useState<AttendanceSummary | null>(null)
  const [analytics, setAnalytics] = useState<AttendanceAnalytics | null>(null)
  const [capacity, setCapacity] = useState<Capacity | null>(null)
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, total_pages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [capacityError, setCapacityError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [capacityOpen, setCapacityOpen] = useState(false)
  const [capacityInput, setCapacityInput] = useState('80')
  const [capacityReason, setCapacityReason] = useState('')
  const [savingCapacity, setSavingCapacity] = useState(false)

  const { ask, dialog: confirmSave } = useConfirmSave()
  const requestSeq = useRef(0)
  const key = useMemo(() => JSON.stringify(f), [f])

  const hasFilters = Boolean(f.q.trim() || f.role || f.purpose || f.presence)

  const load = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError('')
    try {
      const [s, l, a, c] = await Promise.all([
        attendanceApi.summary(f),
        attendanceApi.logs(f),
        attendanceApi.analytics(f),
        attendanceApi.capacity(),
      ])
      if (seq !== requestSeq.current) return
      setSummary(s)
      setRows(l.rows)
      setPagination(l.pagination)
      setAnalytics(a)
      setCapacity(c)
      setCapacityInput(String(c.baseCapacity ?? c.capacity))
    } catch (e) {
      if (seq === requestSeq.current) {
        setError(e instanceof Error ? e.message : 'Unable to load attendance.')
      }
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void attendanceApi
      .terms()
      .then(setTerms)
      .catch(() => setTerms([]))
  }, [])

  useEffect(() => {
    const delay = f.q ? 200 : 0
    const timer = window.setTimeout(() => void load(), delay)
    return () => {
      window.clearTimeout(timer)
      requestSeq.current++
    }
  }, [load, f.q])

  useEffect(() => {
    const timer = window.setInterval(
      () => void attendanceApi.capacity().then(setCapacity).catch(() => undefined),
      10000,
    )
    return () => window.clearInterval(timer)
  }, [])

  useAttendanceRefresh(load)

  const update = (patch: Partial<AttendanceFilters>) => setF(v => ({ ...v, ...patch, page: patch.page ?? 1 }))

  function clearFilters() {
    update({ q: '', role: '', purpose: '', presence: '', page: 1 })
  }

  const exportPdf = async () => {
    setExporting(true)
    setError('')
    try {
      await attendanceApi.downloadPdf(f)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to export report.')
    } finally {
      setExporting(false)
    }
  }

  const requestSaveCapacity = () => {
    const numeric = Number(capacityInput)
    if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5000) {
      setCapacityError('Enter a whole maximum occupancy between 1 and 5,000.')
      return
    }
    setCapacityError('')
    ask(`Set the maximum occupancy to ${capacityInput}.`, () => {
      void saveCapacity()
    })
  }

  const saveCapacity = async () => {
    setSavingCapacity(true)
    setError('')
    try {
      const result = await attendanceApi.updateCapacity(Number(capacityInput), capacityReason)
      setCapacity(result)
      setCapacityOpen(false)
      setCapacityReason('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update capacity.')
    } finally {
      setSavingCapacity(false)
    }
  }

  const maxVisits = Math.max(1, ...(analytics?.hourly.map(x => x.visits) ?? [1]))

  return (
    <>
      <PageHeader
        eyebrow="Facility monitoring"
        title="Attendance monitoring"
        description="Monitor live library occupancy, scan visitor passes, manage facility events, and review attendance logs."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setScannerOpen(true)}>
              <Camera size={15} aria-hidden="true" /> Scan QR
            </Button>
            <Button variant="secondary" onClick={() => setCapacityOpen(v => !v)}>
              <Settings2 size={15} aria-hidden="true" /> Capacity
            </Button>
            <Button variant="secondary" onClick={() => void load()}>
              <RefreshCw size={15} aria-hidden="true" /> Refresh
            </Button>
            <Button onClick={exportPdf} disabled={exporting}>
              <Download size={15} aria-hidden="true" />
              {exporting ? 'Generating…' : 'Export'}
            </Button>
          </div>
        }
      />

      {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}

      {capacity?.overCapacity ? (
        <NoticeBanner tone="warning">
          The library is over capacity. New check-ins are blocked until occupancy falls below {capacity.capacity}.
        </NoticeBanner>
      ) : null}

      {capacityOpen ? (
        <SectionCard className="mb-5 p-5">
          <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">
            Update maximum occupancy
          </h2>
          <p className="mt-1 text-xs text-[var(--sl-text-secondary)]">
            Changes take effect immediately. If the limit is below current occupancy, new entries are blocked until enough visitors leave.
          </p>
          {capacityError ? <p className="field-error mt-2">{capacityError}</p> : null}
          <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto]">
            <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
              Maximum occupants
              <input
                className="sl-input mt-1"
                type="number"
                min="1"
                max="5000"
                value={capacityInput}
                onChange={e => {
                  setCapacityInput(e.target.value)
                  if (capacityError) setCapacityError('')
                }}
              />
            </label>
            <label className="text-xs font-semibold text-[var(--sl-text-secondary)]">
              Reason
              <input
                className="sl-input mt-1"
                value={capacityReason}
                onChange={e => setCapacityReason(e.target.value)}
                placeholder="Example: Updated fire-safety limit"
              />
            </label>
            <Button className="self-end" onClick={requestSaveCapacity} disabled={savingCapacity}>
              {savingCapacity ? 'Saving…' : 'Save capacity'}
            </Button>
          </div>
        </SectionCard>
      ) : null}

      {confirmSave}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Visits" value={String(summary?.total_visits ?? 0)} icon={Users} />
        <StatCard label="Unique visitors" value={String(summary?.unique_visitors ?? 0)} icon={UserCheck} />
        <StatCard
          label="Occupied seats"
          value={String(capacity?.current ?? 0)}
          icon={Activity}
          tone={capacity?.overCapacity ? 'warning' : 'default'}
        />
        <StatCard
          label="Maximum capacity"
          value={String(capacity?.capacity ?? 80)}
          note={`${capacity?.available ?? 0} spaces available`}
          icon={Users}
        />
        <StatCard
          label="Peak occupied seats"
          value={String(summary?.peak_occupancy ?? 0)}
          note={
            summary?.peak_occupancy_at
              ? new Date(summary.peak_occupancy_at).toLocaleString('en-PH', {
                  timeZone: 'Asia/Manila',
                  hour12: true,
                })
              : 'No seat visits'
          }
          icon={Clock3}
        />
      </div>

      <LibraryOperationsPanel manage collapseEventForm onChanged={() => void load()} />

      <SectionCard className="mb-5 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <select
            aria-label="Report period"
            className="sl-input"
            value={f.period}
            onChange={e => update({ period: e.target.value as AttendanceFilters['period'] })}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="semester">Per semester</option>
          </select>

          {f.period === 'daily' ? (
            <input
              aria-label="Attendance date"
              className="sl-input"
              type="date"
              value={f.date}
              onChange={e => update({ date: e.target.value })}
            />
          ) : null}
          {f.period === 'weekly' ? (
            <input
              aria-label="Week start"
              className="sl-input"
              type="date"
              value={f.weekStart}
              onChange={e => update({ weekStart: e.target.value })}
            />
          ) : null}
          {f.period === 'monthly' ? (
            <>
              <select
                aria-label="Month"
                className="sl-input"
                value={f.month}
                onChange={e => update({ month: Number(e.target.value) })}
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2026, i).toLocaleString('en', { month: 'long' })}
                  </option>
                ))}
              </select>
              <input
                aria-label="Year"
                className="sl-input"
                type="number"
                min="2000"
                max="2100"
                value={f.year}
                onChange={e => update({ year: Number(e.target.value) })}
              />
            </>
          ) : null}
          {f.period === 'semester' ? (
            <select
              aria-label="Academic term"
              className="sl-input"
              value={f.academicTermId}
              onChange={e => update({ academicTermId: e.target.value })}
            >
              <option value="">Select academic term</option>
              {terms.map(t => (
                <option key={t.academic_term_id} value={t.academic_term_id}>
                  {t.term_name} · {t.academic_year}
                </option>
              ))}
            </select>
          ) : null}

          <div className="relative">
            <Search
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--sl-text-muted)]"
            />
            <input
              aria-label="Search visitors"
              className="sl-input pl-9"
              placeholder="Name, ID, or email"
              value={f.q}
              onChange={e => update({ q: e.target.value })}
            />
          </div>

          <select
            aria-label="Filter by role"
            className="sl-input"
            value={f.role}
            onChange={e => update({ role: e.target.value })}
          >
            <option value="">All roles</option>
            {['Student', 'Faculty', 'Staff', 'Librarian', 'Admin'].map(v => (
              <option key={v}>{v}</option>
            ))}
          </select>

          <select
            aria-label="Filter by purpose"
            className="sl-input"
            value={f.purpose}
            onChange={e => update({ purpose: e.target.value })}
          >
            <option value="">All purposes</option>
            {['Library Visit', 'Study', 'Research', 'Book Borrowing', 'Printing', 'Photocopy'].map(v => (
              <option key={v} value={v}>
                {v === 'Book Borrowing' ? 'Borrow books' : v}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <select
              aria-label="Filter by presence"
              className="sl-input flex-1"
              value={f.presence}
              onChange={e => update({ presence: e.target.value })}
            >
              <option value="">All presence</option>
              <option value="inside">Inside</option>
              <option value="exited">Exited</option>
            </select>
            {hasFilters ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X size={14} aria-hidden="true" /> Clear
              </Button>
            ) : null}
          </div>
        </div>
      </SectionCard>

      <div className="mb-5 grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <SectionCard className="p-5">
          <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Arrivals by hour</h2>
          <p className="mt-1 text-xs font-medium text-[var(--sl-text-secondary)]">
            Busiest arrival hour: <strong>{summary?.busiest_arrival_hour ?? summary?.peak_hour ?? '—'}</strong> · Average completed visit:{' '}
            <strong>{summary?.average_visit ?? '—'}</strong>
          </p>
          <p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">
            Check-in timestamps for {analytics?.range.label ?? 'the selected period'}
          </p>
          <div className="mt-5 flex h-52 items-end gap-2 overflow-x-auto border-b border-[var(--sl-border)] px-2 pb-1">
            {Array.from({ length: 14 }, (_, index) => index + 7).map(hour => {
              const visits = analytics?.hourly.find(x => x.hour === hour)?.visits ?? 0
              const isPeak = visits === maxVisits && visits > 0
              return (
                <div key={hour} className="flex min-w-9 flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[10px] font-bold tabular-nums text-[var(--sl-text-header)]">
                    {visits || ''}
                  </span>
                  <div
                    title={`${hourLabel(hour)}: ${visits} visits`}
                    className={`w-full rounded-t-[4px] transition-all ${
                      isPeak ? 'bg-[#0b5ea2] ring-2 ring-[#FFF200]' : 'bg-[#0b5ea2]/80'
                    }`}
                    style={{ height: `${Math.max(visits ? 8 : 2, (visits / maxVisits) * 155)}px` }}
                  />
                  <span className="whitespace-nowrap text-[10px] text-[var(--sl-text-muted)]">
                    {hourLabel(hour)}
                  </span>
                </div>
              )
            })}
          </div>
        </SectionCard>

        <SectionCard className="p-5">
          <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Weekly utilization</h2>
          <p className="mt-1 text-xs text-[var(--sl-text-secondary)]">Darker cells represent higher check-in volume.</p>
          <div className="mt-5 space-y-2">
            {weekdays.map((day, weekday) => (
              <div key={day} className="grid grid-cols-[36px_repeat(7,1fr)] items-center gap-1.5">
                <span className="text-[11px] font-semibold text-[var(--sl-text-secondary)]">{day}</span>
                {[7, 9, 11, 13, 15, 17, 19].map(hour => {
                  const visits =
                    analytics?.heatmap
                      .filter(x => x.weekday === weekday && x.hour >= hour && x.hour < hour + 2)
                      .reduce((n, x) => n + x.visits, 0) ?? 0
                  return (
                    <div
                      key={hour}
                      title={`${day} ${hourLabel(hour)}: ${visits} visits`}
                      className={`h-7 rounded-[4px] ${
                        visits
                          ? visits >= maxVisits * 0.7
                            ? 'bg-[#0b5ea2]'
                            : visits >= maxVisits * 0.3
                              ? 'bg-[#0b5ea2]/55'
                              : 'bg-[#0b5ea2]/25'
                          : 'bg-[var(--sl-bg-subtle)]'
                      }`}
                    />
                  )
                })}
              </div>
            ))}
            <div className="ml-[42px] grid grid-cols-7 gap-1.5">
              {[7, 9, 11, 13, 15, 17, 19].map(h => (
                <span key={h} className="text-center text-[10px] text-[var(--sl-text-muted)]">
                  {hourLabel(h)}
                </span>
              ))}
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--sl-border)] px-5 py-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Attendance logs</h2>
            <p className="mt-0.5 text-xs text-[var(--sl-text-secondary)]">
              {summary?.range.label ?? 'Selected period'} · {pagination.total} records
            </p>
          </div>
        </div>
        <ResponsiveTable label="Attendance logs">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
              <tr>
                {['Visitor', 'Role', 'Date', 'Time in', 'Time out', 'Purpose', 'Presence'].map(h => (
                  <th key={h} scope="col" className="px-5 py-2.5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sl-border)]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-sm text-[var(--sl-text-secondary)]">
                    Loading attendance…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center">
                    <p className="font-semibold text-[var(--sl-text-header)]">
                      No attendance records match these filters.
                    </p>
                    {hasFilters ? (
                      <div className="mt-3">
                        <Button variant="secondary" size="sm" onClick={clearFilters}>
                          Clear filters
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ) : (
                rows.map(r => (
                  <tr key={r.id} className="align-top">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-[var(--sl-text-header)]">{r.visitor_name}</p>
                      <p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">{r.school_id}</p>
                    </td>
                    <td className="px-5 py-3.5 text-xs font-medium text-[var(--sl-text-secondary)]">{r.role}</td>
                    <td className="px-5 py-3.5 text-xs tabular-nums">{formatPhDate(r.attendance_date, 'medium')}</td>
                    <td className="px-5 py-3.5 text-xs tabular-nums">{formatManilaTime12(r.time_in)}</td>
                    <td className="px-5 py-3.5 text-xs tabular-nums">
                      <p>{r.time_out ? formatManilaTime12(r.time_out) : '—'}</p>
                      {r.checkout_source === 'Automatic closing' ? (
                        <p className="mt-0.5 text-[11px] text-[var(--sl-text-muted)]">Automatic closing checkout</p>
                      ) : null}
                      {r.time_out || (r.duration_minutes != null && r.duration_minutes > 0) ? (
                        <p className="mt-0.5 text-[11px] text-[var(--sl-text-muted)]">{r.duration_minutes ?? 0} min</p>
                      ) : r.presence === 'Inside' ? (
                        <p className="mt-0.5 text-[11px] text-[var(--sl-text-muted)]">In progress</p>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      {r.purpose === 'Book Borrowing' ? 'Borrow books' : r.purpose}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={r.presence} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ResponsiveTable>
        <div className="flex justify-end gap-2 border-t border-[var(--sl-border)] px-5 py-3.5 text-xs text-[var(--sl-text-secondary)]">
          <Button variant="secondary" size="sm" disabled={f.page <= 1} onClick={() => update({ page: f.page - 1 })}>
            Previous
          </Button>
          <span className="self-center font-semibold tabular-nums">
            Page {pagination.page} of {Math.max(1, pagination.total_pages)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={f.page >= pagination.total_pages}
            onClick={() => update({ page: f.page + 1 })}
          >
            Next
          </Button>
        </div>
      </SectionCard>

      <AttendanceScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} onRecorded={() => void load()} />
    </>
  )
}
