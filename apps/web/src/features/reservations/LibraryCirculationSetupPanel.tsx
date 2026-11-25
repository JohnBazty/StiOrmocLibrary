import {
  AlertTriangle,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { RefreshButton } from '../../components/RefreshButton'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { Button, NoticeBanner, SectionCard, StatCard, StatusBadge } from '../../components/ui'
import { borrowingPoliciesApi } from '../borrowing-policies/borrowing-policies-api'
import type { BorrowingPolicyVersion, PublishBorrowingPolicyInput } from '../borrowing-policies/types'
import { circulationApi } from '../circulation/circulation-api'
import type { CirculationMonitorData, RenewalPreflightData } from '../circulation/types'
import { ReservationSettingsPanel } from './ReservationSettingsPanel'

const fieldClass =
  'h-11 w-full rounded-[8px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] px-3 text-sm text-[var(--sl-text-header)] outline-none transition focus:border-[#0b5ea2] focus:ring-3 focus:ring-[#0b5ea2]/15'

const formatDays = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`
const formatRequests = (n: number) => `${n} ${n === 1 ? 'request' : 'requests'}`
function formatRenewalAllowance(renewals: number | null, days: number) {
  if (renewals == null) return `Unlimited · +${formatDays(days)} each`
  if (renewals === 0) return 'No renewals'
  if (renewals === 1) return `1 renewal · +${formatDays(days)}`
  return `${renewals} renewals · +${formatDays(days)} each`
}

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
    facultyMaxRenewals: version?.facultyMaxRenewals ?? null,
    facultyRenewalExtensionDays: version?.facultyRenewalExtensionDays ?? null,
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
  const [policyRoleTab, setPolicyRoleTab] = useState<'Student' | 'Faculty'>('Student')

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
      setPolicyError(
        policyResult.reason instanceof Error
          ? policyResult.reason.message
          : 'Unable to load waitlist and renewal policies.',
      )
    }
    setPolicyBusy(false)

    if (monitorResult.status === 'fulfilled') {
      const activeBorrowings = monitorResult.value.items.filter((item) =>
        ['Borrowed', 'Active', 'Overdue'].includes(item.status),
      )
      setLoans(activeBorrowings)
      setLoansError('')
    } else {
      setLoansError(
        monitorResult.reason instanceof Error
          ? monitorResult.reason.message
          : 'Active student loans could not be loaded.',
      )
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
    if (
      !Number.isInteger(draft.studentMaxActiveReservations) ||
      draft.studentMaxActiveReservations < 1 ||
      draft.studentMaxActiveReservations > 20
    ) {
      return 'Student waitlist & reservation limit must be a whole number from 1 to 20.'
    }
    if (
      draft.facultyMaxActiveReservations !== null &&
      (!Number.isInteger(draft.facultyMaxActiveReservations) ||
        draft.facultyMaxActiveReservations < 1 ||
        draft.facultyMaxActiveReservations > 100)
    ) {
      return 'Faculty waitlist & reservation limit must be between 1 and 100, or left blank for unlimited.'
    }
    if (!Number.isInteger(draft.maxRenewals) || draft.maxRenewals < 0 || draft.maxRenewals > 10) {
      return 'Max renewals per borrowed book must be between 0 and 10.'
    }
    if (
      !Number.isInteger(draft.renewalExtensionDays) ||
      draft.renewalExtensionDays < 1 ||
      draft.renewalExtensionDays > 60
    ) {
      return 'Extra days per renewal must be between 1 and 60 operating days.'
    }
    if (draft.maxRenewals > 0 && draft.renewalExtensionDays > draft.borrowingDays * 3) {
      return `Extra days per renewal (${draft.renewalExtensionDays} days) cannot exceed 3× the standard borrowing period (${draft.borrowingDays * 3} days).`
    }
    if (
      draft.facultyMaxRenewals != null &&
      (!Number.isInteger(draft.facultyMaxRenewals) ||
        draft.facultyMaxRenewals < 0 ||
        draft.facultyMaxRenewals > 50)
    ) {
      return 'Faculty max renewals must be between 0 and 50, or left blank for unlimited.'
    }
    if (
      draft.facultyRenewalExtensionDays != null &&
      (!Number.isInteger(draft.facultyRenewalExtensionDays) ||
        draft.facultyRenewalExtensionDays < 1 ||
        draft.facultyRenewalExtensionDays > 120)
    ) {
      return 'Faculty extra days per renewal must be between 1 and 120, or left blank to match students.'
    }
    if (
      !Number.isInteger(draft.longOverdueAfterDays) ||
      draft.longOverdueAfterDays < draft.borrowingDays ||
      draft.longOverdueAfterDays > 365
    ) {
      return `Long-overdue escalation threshold must be at least ${formatDays(draft.borrowingDays)} and at most 365 days.`
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
      [loan.userName, loan.schoolId, loan.title, loan.accessionNumber ?? '', loan.barcode].some((val) =>
        val.toLowerCase().includes(q),
      ),
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
      const requestKey =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
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

  const isFacultyTab = policyRoleTab === 'Faculty'
  const reasonLen = draft.changeReason.trim().length
  const overdueLoansCount = loans.filter((l) => l.status === 'Overdue').length

  return (
    <div className="space-y-6 text-[var(--sl-text)]">
      {/* Top Role-Aware KPI Summary Strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={isFacultyTab ? 'Faculty waitlist cap' : 'Student waitlist cap'}
          value={
            isFacultyTab
              ? activePolicy?.facultyMaxActiveReservations == null
                ? 'Unlimited'
                : formatRequests(activePolicy.facultyMaxActiveReservations)
              : formatRequests(activePolicy?.studentMaxActiveReservations ?? 2)
          }
          note={
            isFacultyTab
              ? 'Active faculty reservations / waitlist limit'
              : 'Max active reservations / waitlist spots per student'
          }
          icon={Users}
          tone={isFacultyTab ? 'violet' : 'blue'}
        />
        <StatCard
          label="Book renewal allowance"
          value={
            isFacultyTab
              ? formatRenewalAllowance(
                  activePolicy?.facultyMaxRenewals ?? null,
                  activePolicy?.facultyRenewalExtensionDays ?? activePolicy?.renewalExtensionDays ?? 1,
                )
              : formatRenewalAllowance(activePolicy?.maxRenewals ?? 1, activePolicy?.renewalExtensionDays ?? 1)
          }
          note={
            isFacultyTab
              ? 'Renewals & extra days per faculty borrowed book'
              : 'Renewals & extra days per borrowed book'
          }
          icon={CalendarClock}
          tone="green"
        />
        <div
          onClick={() => document.getElementById('student-renewal-desk')?.scrollIntoView?.({ behavior: 'smooth' })}
          className="cursor-pointer rounded-[10px] transition-transform hover:-translate-y-0.5"
        >
          <StatCard
            label="Active borrowed books"
            value={String(loans.length)}
            note={
              overdueLoansCount > 0
                ? `${overdueLoansCount} overdue · Click to jump to renewal desk ↓`
                : 'Loans eligible for counter renewal review ↓'
            }
            icon={BookOpenCheck}
            tone={overdueLoansCount > 0 ? 'amber' : 'info'}
          />
        </div>
      </div>

      {/* Section 1: Reservation Pickup Window & Waiting-List Expiry Maintenance */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0f766e] dark:text-[#5eead4]">
              Step 1 · Hold &amp; queue timers
            </p>
            <h2 className="mt-0.5 font-display text-lg font-bold text-[var(--sl-text-header)]">
              Reservation expiry maintenance
            </h2>
            <p className="text-sm text-[var(--sl-text-secondary)]">
              Control how many days a ready book is held for pickup and when unclaimed waiting-list requests automatically expire.
            </p>
          </div>
        </div>
        <ReservationSettingsPanel roleTab={policyRoleTab} onRoleTabChange={setPolicyRoleTab} />
      </div>

      {/* Section 2: Waitlist Capacity & Student Renewal Rules Maintenance */}
      <SectionCard
        className={`border-t-[3px] p-5 ${
          isFacultyTab ? 'border-t-[#4f46e5]' : 'border-t-[#0b5ea2]'
        }`}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sl-border)] pb-3.5">
          <div>
            <p
              className={`text-[11px] font-bold uppercase tracking-[0.12em] ${
                isFacultyTab
                  ? 'text-[#4f46e5] dark:text-[#c7d2fe]'
                  : 'text-[#0b5ea2] dark:text-[#93c5fd]'
              }`}
            >
              Step 2 · Capacity &amp; renewal limits
            </p>
            <h2 className="mt-0.5 font-display text-lg font-bold text-[var(--sl-text-header)]">
              Waitlist limit &amp; book renewal policy maintenance
            </h2>
            <p className="text-xs text-[var(--sl-text-secondary)]">
              Adjust maximum waitlist reservations per borrower, maximum renewals for borrowed books, extension days, and automatic renewal blockers.
            </p>
          </div>
          <RefreshButton
            label="Refresh policy"
            onRefresh={() => loadPolicyAndLoans()}
            variant="secondary"
            disabled={policyBusy}
          />
        </div>

        {policyError ? (
          <NoticeBanner tone="error" className="mb-4">
            {policyError}
          </NoticeBanner>
        ) : null}
        {policyNotice ? (
          <NoticeBanner tone="success" className="mb-4">
            {policyNotice}
          </NoticeBanner>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="Waitlist and renewal policy role"
            className="inline-flex gap-1 rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-1 shadow-[var(--sl-shadow-xs)]"
          >
            {(['Student', 'Faculty'] as const).map((role) => {
              const active = policyRoleTab === role
              return (
                <button
                  key={role}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPolicyRoleTab(role)}
                  className={`inline-flex items-center gap-1.5 rounded-[8px] px-3.5 py-2 text-sm font-semibold transition ${
                    active
                      ? role === 'Faculty'
                        ? 'bg-[#4f46e5] text-white shadow-xs'
                        : 'bg-[#0b5ea2] text-white shadow-xs'
                      : 'text-[var(--sl-text-secondary)] hover:bg-[var(--sl-bg-subtle)]'
                  }`}
                >
                  <Users size={14} />
                  {role}
                </button>
              )
            })}
          </div>
          <span className="text-xs text-[var(--sl-text-muted)]">
            Editing <strong>{policyRoleTab}</strong> limits · Both Student and Faculty rules publish together.
          </span>
        </div>

        <form onSubmit={saveWaitlistAndRenewalRules} className="space-y-5">
          {/* Group A: Role-Specific Waitlist & Renewal Limits */}
          <div
            className={`rounded-[10px] border p-4 ${
              isFacultyTab
                ? 'border-[#4f46e5]/25 bg-[#eef2ff]/45 dark:border-[#4f46e5]/30 dark:bg-[#1d2038]/40'
                : 'border-[#0b5ea2]/20 bg-[#f0f7ff]/50 dark:border-[#0b5ea2]/30 dark:bg-[#16253b]/40'
            }`}
          >
            <p
              className={`mb-3 text-xs font-bold uppercase tracking-wider ${
                isFacultyTab ? 'text-[#4f46e5] dark:text-[#c7d2fe]' : 'text-[#0b5ea2] dark:text-[#93c5fd]'
              }`}
            >
              {policyRoleTab} borrowing &amp; waitlist limits
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {policyRoleTab === 'Student' ? (
                <>
                  <label className="text-xs font-bold uppercase tracking-wide text-[var(--sl-text-header)]">
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
                    <span className="mt-1 block text-[11px] font-normal normal-case text-[var(--sl-text-secondary)]">
                      Maximum queued + ready reservations a student can hold at once.
                    </span>
                  </label>

                  <label className="text-xs font-bold uppercase tracking-wide text-[var(--sl-text-header)]">
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
                    <span className="mt-1 block text-[11px] font-normal normal-case text-[var(--sl-text-secondary)]">
                      Set to 0 to disable student renewals, or 1–10 renewals per checkout.
                    </span>
                  </label>

                  <label className="text-xs font-bold uppercase tracking-wide text-[var(--sl-text-header)]">
                    Extra days per renewal (1–60)
                    <input
                      required
                      type="number"
                      min={1}
                      max={60}
                      value={draft.renewalExtensionDays}
                      onChange={(event) => updateDraft({ renewalExtensionDays: Number(event.target.value) })}
                      className={`${fieldClass} mt-1.5`}
                    />
                    <span className="mt-1 block text-[11px] font-normal normal-case text-[var(--sl-text-secondary)]">
                      How many extra operating days are added to the due date each time a book is renewed.
                    </span>
                  </label>
                </>
              ) : (
                <>
                  <label className="text-xs font-bold uppercase tracking-wide text-[var(--sl-text-header)]">
                    Faculty waitlist &amp; reservation limit
                    <input
                      type="number"
                      min={1}
                      max={100}
                      placeholder="Unlimited"
                      value={draft.facultyMaxActiveReservations ?? ''}
                      onChange={(event) =>
                        updateDraft({
                          facultyMaxActiveReservations:
                            event.target.value === '' ? null : Number(event.target.value),
                        })
                      }
                      className={`${fieldClass} mt-1.5`}
                    />
                    <span className="mt-1 block text-[11px] font-normal normal-case text-[var(--sl-text-secondary)]">
                      Leave blank for unlimited faculty waitlist requests (or set 1–100).
                    </span>
                  </label>

                  <label className="text-xs font-bold uppercase tracking-wide text-[var(--sl-text-header)]">
                    Faculty max renewals (0–50)
                    <input
                      type="number"
                      min={0}
                      max={50}
                      placeholder="Unlimited"
                      value={draft.facultyMaxRenewals ?? ''}
                      onChange={(event) =>
                        updateDraft({
                          facultyMaxRenewals: event.target.value === '' ? null : Number(event.target.value),
                        })
                      }
                      className={`${fieldClass} mt-1.5`}
                    />
                    <span className="mt-1 block text-[11px] font-normal normal-case text-[var(--sl-text-secondary)]">
                      Leave blank for unlimited faculty renewals, or set 0–50 per checkout.
                    </span>
                  </label>

                  <label className="text-xs font-bold uppercase tracking-wide text-[var(--sl-text-header)]">
                    Faculty extra days per renewal (1–120)
                    <input
                      type="number"
                      min={1}
                      max={120}
                      placeholder={`Same as students (${draft.renewalExtensionDays})`}
                      value={draft.facultyRenewalExtensionDays ?? ''}
                      onChange={(event) =>
                        updateDraft({
                          facultyRenewalExtensionDays:
                            event.target.value === '' ? null : Number(event.target.value),
                        })
                      }
                      className={`${fieldClass} mt-1.5`}
                    />
                    <span className="mt-1 block text-[11px] font-normal normal-case text-[var(--sl-text-secondary)]">
                      Leave blank to match student extra days, or set 1–120 extra operating days per renewal.
                    </span>
                  </label>
                </>
              )}
            </div>
          </div>

          {/* Group B: Global Escalation & Effective Schedule */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold uppercase tracking-wide text-[var(--sl-text-header)]">
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
              <span className="mt-1 block text-[11px] font-normal normal-case text-[var(--sl-text-secondary)]">
                Days past due before a loan escalates to a long-overdue case.
              </span>
            </label>

            <label className="text-xs font-bold uppercase tracking-wide text-[var(--sl-text-header)]">
              Effective start date
              <input
                required
                type="date"
                min={todayCampusDate()}
                value={draft.effectiveOn}
                onChange={(event) => updateDraft({ effectiveOn: event.target.value })}
                className={`${fieldClass} mt-1.5`}
              />
              <span className="mt-1 block text-[11px] font-normal normal-case text-[var(--sl-text-secondary)]">
                Campus date when these waitlist &amp; renewal limits take effect.
              </span>
            </label>
          </div>

          {/* Group C: Safety Validations & Blockers */}
          <fieldset className="rounded-[10px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/40 p-4">
            <legend className="px-1.5 text-xs font-bold uppercase tracking-wide text-[#0f766e] dark:text-[#5eead4]">
              Renewal safety validations &amp; blockers
            </legend>
            <div className="mt-1 grid gap-3 sm:grid-cols-3">
              {[
                {
                  checked: draft.blockRenewalIfOverdue,
                  onChange: (checked: boolean) => updateDraft({ blockRenewalIfOverdue: checked }),
                  label: 'Block renewal if book is already overdue',
                },
                {
                  checked: draft.blockRenewalIfUnpaidFines,
                  onChange: (checked: boolean) => updateDraft({ blockRenewalIfUnpaidFines: checked }),
                  label: 'Block renewal if student has unpaid fines',
                },
                {
                  checked: draft.blockRenewalIfReserved,
                  onChange: (checked: boolean) => updateDraft({ blockRenewalIfReserved: checked }),
                  label: 'Block renewal if another student is on the waitlist',
                },
              ].map((item) => (
                <label
                  key={item.label}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-[8px] border p-3 text-xs font-semibold transition-colors ${
                    item.checked
                      ? 'border-[#16a34a]/35 bg-[#dcfce7]/45 text-[#166534] dark:border-[#16a34a]/40 dark:bg-[#166534]/20 dark:text-[#86efac]'
                      : 'border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text-header)]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(event) => item.onChange(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--sl-border-strong)] accent-[#0b5ea2]"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Change Reason with Live 10-Char Readiness Pill */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-[var(--sl-text-header)]">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span>Reason for waitlist / renewal policy change (min 10 characters)</span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold normal-case tabular-nums ${
                    reasonLen === 0
                      ? 'bg-[var(--sl-bg-subtle)] text-[var(--sl-text-muted)]'
                      : reasonLen >= 10
                        ? 'bg-[#dcfce7] text-[#166534] dark:bg-[#166534]/30 dark:text-[#86efac]'
                        : 'bg-[#fef9c3] text-[#92400e] dark:bg-[#854d0e]/30 dark:text-[#fde047]'
                  }`}
                >
                  {reasonLen >= 10 ? `Ready to review (${reasonLen} chars)` : `${reasonLen} / 10 chars minimum`}
                </span>
              </span>
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
          </div>

          {validationIssue ? (
            <div className="flex items-center gap-2 rounded-[10px] border border-[#eab308]/45 bg-[#fef9c3]/80 p-3 text-xs font-semibold text-[#92400e] dark:border-[#eab308]/40 dark:bg-[#854d0e]/30 dark:text-[#fde047]">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{validationIssue}</span>
            </div>
          ) : null}

          {confirmingPolicy ? (
            <div className="rounded-[10px] border border-[#16a34a]/35 bg-[#dcfce7]/55 p-3.5 text-xs text-[#166534] dark:border-[#16a34a]/40 dark:bg-[#166534]/20 dark:text-[#86efac]">
              <p className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 size={15} /> Confirm waitlist &amp; renewal settings before saving
              </p>
              <p className="mt-1 opacity-90">
                Student waitlist cap: <strong>{draft.studentMaxActiveReservations}</strong> · Faculty waitlist cap:{' '}
                <strong>{draft.facultyMaxActiveReservations ?? 'Unlimited'}</strong> · Renewals:{' '}
                <strong>{formatRenewalAllowance(draft.maxRenewals, draft.renewalExtensionDays)}</strong> · Effective:{' '}
                <strong>{draft.effectiveOn}</strong>
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--sl-border)] pt-3.5">
            {confirmingPolicy ? (
              <Button
                variant="secondary"
                type="button"
                disabled={policyBusy}
                onClick={() => setConfirmingPolicy(false)}
              >
                Keep editing
              </Button>
            ) : null}
            <Button type="submit" disabled={policyBusy || Boolean(validationIssue)}>
              {confirmingPolicy
                ? 'Confirm & publish waitlist/renewal rules'
                : 'Review & save waitlist/renewal rules'}
            </Button>
          </div>
        </form>
      </SectionCard>

      {/* Section 3: Student Borrowed-Book Renewal Desk */}
      <SectionCard id="student-renewal-desk" className="overflow-hidden border-t-[3px] border-t-[#0f766e]">
        <div className="flex flex-col gap-3 border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0f766e] dark:text-[#5eead4]">
              Counter assistance
            </p>
            <h2 className="mt-0.5 font-display text-lg font-bold text-[var(--sl-text-header)]">
              Student borrowed-book renewal desk
            </h2>
            <p className="text-xs text-[var(--sl-text-secondary)]">
              Search active borrowed books and renew loans on behalf of students after checking renewal eligibility and waitlist blockers.
            </p>
          </div>
          <label className="relative block w-full sm:w-96">
            <Search
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--sl-text-muted)]"
            />
            <input
              aria-label="Search borrowed books to renew"
              placeholder="Search student, ID, book title, or accession #..."
              value={loanSearch}
              onChange={(event) => setLoanSearch(event.target.value)}
              className="sl-input !pl-10 pr-3"
            />
          </label>
        </div>

        <div className="space-y-4 p-5">
          {loansError ? <NoticeBanner tone="error">{loansError}</NoticeBanner> : null}
          {renewError ? <NoticeBanner tone="error">{renewError}</NoticeBanner> : null}
          {renewNotice ? <NoticeBanner tone="success">{renewNotice}</NoticeBanner> : null}

          <ResponsiveTable>
            <table aria-label="Borrowed books for renewal" className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]/75 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--sl-text-muted)]">
                <tr>
                  <th className="px-4 py-3">Student / Borrower</th>
                  <th className="px-4 py-3">Borrowed Book &amp; Accession #</th>
                  <th className="px-4 py-3">Current Due Date</th>
                  <th className="px-4 py-3">Renewals Used</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Renewal Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sl-border)]">
                {loansBusy ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[var(--sl-text-muted)]">
                      Loading active borrowed books…
                    </td>
                  </tr>
                ) : filteredLoans.length ? (
                  filteredLoans.map((loan) => {
                    const isSelected = selectedLoanId === loan.transactionId
                    const isOverdueBlocked =
                      loan.status === 'Overdue' && (activePolicy?.blockRenewalIfOverdue ?? true)
                    const noRenewalsLeft = loan.remainingRenewals <= 0
                    return (
                      <tr
                        key={loan.transactionId}
                        className={`align-top transition-colors ${
                          isSelected
                            ? 'bg-[#f0f7ff]/70 dark:bg-[#0b5ea2]/15'
                            : 'hover:bg-[var(--sl-bg-subtle)]/50'
                        }`}
                      >
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-[var(--sl-text-header)]">{loan.userName}</p>
                          <p className="text-xs text-[var(--sl-text-secondary)]">
                            {loan.schoolId} · {loan.role}
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-[#0b5ea2] dark:text-[#93c5fd]">{loan.title}</p>
                          <p className="font-mono text-xs text-[var(--sl-text-muted)]">
                            {loan.accessionNumber ?? loan.barcode}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 text-xs font-medium text-[var(--sl-text-header)]">
                          {formatDateTime(loan.dueDate)}
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          <span className="font-bold tabular-nums text-[var(--sl-text-header)]">
                            {loan.renewalCount} / {loan.maxRenewals}
                          </span>
                          <p className="text-[11px] text-[var(--sl-text-muted)]">
                            {loan.remainingRenewals} remaining
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge status={loan.status} />
                            {isOverdueBlocked ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#fee2e2] px-2 py-0.5 text-[10px] font-semibold text-[#b42318] dark:bg-[#991b1b]/35 dark:text-[#fca5a5]">
                                Blocked by overdue rule
                              </span>
                            ) : noRenewalsLeft ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#fef9c3] px-2 py-0.5 text-[10px] font-semibold text-[#92400e] dark:bg-[#854d0e]/35 dark:text-[#fde047]">
                                Renewal limit reached
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2 py-0.5 text-[10px] font-semibold text-[#166534] dark:bg-[#166534]/30 dark:text-[#86efac]">
                                Eligible for check
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <Button
                            variant={isSelected ? 'primary' : 'secondary'}
                            size="sm"
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
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--sl-text-muted)]">
                      No active borrowed books match your filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </ResponsiveTable>

          {selectedLoanId !== null && preflight ? (
            <div className="rounded-[12px] border border-[#0b5ea2]/30 bg-[#f0f7ff]/65 p-4 dark:border-sky-500/30 dark:bg-sky-950/30">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-base font-bold text-[#0b5ea2] dark:text-sky-300">
                  Renewal eligibility check — Loan #{preflight.transactionId}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedLoanId(null)
                    setPreflight(null)
                  }}
                >
                  Close
                </Button>
              </div>
              <div className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
                <div className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-3">
                  <span className="font-semibold text-[var(--sl-text-muted)]">Current due date:</span>
                  <p className="mt-0.5 font-bold text-[var(--sl-text-header)]">
                    {formatDateTime(preflight.currentDueAt)}
                  </p>
                </div>
                <div className="rounded-[8px] border border-[#16a34a]/30 bg-[#dcfce7]/55 p-3 dark:bg-[#166534]/20">
                  <span className="font-semibold text-[#166534] dark:text-[#86efac]">Proposed new due date:</span>
                  <p className="mt-0.5 font-bold text-[#166534] dark:text-[#86efac]">
                    {formatDateTime(preflight.proposedDueAt)}
                  </p>
                </div>
                <div className="rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-elevated)] p-3">
                  <span className="font-semibold text-[var(--sl-text-muted)]">Renewals remaining:</span>
                  <p className="mt-0.5 font-bold text-[var(--sl-text-header)]">
                    {preflight.remainingRenewals ?? '—'}
                  </p>
                </div>
              </div>

              {preflight.blockers.length > 0 ? (
                <div className="mt-3 rounded-[10px] border border-[#dc2626]/35 bg-[#fee2e2]/75 p-3.5 text-xs text-[#b42318] dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                  <p className="font-bold">Renewal blocked by library policy:</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    {preflight.blockers.map((b) => (
                      <li key={b.code}>{b.message}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <label className="block text-xs font-bold uppercase tracking-wide text-[var(--sl-text-header)]">
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
