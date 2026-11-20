import { AlertTriangle, BookOpenCheck, CalendarClock, CheckCircle2, Search, ShieldCheck, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { Button, NoticeBanner, SectionCard, StatCard, StatusBadge } from '../../components/ui'
import { borrowingPoliciesApi } from '../borrowing-policies/borrowing-policies-api'
import type { BorrowingPolicyVersion, PublishBorrowingPolicyInput } from '../borrowing-policies/types'
import { circulationApi } from '../circulation/circulation-api'
import type { CirculationMonitorData, RenewalPreflightData } from '../circulation/types'
import { ReservationSettingsPanel } from './ReservationSettingsPanel'
import { RefreshButton } from '../../components/RefreshButton'

const fieldClass = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#0b5ea2] focus:ring-4 focus:ring-[#0b5ea2]/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

function todayCampusDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d)
}

function draftFromPolicy(version: BorrowingPolicyVersion | null): PublishBorrowingPolicyInput {
  return {
    effectiveOn: todayCampusDate(),
    studentMaxActiveBooks: version?.studentMaxActiveBooks ?? 2,
    facultyMaxActiveBooks: version?.facultyMaxActiveBooks ?? null,
    borrowingDays: version?.borrowingDays ?? 1,
    dueTimeCutoff: (version?.dueTimeCutoff ?? '08:59:00').slice(0, 5),
    maxRenewals: version?.maxRenewals ?? 1,
    renewalExtensionDays: version?.renewalExtensionDays ?? 1,
    studentMaxActiveReservations: version?.studentMaxActiveReservations ?? 2,
    facultyMaxActiveReservations: version?.facultyMaxActiveReservations ?? null,
    blockRenewalIfOverdue: version?.blockRenewalIfOverdue ?? true,
    blockRenewalIfUnpaidFines: version?.blockRenewalIfUnpaidFines ?? true,
    blockRenewalIfReserved: version?.blockRenewalIfReserved ?? true,
    longOverdueAfterDays: version?.longOverdueAfterDays ?? 14,
    // Desk hours carry forward so publishing other changes never clears them.
    borrowOpensAt: version?.borrowOpensAt ?? null,
    borrowClosesAt: version?.borrowClosesAt ?? null,
    returnOpensAt: version?.returnOpensAt ?? null,
    returnClosesAt: version?.returnClosesAt ?? null,
    changeReason: '',
    materialRules: version?.materialRules ?? [
      { materialType: 'Book', isBorrowable: true },
      { materialType: 'Thesis/Manuscript', isBorrowable: false },
    ],
  }
}

