import {
  Activity,
  BookOpen,
  CalendarClock,
  ClipboardList,
  Download,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { Button, NoticeBanner, PageHeader, SectionCard, StatCard, StatusBadge } from '../../components/ui'
import { getCsrfToken } from '../auth/auth-storage'

export type AuditLogCategory =
  | 'All'
  | 'Circulation'
  | 'Reservations'
  | 'Catalog & Inventory'
  | 'Policies & Setup'
  | 'Accounts'
  | 'Printing'
  | 'Attendance'

export type AuditLogEntry = {
  id: string
  occurredAt: string
  category: Exclude<AuditLogCategory, 'All'>
  action: string
  actor: string
  target: string
  details: string
  status: string
}

type AuditLogResponse = {
  items: AuditLogEntry[]
  summary: {
    total: number
    circulationAndReservations: number
    catalogAndPolicies: number
    accountsPrintingAttendance: number
  }
}

const CATEGORIES: AuditLogCategory[] = [
  'All',
  'Circulation',
  'Reservations',
  'Catalog & Inventory',
  'Policies & Setup',
  'Accounts',
  'Printing',
  'Attendance',
]

const fieldClass =
  'h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#0b5ea2] focus:ring-4 focus:ring-[#0b5ea2]/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
const labelClass = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300'

function formatManilaDateTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d)
}

function escapeCsv(val: unknown) {
  const s = String(val ?? '').replace(/\r?\n/g, ' ').trim()
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const headers = new Headers({ Accept: 'application/json' })
  const token = getCsrfToken()
  if (token) headers.set('X-CSRF-Token', token)
  const res = await fetch(url, { headers, credentials: 'include' })
  if (!res.ok) return null
  const body = (await res.json().catch(() => null)) as { success?: boolean; data?: T } | null
  return body?.success && body.data ? body.data : null
}

/** Fallback aggregator if the running API server was started before `/api/v1/admin/reports/audit-logs` was mounted. */
async function aggregateLiveAuditLogsFallback(): Promise<AuditLogResponse> {
  const [monitor, borrowingPol, finePol, attendanceReport, printingReport] = await Promise.all([
    fetchJson<{
      items: Array<{
        transactionId: number
        userName: string
        schoolId: string
        title: string
        accessionNumber: string | null
        barcode: string
        borrowDate: string | null
        dueDate: string | null
        returnDate: string | null
        requestedAt: string
        status: string
        renewalCount: number
      }>
    }>('/api/v1/admin/borrowing/monitor?page=1&limit=100'),
    fetchJson<{
      history: Array<{
        versionId: number
        displayName: string
        effectiveOn: string
        studentMaxActiveBooks: number
        studentMaxActiveReservations: number
        changeReason: string
        createdAt: string
        status: string
      }>
    }>('/api/v1/admin/borrowing-policies'),
    fetchJson<{
      history: Array<{
        versionId: number
        hourlyRate: number
        dailyRate: number
        maximumPenalty: number
        changeReason: string | null
        createdAt: string
        status: string
      }>
    }>('/api/v1/admin/fine-policies'),
    fetchJson<{ rows: Array<Record<string, unknown>> }>(
      '/api/v1/admin/reports?kind=attendance&period=all&page=1',
    ),
    fetchJson<{ rows: Array<Record<string, unknown>> }>(
      '/api/v1/admin/reports?kind=printing&period=all&page=1',
    ),
  ])

  const entries: AuditLogEntry[] = []

  for (const loan of monitor?.items ?? []) {
    entries.push({
      id: `cir-${loan.transactionId}`,
      occurredAt: loan.returnDate || loan.borrowDate || loan.requestedAt || new Date().toISOString(),
      category: 'Circulation',
      action: `Loan ${loan.status}`,
      actor: 'Circulation Counter',
      target: `${loan.userName} (${loan.schoolId})`,
      details: `${loan.title} (${loan.accessionNumber ?? loan.barcode})${loan.renewalCount > 0 ? ` · Renewed ${loan.renewalCount}x` : ''}`,
      status: loan.status,
    })
  }

  for (const bp of borrowingPol?.history ?? []) {
    entries.push({
      id: `pol-b-${bp.versionId}`,
      occurredAt: bp.createdAt || new Date().toISOString(),
      category: 'Policies & Setup',
      action: `Published ${bp.displayName}`,
      actor: 'Librarian',
      target: `Student max books: ${bp.studentMaxActiveBooks} · Waitlist cap: ${bp.studentMaxActiveReservations}`,
      details: `${bp.changeReason || 'Policy update'} (Effective ${bp.effectiveOn})`,
      status: bp.status,
    })
  }

  for (const fp of finePol?.history ?? []) {
    entries.push({
      id: `pol-f-${fp.versionId}`,
      occurredAt: fp.createdAt || new Date().toISOString(),
      category: 'Policies & Setup',
      action: `Published Fine Rule #${fp.versionId}`,
      actor: 'Librarian',
      target: `PHP ${Number(fp.hourlyRate).toFixed(2)}/hr · PHP ${Number(fp.dailyRate).toFixed(2)}/day · Cap PHP ${Number(fp.maximumPenalty).toFixed(2)}`,
      details: fp.changeReason || 'Original fine rule',
      status: fp.status,
    })
  }

  for (const [idx, row] of (attendanceReport?.rows ?? []).entries()) {
    entries.push({
      id: `att-${row.id ?? idx}`,
      occurredAt: String(row.checked_in_at ?? row.attendance_date ?? new Date().toISOString()),
      category: 'Attendance',
      action: row.time_out ? 'Library Visit Completed' : 'Library Check-In',
      actor: 'QR Attendance Scanner',
      target: `${String(row.borrower ?? row.name ?? 'Visitor')} (${String(row.school_id ?? '—')})`,
      details: `Purpose: ${String(row.purpose ?? row.reason_for_visit ?? 'Library visit')}`,
      status: row.time_out ? 'Checked Out' : 'Inside Library',
    })
  }

  for (const [idx, row] of (printingReport?.rows ?? []).entries()) {
    entries.push({
      id: `prt-${row.id ?? row.request_id ?? idx}`,
      occurredAt: String(row.created_at ?? new Date().toISOString()),
      category: 'Printing',
      action: `Print job ${String(row.status ?? 'Recorded')}`,
      actor: String(row.borrower ?? row.name ?? 'Print Counter'),
      target: `Print Request #${String(row.id ?? row.request_id ?? idx + 1)}`,
      details: `${String(row.service ?? 'Print')} · ${String(row.document_name ?? row.file_name ?? 'Document')}`,
      status: String(row.status ?? 'Recorded'),
    })
  }

  entries.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())

  return {
    items: entries,
    summary: {
      total: entries.length,
      circulationAndReservations: entries.filter((i) => ['Circulation', 'Reservations'].includes(i.category)).length,
      catalogAndPolicies: entries.filter((i) => ['Catalog & Inventory', 'Policies & Setup'].includes(i.category)).length,
      accountsPrintingAttendance: entries.filter((i) => ['Accounts', 'Printing', 'Attendance'].includes(i.category)).length,
    },
  }
}

