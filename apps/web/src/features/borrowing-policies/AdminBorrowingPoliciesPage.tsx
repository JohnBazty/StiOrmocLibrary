import { AlertTriangle, CalendarClock, Plus, RefreshCw, ScrollText, Shield } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { Button, NoticeBanner, PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { borrowingPoliciesApi } from './borrowing-policies-api'
import type { BorrowingPolicyList, BorrowingPolicyVersion, PublishBorrowingPolicyInput } from './types'

const field = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#0b5ea2] focus:ring-4 focus:ring-[#0b5ea2]/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

function todayCampusDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function fromVersion(version: BorrowingPolicyVersion | null): PublishBorrowingPolicyInput {
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
    changeReason: '',
    materialRules: version?.materialRules ?? [
      { materialType: 'Book', isBorrowable: true },
      { materialType: 'Thesis/Manuscript', isBorrowable: false },
    ],
  }
}

function limitLabel(value: number | null) {
  return value === null ? 'Unlimited' : String(value)
}

function PolicySummary({ policy }: { policy: BorrowingPolicyVersion }) {
  return (
    <div className="grid gap-3 text-sm text-slate-800 sm:grid-cols-2 xl:grid-cols-4 dark:text-slate-100">
      <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700/60 dark:bg-slate-800/40"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Student books</p><p className="mt-1 font-bold text-[#0b5ea2] dark:text-sky-300">{policy.studentMaxActiveBooks}</p></div>
      <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700/60 dark:bg-slate-800/40"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Faculty books</p><p className="mt-1 font-bold text-[#0b5ea2] dark:text-sky-300">{limitLabel(policy.facultyMaxActiveBooks)}</p></div>
      <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700/60 dark:bg-slate-800/40"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Loan period</p><p className="mt-1 font-bold text-[#0b5ea2] dark:text-sky-300">{policy.borrowingDays} operating day(s) @ {policy.dueCutoffLabel}</p></div>
      <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700/60 dark:bg-slate-800/40"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Reservations / Waitlist</p><p className="mt-1 font-bold text-[#0b5ea2] dark:text-sky-300">Student {policy.studentMaxActiveReservations} · Faculty {limitLabel(policy.facultyMaxActiveReservations)}</p></div>
      <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700/60 dark:bg-slate-800/40"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Renewals</p><p className="mt-1 font-bold text-[#0b5ea2] dark:text-sky-300">{policy.maxRenewals} × {policy.renewalExtensionDays} day(s)</p></div>
      <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700/60 dark:bg-slate-800/40"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Long overdue</p><p className="mt-1 font-bold text-[#0b5ea2] dark:text-sky-300">{policy.longOverdueAfterDays ?? 'Disabled'}</p></div>
      <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 sm:col-span-2 dark:border-slate-700/60 dark:bg-slate-800/40"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Materials</p><p className="mt-1 font-bold text-[#0b5ea2] dark:text-sky-300">{policy.materialRules.map((rule) => `${rule.materialType}: ${rule.isBorrowable ? 'borrowable' : 'denied'}`).join(' · ')}</p></div>
    </div>
  )
}

export function AdminBorrowingPoliciesPage() {
  const [data, setData] = useState<BorrowingPolicyList | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [draft, setDraft] = useState<PublishBorrowingPolicyInput>(() => fromVersion(null))
  const [formError, setFormError] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (showForm) dialogRef.current?.querySelector<HTMLElement>('input, textarea, button')?.focus()
  }, [showForm])

  function editDraft(next: PublishBorrowingPolicyInput) {
    setDraft(next)
    setConfirming(false)
  }

  function closeForm() {
    setShowForm(false)
    setConfirming(false)
    setFormError('')
    openerRef.current?.focus()
  }

  function onDialogKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !busy) closeForm()
  }

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const result = await borrowingPoliciesApi.list()
      setData(result)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Borrowing policies are unavailable.')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const changes = useMemo(() => {
    const active = data?.active
    if (!active) return [] as string[]
    const rows: Array<[string, string, string]> = [
      ['Student max books', String(active.studentMaxActiveBooks), String(draft.studentMaxActiveBooks)],
      ['Faculty max books', limitLabel(active.facultyMaxActiveBooks), limitLabel(draft.facultyMaxActiveBooks)],
      ['Borrowing days', String(active.borrowingDays), String(draft.borrowingDays)],
      ['Due cutoff', active.dueTimeCutoff.slice(0, 5), draft.dueTimeCutoff.slice(0, 5)],
      ['Max renewals', String(active.maxRenewals), String(draft.maxRenewals)],
      ['Renewal extension', String(active.renewalExtensionDays), String(draft.renewalExtensionDays)],
      ['Student reservations', String(active.studentMaxActiveReservations), String(draft.studentMaxActiveReservations)],
      ['Faculty reservations', limitLabel(active.facultyMaxActiveReservations), limitLabel(draft.facultyMaxActiveReservations)],
      ['Block if overdue', String(active.blockRenewalIfOverdue), String(draft.blockRenewalIfOverdue)],
      ['Block if unpaid fines', String(active.blockRenewalIfUnpaidFines), String(draft.blockRenewalIfUnpaidFines)],
      ['Block if reserved', String(active.blockRenewalIfReserved), String(draft.blockRenewalIfReserved)],
      ['Long overdue days', String(active.longOverdueAfterDays ?? 'Disabled'), String(draft.longOverdueAfterDays)],
      ['Effective on', active.effectiveOn, draft.effectiveOn],
    ]
    for (const rule of draft.materialRules) {
      const previous = active.materialRules.find((item) => item.materialType === rule.materialType)
      rows.push([rule.materialType, String(previous?.isBorrowable ?? false), String(rule.isBorrowable)])
    }
    return rows.filter(([, before, after]) => before !== after).map(([label, before, after]) => `${label}: ${before} → ${after}`)
  }, [data?.active, draft])

  function openCreate() {
    setDraft(fromVersion(data?.active ?? null))
    setConfirming(false)
    setFormError('')
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setShowForm(true)
    setNotice('')
  }

  async function publish(event: FormEvent) {
    event.preventDefault()
    if (!confirming) {
      setConfirming(true)
      return
    }
    setBusy(true)
    setFormError('')
    try {
      const cutoff = draft.dueTimeCutoff.length === 5 ? `${draft.dueTimeCutoff}:00` : draft.dueTimeCutoff
      const created = await borrowingPoliciesApi.publish({ ...draft, dueTimeCutoff: cutoff })
      setNotice(`${created.displayName} published and is ${created.status}.`)
      closeForm()
      await load()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'The policy could not be published.')
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Circulation settings"
        title="Borrowing policies"
        description="Manage loan quotas, due-time cutoffs, renewal rules, and waitlist caps across students and faculty."
        action={(
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => void load()}><RefreshCw size={16} />Refresh</Button>
            <Button disabled={busy || !data} onClick={openCreate}><Plus size={16} />Create new version</Button>
          </div>
        )}
      />
      {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
      {notice ? <NoticeBanner tone="success">{notice}</NoticeBanner> : null}

      {!data && busy ? <p role="status" className="py-6 text-sm text-slate-600 dark:text-slate-300">Loading borrowing policies…</p> : null}
      {data ? <>
      <SectionCard className="p-5">
        <div className="mb-4 flex items-center gap-2"><Shield size={18} className="text-[#0b5ea2] dark:text-sky-300" /><h2 className="font-bold text-slate-900 dark:text-slate-100">Active policy</h2>{data?.active ? <StatusBadge status={data.active.status} /> : null}</div>
        {data?.active ? (
          <>
            <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{data.active.displayName} · Effective {data.active.effectiveOn} · {data.active.changeReason}</p>
            <PolicySummary policy={data.active} />
          </>
        ) : <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No active policy is configured.</p>}
      </SectionCard>

      <SectionCard className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-200/80 bg-slate-50/70 p-5 dark:border-slate-700/60 dark:bg-slate-800/40"><CalendarClock size={18} className="text-[#0b5ea2] dark:text-sky-300" /><h2 className="font-bold text-slate-900 dark:text-slate-100">Scheduled versions</h2></div>
        <div className="divide-y divide-slate-200/70 dark:divide-slate-700/50">
          {data?.scheduled.length ? data.scheduled.map((policy) => (
            <div key={policy.versionId} className="p-5">
              <div className="mb-2 flex flex-wrap items-center gap-2"><strong className="text-slate-900 dark:text-slate-100">{policy.displayName}</strong><StatusBadge status={policy.status} /><span className="text-xs text-slate-500 dark:text-slate-400">Effective {policy.effectiveOn}</span></div>
              <PolicySummary policy={policy} />
            </div>
          )) : <p className="p-5 text-sm font-semibold text-slate-500 dark:text-slate-400">No scheduled versions.</p>}
        </div>
      </SectionCard>

      <SectionCard className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-200/80 bg-slate-50/70 p-5 dark:border-slate-700/60 dark:bg-slate-800/40"><ScrollText size={18} className="text-[#0b5ea2] dark:text-sky-300" /><h2 className="font-bold text-slate-900 dark:text-slate-100">Version history</h2></div>
        <ResponsiveTable>
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-100/80 text-xs font-bold uppercase tracking-wider text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><tr>{['Version', 'Status', 'Effective', 'Student limit', 'Loan days', 'Cutoff', 'Reason', 'Created'].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/50">
              {data?.history.length ? data.history.map((policy) => (
                <tr key={policy.versionId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3.5 font-bold text-[#0b5ea2] dark:text-sky-300">{policy.displayName}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={policy.status} /></td>
                  <td className="px-4 py-3.5">{policy.effectiveOn}</td>
                  <td className="px-4 py-3.5 tabular-nums">{policy.studentMaxActiveBooks}</td>
                  <td className="px-4 py-3.5 tabular-nums">{policy.borrowingDays}</td>
                  <td className="px-4 py-3.5">{policy.dueCutoffLabel}</td>
                  <td className="max-w-xs px-4 py-3.5 text-slate-600 dark:text-slate-300">{policy.changeReason}</td>
                  <td className="px-4 py-3.5 text-xs text-slate-500">{new Date(policy.createdAt).toLocaleString()}</td>
                </tr>
              )) : <tr><td colSpan={8} className="p-12 text-center font-semibold text-slate-500">No policy versions yet.</td></tr>}
            </tbody>
          </table>
        </ResponsiveTable>
      </SectionCard>

      </> : null}
      {showForm ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#132a3f]/75 p-4 backdrop-blur-xs">
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="policy-form-title" onKeyDown={onDialogKeyDown} className="mx-auto my-8 max-w-3xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <header className="border-b border-slate-200 p-5 dark:border-slate-700">
              <h2 id="policy-form-title" className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">Publish new borrowing policy</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Published versions are permanent. Corrections require another version.</p>
            </header>
            <form onSubmit={publish} className="grid gap-4 p-5 sm:grid-cols-2">
              <label className="text-sm font-bold text-slate-800 dark:text-slate-200">Effective on<input required type="date" min={todayCampusDate()} value={draft.effectiveOn} onChange={(event) => editDraft({ ...draft, effectiveOn: event.target.value })} className={`${field} mt-1`} /></label>
              <label className="text-sm font-bold text-slate-800 dark:text-slate-200">Due cutoff<input required type="time" value={draft.dueTimeCutoff.slice(0, 5)} onChange={(event) => editDraft({ ...draft, dueTimeCutoff: event.target.value })} className={`${field} mt-1`} /></label>
              <label className="text-sm font-bold text-slate-800 dark:text-slate-200">Student max books<input required type="number" min={1} max={20} value={draft.studentMaxActiveBooks} onChange={(event) => editDraft({ ...draft, studentMaxActiveBooks: Number(event.target.value) })} className={`${field} mt-1`} /></label>
              <label className="text-sm font-bold text-slate-800 dark:text-slate-200">Faculty max books (blank = unlimited)<input type="number" min={1} max={100} value={draft.facultyMaxActiveBooks ?? ''} onChange={(event) => editDraft({ ...draft, facultyMaxActiveBooks: event.target.value === '' ? null : Number(event.target.value) })} className={`${field} mt-1`} /></label>
              <label className="text-sm font-bold text-slate-800 dark:text-slate-200">Borrowing days<input required type="number" min={1} max={60} value={draft.borrowingDays} onChange={(event) => editDraft({ ...draft, borrowingDays: Number(event.target.value) })} className={`${field} mt-1`} /></label>
              <label className="text-sm font-bold text-slate-800 dark:text-slate-200">Max renewals<input required type="number" min={0} max={10} value={draft.maxRenewals} onChange={(event) => editDraft({ ...draft, maxRenewals: Number(event.target.value) })} className={`${field} mt-1`} /></label>
              <label className="text-sm font-bold text-slate-800 dark:text-slate-200">Renewal extension days<input required type="number" min={1} max={60} value={draft.renewalExtensionDays} onChange={(event) => editDraft({ ...draft, renewalExtensionDays: Number(event.target.value) })} className={`${field} mt-1`} /></label>
              <label className="text-sm font-bold text-slate-800 dark:text-slate-200">Long overdue after days<input required type="number" min={1} max={365} value={draft.longOverdueAfterDays} onChange={(event) => editDraft({ ...draft, longOverdueAfterDays: Number(event.target.value) })} className={`${field} mt-1`} /></label>
              <label className="text-sm font-bold text-slate-800 dark:text-slate-200">Student max reservations<input required type="number" min={1} max={20} value={draft.studentMaxActiveReservations} onChange={(event) => editDraft({ ...draft, studentMaxActiveReservations: Number(event.target.value) })} className={`${field} mt-1`} /></label>
              <label className="text-sm font-bold text-slate-800 dark:text-slate-200">Faculty max reservations (blank = unlimited)<input type="number" min={1} max={100} value={draft.facultyMaxActiveReservations ?? ''} onChange={(event) => editDraft({ ...draft, facultyMaxActiveReservations: event.target.value === '' ? null : Number(event.target.value) })} className={`${field} mt-1`} /></label>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200"><input type="checkbox" checked={draft.blockRenewalIfOverdue} onChange={(event) => editDraft({ ...draft, blockRenewalIfOverdue: event.target.checked })} />Block renewal if overdue</label>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200"><input type="checkbox" checked={draft.blockRenewalIfUnpaidFines} onChange={(event) => editDraft({ ...draft, blockRenewalIfUnpaidFines: event.target.checked })} />Block renewal if unpaid fines</label>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-800 sm:col-span-2 dark:text-slate-200"><input type="checkbox" checked={draft.blockRenewalIfReserved} onChange={(event) => editDraft({ ...draft, blockRenewalIfReserved: event.target.checked })} />Block renewal if another user has an active reservation</label>
              {draft.materialRules.map((rule, index) => (
                <label key={rule.materialType} className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={rule.isBorrowable}
                    disabled={rule.materialType === 'Thesis/Manuscript'}
                    onChange={(event) => {
                      const materialRules = [...draft.materialRules]
                      materialRules[index] = { ...rule, isBorrowable: event.target.checked }
                      editDraft({ ...draft, materialRules })
                    }}
                  />
                  {rule.materialType} borrowable
                </label>
              ))}
              <label className="text-sm font-bold text-slate-800 sm:col-span-2 dark:text-slate-200">Change reason<textarea required minLength={10} maxLength={500} value={draft.changeReason} onChange={(event) => editDraft({ ...draft, changeReason: event.target.value })} className={`${field} mt-1 h-28 py-3`} placeholder="Explain why this policy version is being published" /></label>
              {confirming ? (
                <div className="rounded-xl bg-[#0b5ea2]/10 p-4 text-sm font-semibold text-slate-900 sm:col-span-2 dark:bg-sky-950/40 dark:text-slate-100">
                  <p className="mb-2 text-[#0b5ea2] dark:text-sky-300">Confirm permanent publication. Changed fields:</p>
                  <ul className="list-disc space-y-1 pl-5">{changes.length ? changes.map((item) => <li key={item}>{item}</li>) : <li>No field differences from the active policy (same values, new version).</li>}</ul>
                </div>
              ) : null}
              {formError ? <div role="alert" className="flex gap-2 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-900 sm:col-span-2"><AlertTriangle size={18} />{formError}</div> : null}
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button type="button" variant="secondary" onClick={closeForm}>Cancel</Button>
                <Button type="submit" disabled={busy}>{confirming ? 'Confirm publish' : 'Review and continue'}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