export function LibraryCirculationSetupPanel() {
  const [activePolicy, setActivePolicy] = useState<BorrowingPolicyVersion | null>(null)
  const [draft, setDraft] = useState<PublishBorrowingPolicyInput>(() => draftFromPolicy(null))
  const [policyBusy, setPolicyBusy] = useState(false)
  const [policyError, setPolicyError] = useState('')
  const [policyNotice, setPolicyNotice] = useState('')
  const [confirmingPolicy, setConfirmingPolicy] = useState(false)

  const [loans, setLoans] = useState<CirculationMonitorData['items']>([])
  const [loansBusy, setLoansBusy] = useState(false)
  const [loansError, setLoansError] = useState('')
  const [loanSearch, setLoanSearch] = useState('')
  const [selectedLoanId, setSelectedLoanId] = useState<number | null>(null)
  const [preflight, setPreflight] = useState<RenewalPreflightData | null>(null)
  const [preflightBusy, setPreflightBusy] = useState(false)
  const [staffNote, setStaffNote] = useState('')
  const [renewBusy, setRenewBusy] = useState(false)
  const [renewError, setRenewError] = useState('')
  const [renewNotice, setRenewNotice] = useState('')

  const loadPolicyAndLoans = useCallback(async () => {
    setPolicyBusy(true)
    setLoansBusy(true)
    const [policyResult, monitorResult] = await Promise.allSettled([
      borrowingPoliciesApi.list(),
      circulationApi.monitor(1),
    ])
    if (policyResult.status === 'fulfilled') {
      const active = policyResult.value.active ?? null
      setActivePolicy(active)
      setDraft(draftFromPolicy(active))
      setConfirmingPolicy(false)
      setPolicyError('')
    } else {
      setPolicyError(policyResult.reason instanceof Error ? policyResult.reason.message : 'Unable to load waitlist and renewal policies.')
    }
    setPolicyBusy(false)

    if (monitorResult.status === 'fulfilled') {
      const activeBorrowings = monitorResult.value.items.filter((item) =>
        ['Borrowed', 'Active', 'Overdue'].includes(item.status),
      )
      setLoans(activeBorrowings)
      setLoansError('')
    } else {
      setLoansError(monitorResult.reason instanceof Error ? monitorResult.reason.message : 'Active student loans could not be loaded.')
    }
    setLoansBusy(false)
  }, [])

  useEffect(() => {
    void loadPolicyAndLoans()
  }, [loadPolicyAndLoans])

  function updateDraft(patch: Partial<PublishBorrowingPolicyInput>) {
    setDraft((current) => ({ ...current, ...patch }))
    setConfirmingPolicy(false)
    setPolicyError('')
  }

  const validationIssue = useMemo(() => {
    if (!Number.isInteger(draft.studentMaxActiveReservations) || draft.studentMaxActiveReservations < 1 || draft.studentMaxActiveReservations > 20) {
      return 'Student waitlist & reservation limit must be a whole number from 1 to 20.'
    }
    if (draft.facultyMaxActiveReservations !== null && (!Number.isInteger(draft.facultyMaxActiveReservations) || draft.facultyMaxActiveReservations < 1 || draft.facultyMaxActiveReservations > 100)) {
      return 'Faculty waitlist & reservation limit must be between 1 and 100, or left blank for unlimited.'
    }
    if (!Number.isInteger(draft.maxRenewals) || draft.maxRenewals < 0 || draft.maxRenewals > 10) {
      return 'Max renewals per borrowed book must be between 0 and 10.'
    }
    if (!Number.isInteger(draft.renewalExtensionDays) || draft.renewalExtensionDays < 1 || draft.renewalExtensionDays > 60) {
      return 'Renewal extension period must be between 1 and 60 operating days.'
    }
    if (draft.maxRenewals > 0 && draft.renewalExtensionDays > draft.borrowingDays * 3) {
      return `Renewal extension (${draft.renewalExtensionDays} days) cannot exceed 3× the standard borrowing period (${draft.borrowingDays * 3} days).`
    }
    if (!Number.isInteger(draft.longOverdueAfterDays) || draft.longOverdueAfterDays < draft.borrowingDays || draft.longOverdueAfterDays > 365) {
      return `Long-overdue escalation threshold must be at least ${draft.borrowingDays} day(s) and at most 365 days.`
    }
    return ''
  }, [draft])

  async function saveWaitlistAndRenewalRules(event: FormEvent) {
    event.preventDefault()
    if (validationIssue) {
      setPolicyError(validationIssue)
      return
    }
    if (draft.changeReason.trim().length < 10) {
      setPolicyError('Enter a reason of at least 10 characters explaining the waitlist or renewal rule adjustment.')
      return
    }
    if (!confirmingPolicy) {
      setConfirmingPolicy(true)
      setPolicyError('')
      return
    }
    setPolicyBusy(true)
    setPolicyError('')
    setPolicyNotice('')
    try {
      const cutoff = draft.dueTimeCutoff.length === 5 ? `${draft.dueTimeCutoff}:00` : draft.dueTimeCutoff
      const created = await borrowingPoliciesApi.publish({
        ...draft,
        dueTimeCutoff: cutoff,
        changeReason: draft.changeReason.trim(),
      })
      setConfirmingPolicy(false)
      setPolicyNotice(`Waitlist and renewal rules saved (${created.displayName} is now ${created.status}).`)
      await loadPolicyAndLoans()
    } catch (cause) {
      setPolicyError(cause instanceof Error ? cause.message : 'Unable to save waitlist and renewal rules.')
      setConfirmingPolicy(false)
    } finally {
      setPolicyBusy(false)
    }
  }

  const filteredLoans = useMemo(() => {
    const q = loanSearch.trim().toLowerCase()
    if (!q) return loans
    return loans.filter((loan) =>
      [loan.userName, loan.schoolId, loan.title, loan.accessionNumber ?? '', loan.barcode]
        .some((val) => val.toLowerCase().includes(q)),
    )
  }, [loans, loanSearch])

  async function inspectRenewalEligibility(transactionId: number) {
    setSelectedLoanId(transactionId)
    setPreflight(null)
    setPreflightBusy(true)
    setRenewError('')
    setRenewNotice('')
    try {
      const result = await circulationApi.preflightRenewal(transactionId, true)
      setPreflight(result)
    } catch (cause) {
      setRenewError(cause instanceof Error ? cause.message : 'Could not check renewal eligibility for this loan.')
    } finally {
      setPreflightBusy(false)
    }
  }

  async function confirmStudentRenewal(transactionId: number) {
    if (staffNote.trim().length < 5) {
      setRenewError('Enter a brief staff note (at least 5 characters) explaining why this student loan is being renewed.')
      return
    }
    setRenewBusy(true)
    setRenewError('')
    setRenewNotice('')
    try {
      const requestKey = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `renew-${transactionId}-${Date.now()}`
      const decision = await circulationApi.staffRenewal(transactionId, requestKey, staffNote.trim())
      if (decision.status === 'Approved') {
        setRenewNotice(`Book renewed for student. New due date: ${formatDateTime(decision.newDueAt)}.`)
        setSelectedLoanId(null)
        setPreflight(null)
        setStaffNote('')
        await loadPolicyAndLoans()
      } else {
        setRenewError(decision.decisionSummary || 'Renewal was rejected by circulation policy.')
      }
    } catch (cause) {
      setRenewError(cause instanceof Error ? cause.message : 'Could not complete the book renewal.')
    } finally {
      setRenewBusy(false)
    }
  }

  return (
    <div className="space-y-6 text-slate-900 dark:text-slate-100">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Student waitlist cap"
          value={`${activePolicy?.studentMaxActiveReservations ?? 2} requests`}
          note="Max active reservations / waitlist spots per student"
          icon={Users}
          tone="blue"
        />
        <StatCard
          label="Book renewal allowance"
          value={`${activePolicy?.maxRenewals ?? 1} × ${activePolicy?.renewalExtensionDays ?? 1} day(s)`}
          note="Renewals allowed per borrowed book"
          icon={CalendarClock}
          tone="green"
        />
        <StatCard
          label="Active borrowed books"
          value={String(loans.length)}
          note="Loans currently eligible for counter renewal review"
          icon={BookOpenCheck}
          tone="amber"
        />
      </div>

      {/* Section 1: Reservation Pickup Window & Waiting-List Expiry Maintenance */}
      <div className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">Reservation expiry maintenance</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Control how many days a ready book is held for pickup and when unclaimed waiting-list requests automatically expire.
          </p>
        </div>
        <ReservationSettingsPanel />
      </div>

      {/* Section 2: Waitlist Capacity & Student Renewal Rules Maintenance */}
      <SectionCard className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3 dark:border-slate-700/60">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">Waitlist limit &amp; book renewal policy maintenance</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Adjust maximum waitlist reservations per borrower, maximum renewals for borrowed books, extension days, and automatic renewal blockers.
            </p>
          </div>
          <RefreshButton label="Refresh policy" onRefresh={() => loadPolicyAndLoans()} variant="secondary" disabled={policyBusy} />
        </div>

        {policyError ? <NoticeBanner tone="error" className="mb-4">{policyError}</NoticeBanner> : null}
        {policyNotice ? <NoticeBanner tone="success" className="mb-4">{policyNotice}</NoticeBanner> : null}

        <form onSubmit={saveWaitlistAndRenewalRules} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            Student waitlist &amp; reservation limit (1–20)
            <input
              required
              type="number"
              min={1}
              max={20}
              value={draft.studentMaxActiveReservations}
              onChange={(event) => updateDraft({ studentMaxActiveReservations: Number(event.target.value) })}
              className={`${fieldClass} mt-1.5`}
            />
            <span className="mt-1 block text-[11px] font-normal normal-case text-slate-500">
              Maximum queued + ready reservations a student can hold at once.
            </span>
          </label>

          <label className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            Faculty waitlist &amp; reservation limit
            <input
              type="number"
              min={1}
              max={100}
              placeholder="Unlimited"
              value={draft.facultyMaxActiveReservations ?? ''}
              onChange={(event) => updateDraft({ facultyMaxActiveReservations: event.target.value === '' ? null : Number(event.target.value) })}
              className={`${fieldClass} mt-1.5`}
            />
            <span className="mt-1 block text-[11px] font-normal normal-case text-slate-500">
              Leave blank for unlimited faculty waitlist requests (or set 1–100).
            </span>
          </label>

          <label className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            Max renewals per borrowed book (0–10)
            <input
              required
              type="number"
              min={0}
              max={10}
              value={draft.maxRenewals}
              onChange={(event) => updateDraft({ maxRenewals: Number(event.target.value) })}
              className={`${fieldClass} mt-1.5`}
            />
            <span className="mt-1 block text-[11px] font-normal normal-case text-slate-500">
              Set to 0 to disable student renewals, or 1–10 renewals per checkout.
            </span>
          </label>

          <label className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            Renewal extension days (1–60)
            <input
              required
              type="number"
              min={1}
              max={60}
              value={draft.renewalExtensionDays}
              onChange={(event) => updateDraft({ renewalExtensionDays: Number(event.target.value) })}
              className={`${fieldClass} mt-1.5`}
            />
            <span className="mt-1 block text-[11px] font-normal normal-case text-slate-500">
              Operating days added to the due date each time a book is renewed.
            </span>
          </label>

          <label className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            Long-overdue threshold (days)
            <input
              required
              type="number"
              min={1}
              max={365}
              value={draft.longOverdueAfterDays}
              onChange={(event) => updateDraft({ longOverdueAfterDays: Number(event.target.value) })}
              className={`${fieldClass} mt-1.5`}
            />
            <span className="mt-1 block text-[11px] font-normal normal-case text-slate-500">
              Days past due before a loan escalates to a long-overdue case.
            </span>
          </label>

          <label className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            Effective start date
            <input
              required
              type="date"
              min={todayCampusDate()}
              value={draft.effectiveOn}
              onChange={(event) => updateDraft({ effectiveOn: event.target.value })}
              className={`${fieldClass} mt-1.5`}
            />
            <span className="mt-1 block text-[11px] font-normal normal-case text-slate-500">
              Campus date when these waitlist &amp; renewal limits take effect.
            </span>
          </label>

          <fieldset className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 sm:col-span-2 lg:col-span-3 dark:border-slate-700/60 dark:bg-slate-800/40">
            <legend className="px-1 text-xs font-bold uppercase tracking-wide text-[#0b5ea2] dark:text-sky-300">
              Renewal safety validations &amp; blockers
            </legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <label className="flex items-start gap-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={draft.blockRenewalIfOverdue}
                  onChange={(event) => updateDraft({ blockRenewalIfOverdue: event.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0b5ea2]"
                />
                <span>Block renewal if book is already overdue</span>
              </label>
              <label className="flex items-start gap-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={draft.blockRenewalIfUnpaidFines}
                  onChange={(event) => updateDraft({ blockRenewalIfUnpaidFines: event.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0b5ea2]"
                />
                <span>Block renewal if student has unpaid fines</span>
              </label>
              <label className="flex items-start gap-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={draft.blockRenewalIfReserved}
                  onChange={(event) => updateDraft({ blockRenewalIfReserved: event.target.checked })}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0b5ea2]"
                />
                <span>Block renewal if another student is on the waitlist</span>
              </label>
            </div>
          </fieldset>

          <label className="text-xs font-bold uppercase tracking-wide text-slate-700 sm:col-span-2 lg:col-span-3 dark:text-slate-200">
            Reason for waitlist / renewal policy change (min 10 characters)
            <input
              required
              minLength={10}
              maxLength={500}
              placeholder="e.g. Adjusted student waitlist cap and renewal extension for midterm research period"
              value={draft.changeReason}
              onChange={(event) => updateDraft({ changeReason: event.target.value })}
              className={`${fieldClass} mt-1.5`}
            />
          </label>

          {validationIssue ? (
            <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950 sm:col-span-2 lg:col-span-3 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{validationIssue}</span>
            </div>
          ) : null}

          {confirmingPolicy ? (
            <div className="rounded-xl border border-[#0b5ea2]/25 bg-[#0b5ea2]/5 p-3.5 text-xs sm:col-span-2 lg:col-span-3 dark:border-sky-500/30 dark:bg-sky-950/30">
              <p className="flex items-center gap-1.5 font-bold text-[#0b5ea2] dark:text-sky-300">
                <CheckCircle2 size={15} /> Confirm waitlist &amp; renewal settings before saving
              </p>
              <p className="mt-1 text-slate-700 dark:text-slate-200">
                Student waitlist cap: <strong>{draft.studentMaxActiveReservations}</strong> · Faculty waitlist cap: <strong>{draft.facultyMaxActiveReservations ?? 'Unlimited'}</strong> · Renewals: <strong>{draft.maxRenewals} × {draft.renewalExtensionDays} day(s)</strong> · Effective: <strong>{draft.effectiveOn}</strong>
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 sm:col-span-2 lg:col-span-3">
            {confirmingPolicy ? (
              <Button variant="secondary" type="button" disabled={policyBusy} onClick={() => setConfirmingPolicy(false)}>
                Keep editing
              </Button>
            ) : null}
            <Button type="submit" disabled={policyBusy || Boolean(validationIssue)}>
              {confirmingPolicy ? 'Confirm & publish waitlist/renewal rules' : 'Review & save waitlist/renewal rules'}
            </Button>
          </div>
        </form>
      </SectionCard>

      {/* Section 3: Student Borrowed-Book Renewal Desk */}
      <SectionCard className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50/70 px-5 py-4 dark:border-slate-700/60 dark:bg-slate-800/40">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">Student borrowed-book renewal desk</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Search active borrowed books and renew loans on behalf of students after checking renewal eligibility and waitlist blockers.
            </p>
          </div>
          <label className="relative w-full sm:w-80">
            <Search size={15} className="absolute left-3 top-3.5 text-slate-400" />
            <input
              aria-label="Search borrowed books to renew"
              placeholder="Search student, ID, book title, or accession #..."
              value={loanSearch}
              onChange={(event) => setLoanSearch(event.target.value)}
              className={`${fieldClass} pl-9`}
            />
          </label>
        </div>

        <div className="p-5 space-y-4">
          {loansError ? <NoticeBanner tone="error">{loansError}</NoticeBanner> : null}
          {renewError ? <NoticeBanner tone="error">{renewError}</NoticeBanner> : null}
          {renewNotice ? <NoticeBanner tone="success">{renewNotice}</NoticeBanner> : null}

          <ResponsiveTable>
            <table aria-label="Borrowed books for renewal" className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-100/80 text-xs font-bold uppercase tracking-wider text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3">Student / Borrower</th>
                  <th className="px-4 py-3">Borrowed Book &amp; Accession #</th>
                  <th className="px-4 py-3">Current Due Date</th>
                  <th className="px-4 py-3">Renewals Used</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Renewal Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/50">
                {loansBusy ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading active borrowed books…</td>
                  </tr>
                ) : filteredLoans.length ? (
                  filteredLoans.map((loan) => {
                    const isSelected = selectedLoanId === loan.transactionId
                    return (
                      <tr key={loan.transactionId} className="align-top hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-900 dark:text-slate-100">{loan.userName}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{loan.schoolId} · {loan.role}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[#0b5ea2] dark:text-sky-300">{loan.title}</p>
                          <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                            {loan.accessionNumber ?? loan.barcode}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-700 dark:text-slate-200">
                          {formatDateTime(loan.dueDate)}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
                            {loan.renewalCount} / {loan.maxRenewals}
                          </span>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {loan.remainingRenewals} remaining
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={loan.status} />
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant={isSelected ? 'primary' : 'secondary'}
                            disabled={preflightBusy || renewBusy}
                            onClick={() => void inspectRenewalEligibility(loan.transactionId)}
                          >
                            <ShieldCheck size={15} />
                            {isSelected && preflightBusy ? 'Checking…' : 'Renew book'}
                          </Button>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                      No active borrowed books match your filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ResponsiveTable>

          {selectedLoanId !== null && preflight ? (
            <div className="rounded-2xl border border-[#0b5ea2]/25 bg-[#0b5ea2]/5 p-4 dark:border-sky-500/30 dark:bg-sky-950/30">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-base font-bold text-[#0b5ea2] dark:text-sky-300">
                  Renewal eligibility check — Loan #{preflight.transactionId}
                </h3>
                <Button variant="ghost" onClick={() => { setSelectedLoanId(null); setPreflight(null) }}>
                  Close
                </Button>
              </div>
              <div className="mt-2 grid gap-3 text-xs sm:grid-cols-3">
                <div>
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Current due date:</span>
                  <p className="font-bold text-slate-900 dark:text-slate-100">{formatDateTime(preflight.currentDueAt)}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Proposed new due date:</span>
                  <p className="font-bold text-emerald-700 dark:text-emerald-300">{formatDateTime(preflight.proposedDueAt)}</p>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Renewals remaining:</span>
                  <p className="font-bold text-slate-900 dark:text-slate-100">{preflight.remainingRenewals ?? '—'}</p>
                </div>
              </div>

              {preflight.blockers.length > 0 ? (
                <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                  <p className="font-bold">Renewal blocked by library policy:</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    {preflight.blockers.map((b) => (
                      <li key={b.code}>{b.message}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
                    Staff note for student renewal *
                    <input
                      required
                      minLength={5}
                      maxLength={250}
                      placeholder="e.g. Student requested counter renewal for ongoing thesis chapter"
                      value={staffNote}
                      onChange={(event) => setStaffNote(event.target.value)}
                      className={`${fieldClass} mt-1.5`}
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button
                      disabled={renewBusy || !preflight.canRequestRenewal}
                      onClick={() => void confirmStudentRenewal(preflight.transactionId)}
                    >
                      {renewBusy ? 'Renewing borrowed book…' : 'Confirm student book renewal'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  )
}