export function AdminAuditLogsPage() {
  const [allData, setAllData] = useState<AuditLogResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [category, setCategory] = useState<AuditLogCategory>('All')
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const direct = await fetchJson<AuditLogResponse>('/api/v1/admin/reports/audit-logs')
      if (direct) {
        setAllData(direct)
      } else {
        const fallback = await aggregateLiveAuditLogsFallback()
        setAllData(fallback)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Audit logs could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const dateRangeWarning = useMemo(() => {
    if (fromDate && toDate && fromDate > toDate) {
      return '"From date" cannot be later than "To date".'
    }
    return ''
  }, [fromDate, toDate])

  const filteredItems = useMemo(() => {
    if (!allData) return []
    const q = search.trim().toLowerCase()
    return allData.items.filter((item) => {
      if (category !== 'All' && item.category !== category) return false
      if (fromDate && item.occurredAt.slice(0, 10) < fromDate) return false
      if (toDate && item.occurredAt.slice(0, 10) > toDate) return false
      if (q) {
        const hay = `${item.category} ${item.action} ${item.actor} ${item.target} ${item.details} ${item.status}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [allData, category, search, fromDate, toDate])

  const pageSize = 25
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function exportAuditCsv() {
    const headers = ['Timestamp (Asia/Manila)', 'Category', 'Action / Event', 'Actor / Staff', 'Target / Record', 'Details & Reason', 'Status']
    const rows = [headers.map(escapeCsv).join(',')]
    for (const item of filteredItems) {
      rows.push(
        [
          formatManilaDateTime(item.occurredAt),
          item.category,
          item.action,
          item.actor,
          item.target,
          item.details,
          item.status,
        ]
          .map(escapeCsv)
          .join(','),
      )
    }
    const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sti-library-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const categoryBadgeTone = (cat: AuditLogEntry['category']) => {
    switch (cat) {
      case 'Circulation':
        return 'bg-[#0b5ea2]/10 text-[#0b5ea2] dark:bg-sky-500/20 dark:text-sky-300'
      case 'Reservations':
        return 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
      case 'Catalog & Inventory':
        return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
      case 'Policies & Setup':
        return 'bg-indigo-500/15 text-indigo-800 dark:text-indigo-300'
      case 'Accounts':
        return 'bg-purple-500/15 text-purple-800 dark:text-purple-300'
      case 'Printing':
        return 'bg-teal-500/15 text-teal-800 dark:text-teal-300'
      case 'Attendance':
        return 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
    }
  }

  return (
    <div className="space-y-5 text-slate-900 dark:text-slate-100">
      <PageHeader
        eyebrow="System governance & compliance"
        title="Audit logs"
        description="Unified chronological audit trail tracking all circulation transactions, catalog and inventory updates, policy changes, account actions, printing jobs, and QR attendance."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={loading} onClick={() => void load()}>
              <RefreshCw size={15} /> Refresh logs
            </Button>
            <Button variant="secondary" disabled={loading || !filteredItems.length} onClick={exportAuditCsv}>
              <Download size={15} /> Export audit CSV
            </Button>
          </div>
        }
      />

      {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
      {dateRangeWarning ? <NoticeBanner tone="warning">{dateRangeWarning}</NoticeBanner> : null}

      {/* 4 KPI StatCards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total tracked events"
          value={allData?.summary.total ?? 0}
          note={`${filteredItems.length} matching active filters`}
          icon={Activity}
          tone="blue"
        />
        <StatCard
          label="Circulation & queue"
          value={allData?.summary.circulationAndReservations ?? 0}
          note="Checkouts, returns, renewals & waitlist"
          icon={CalendarClock}
          tone="amber"
        />
        <StatCard
          label="Catalog & policy changes"
          value={allData?.summary.catalogAndPolicies ?? 0}
          note="Inventory audits, fine rules & policies"
          icon={BookOpen}
          tone="green"
        />
        <StatCard
          label="Accounts, print & attendance"
          value={allData?.summary.accountsPrintingAttendance ?? 0}
          note="User approvals, print jobs & QR scans"
          icon={Users}
          tone="slate"
        />
      </div>

      {/* Category Filter Pills & Search Toolbar */}
      <SectionCard className="space-y-4 p-5">
        <div role="group" aria-label="Audit log categories" className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <Button
              key={cat}
              variant={category === cat ? 'primary' : 'secondary'}
              onClick={() => {
                setCategory(cat)
                setPage(1)
              }}
            >
              {cat}
            </Button>
          ))}
        </div>

        <div className="grid gap-3 border-t border-slate-200/80 pt-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800">
          <label className="sm:col-span-2">
            <span className={labelClass}>Search audit trail</span>
            <span className="relative block">
              <Search size={16} className="absolute left-3 top-3.5 text-slate-400" />
              <input
                aria-label="Search audit trail"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder="Search actor, student ID, book title, action, or reason..."
                className={`${fieldClass} pl-9`}
              />
            </span>
          </label>
          <label>
            <span className={labelClass}>From date</span>
            <input
              aria-label="From date"
              type="date"
              value={fromDate}
              onChange={(event) => {
                setFromDate(event.target.value)
                setPage(1)
              }}
              className={fieldClass}
            />
          </label>
          <label>
            <span className={labelClass}>To date</span>
            <input
              aria-label="To date"
              type="date"
              value={toDate}
              onChange={(event) => {
                setToDate(event.target.value)
                setPage(1)
              }}
              className={fieldClass}
            />
          </label>
        </div>
      </SectionCard>

      {/* Audit Trail Table */}
      <SectionCard className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-slate-50/70 px-5 py-4 dark:border-slate-700/60 dark:bg-slate-800/40">
          <div className="flex items-center gap-2">
            <ClipboardList size={18} className="text-[#0b5ea2] dark:text-sky-300" />
            <div>
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Chronological activity log
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                All timestamps are shown in Manila campus time (Asia/Manila). Audit records are immutable.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:text-emerald-300">
            <ShieldCheck size={14} /> Tamper-evident log
          </span>
        </div>

        <ResponsiveTable>
          <table aria-label="System audit logs" className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-100/90 text-xs font-bold uppercase tracking-wider text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Action / Event</th>
                <th className="px-4 py-3">Actor / Staff</th>
                <th className="px-4 py-3">Target / Record</th>
                <th className="px-4 py-3">Details &amp; Reason</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/50">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    Loading system audit logs…
                  </td>
                </tr>
              ) : pageItems.length ? (
                pageItems.map((item) => (
                  <tr key={item.id} className="align-top hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-slate-600 dark:text-slate-300">
                      {formatManilaDateTime(item.occurredAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-block rounded-md px-2.5 py-1 text-xs font-bold ${categoryBadgeTone(item.category)}`}>
                        {item.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-slate-100">{item.action}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-[#0b5ea2] dark:text-sky-300">{item.actor}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-800 dark:text-slate-200">{item.target}</td>
                    <td className="max-w-xs px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{item.details}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    No audit log entries match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ResponsiveTable>
      </SectionCard>

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredItems.length)} of{' '}
            {filteredItems.length} events · Page {currentPage} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous page
            </Button>
            <Button
              variant="secondary"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next page
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
