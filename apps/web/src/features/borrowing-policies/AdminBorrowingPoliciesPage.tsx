import { AlertTriangle, CalendarClock, Plus, RefreshCw, ScrollText, Shield } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button, PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { borrowingPoliciesApi } from './borrowing-policies-api'
import type { BorrowingPolicyList, BorrowingPolicyVersion, PublishBorrowingPolicyInput } from './types'

const field = 'h-11 w-full rounded-xl border border-[#003399]/20 bg-white px-3 text-sm text-[#003399] outline-none focus:ring-4 focus:ring-[#003399]/10'

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
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 text-sm text-[#003399]">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-[#003399]/55">Student books</p><p className="font-bold">{policy.studentMaxActiveBooks}</p></div>
      <div><p className="text-xs font-semibold uppercase tracking-wide text-[#003399]/55">Faculty books</p><p className="font-bold">{limitLabel(policy.facultyMaxActiveBooks)}</p></div>
      <div><p className="text-xs font-semibold uppercase tracking-wide text-[#003399]/55">Loan period</p><p className="font-bold">{policy.borrowingDays} operating day(s) @ {policy.dueCutoffLabel}</p></div>
      <div><p className="text-xs font-semibold uppercase tracking-wide text-[#003399]/55">Reservations</p><p className="font-bold">Student {policy.studentMaxActiveReservations} · Faculty {limitLabel(policy.facultyMaxActiveReservations)}</p></div>
      <div><p className="text-xs font-semibold uppercase tracking-wide text-[#003399]/55">Renewals</p><p className="font-bold">{policy.maxRenewals} × {policy.renewalExtensionDays} day(s)</p></div>
      <div><p className="text-xs font-semibold uppercase tracking-wide text-[#003399]/55">Long overdue</p><p className="font-bold">{policy.longOverdueAfterDays ?? 'Disabled'}</p></div>
      <div className="sm:col-span-2"><p className="text-xs font-semibold uppercase tracking-wide text-[#003399]/55">Materials</p><p className="font-bold">{policy.materialRules.map((rule) => `${rule.materialType}: ${rule.isBorrowable ? 'borrowable' : 'denied'}`).join(' · ')}</p></div>
    </div>
  )
}

export function AdminBorrowingPoliciesPage() {
  const [data, setData] = useState<BorrowingPolicyList | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [draft, setDraft] = useState<PublishBorrowingPolicyInput>(() => fromVersion(null))

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
      ['Long overdue days', String(active.longOverdueAfterDays ?? 'null'), String(draft.longOverdueAfterDays)],
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
    setError('')
    try {
      const cutoff = draft.dueTimeCutoff.length === 5 ? `${draft.dueTimeCutoff}:00` : draft.dueTimeCutoff
      const created = await borrowingPoliciesApi.publish({ ...draft, dueTimeCutoff: cutoff })
      setNotice(`${created.displayName} published and is ${created.status}.`)
      setShowForm(false)
      setConfirming(false)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The policy could not be published.')
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Circulation settings"
        title="Borrowing policies"
        action={(
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => void load()}><RefreshCw size={16} />Refresh</Button>
            <Button disabled={busy} onClick={openCreate}><Plus size={16} />Create new version</Button>
          </div>
        )}
      />
      {error ? <div role="alert" className="mb-4 flex gap-2 rounded-xl bg-[#FFF200] p-4 font-bold text-[#003399]"><AlertTriangle size={18} />{error}</div> : null}
      {notice ? <div className="mb-4 rounded-xl border border-[#003399]/15 bg-[#003399]/5 p-4 font-semibold text-[#003399]">{notice}</div> : null}

      <SectionCard className="mb-5 p-5">
        <div className="mb-4 flex items-center gap-2"><Shield size={18} className="text-[#003399]" /><h2 className="font-bold text-[#003399]">Active policy</h2>{data?.active ? <StatusBadge status={data.active.status} /> : null}</div>
        {data?.active ? (
          <>
            <p className="mb-3 text-sm text-[#003399]/70">{data.active.displayName} · Effective {data.active.effectiveOn} · {data.active.changeReason}</p>
            <PolicySummary policy={data.active} />
          </>
        ) : <p className="text-sm font-semibold text-[#003399]">No active policy is configured.</p>}
      </SectionCard>

      <SectionCard className="mb-5 overflow-hidden">
        <div className="border-b border-[#003399]/15 p-5 flex items-center gap-2"><CalendarClock size={18} className="text-[#003399]" /><h2 className="font-bold text-[#003399]">Scheduled versions</h2></div>
        <div className="divide-y divide-[#003399]/10">
          {data?.scheduled.length ? data.scheduled.map((policy) => (
            <div key={policy.versionId} className="p-5">
              <div className="mb-2 flex flex-wrap items-center gap-2"><strong className="text-[#003399]">{policy.displayName}</strong><StatusBadge status={policy.status} /><span className="text-xs text-[#003399]/60">Effective {policy.effectiveOn}</span></div>
              <PolicySummary policy={policy} />
            </div>
          )) : <p className="p-5 text-sm font-semibold text-[#003399]/70">No scheduled versions.</p>}
        </div>
      </SectionCard>

      <SectionCard className="overflow-hidden">
        <div className="border-b border-[#003399]/15 p-5 flex items-center gap-2"><ScrollText size={18} className="text-[#003399]" /><h2 className="font-bold text-[#003399]">Version history</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-[#003399] text-white"><tr>{['Version', 'Status', 'Effective', 'Student limit', 'Loan days', 'Cutoff', 'Reason', 'Created'].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
            <tbody>
              {data?.history.length ? data.history.map((policy) => (
                <tr key={policy.versionId} className="border-b border-[#003399]/10">
                  <td className="px-4 py-4 font-bold text-[#003399]">{policy.displayName}</td>
                  <td className="px-4 py-4"><StatusBadge status={policy.status} /></td>
                  <td className="px-4 py-4">{policy.effectiveOn}</td>
                  <td className="px-4 py-4">{policy.studentMaxActiveBooks}</td>
                  <td className="px-4 py-4">{policy.borrowingDays}</td>
                  <td className="px-4 py-4">{policy.dueCutoffLabel}</td>
                  <td className="max-w-xs px-4 py-4 text-[#003399]/75">{policy.changeReason}</td>
                  <td className="px-4 py-4 text-xs">{new Date(policy.createdAt).toLocaleString()}</td>
                </tr>
              )) : <tr><td colSpan={8} className="p-12 text-center font-semibold">No policy versions yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {showForm ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#003399]/75 p-4">
          <div className="mx-auto my-8 max-w-3xl rounded-2xl bg-white shadow-2xl">
            <header className="border-b border-[#003399]/15 p-5">
              <h2 className="font-display text-xl font-bold text-[#003399]">Publish new borrowing policy</h2>
              <p className="mt-1 text-sm text-[#003399]/70">Published versions are permanent. Corrections require another version.</p>
            </header>
            <form onSubmit={publish} className="grid gap-4 p-5 sm:grid-cols-2">
              <label className="text-sm font-bold text-[#003399]">Effective on<input required type="date" min={todayCampusDate()} value={draft.effectiveOn} onChange={(event) => setDraft({ ...draft, effectiveOn: event.target.value })} className={`${field} mt-1`} /></label>
              <label className="text-sm font-bold text-[#003399]">Due cutoff<input required type="time" value={draft.dueTimeCutoff.slice(0, 5)} onChange={(event) => setDraft({ ...draft, dueTimeCutoff: event.target.value })} className={`${field} mt-1`} /></label>
              <label className="text-sm font-bold text-[#003399]">Student max books<input required type="number" min={1} max={20} value={draft.studentMaxActiveBooks} onChange={(event) => setDraft({ ...draft, studentMaxActiveBooks: Number(event.target.value) })} className={`${field} mt-1`} /></label>
              <label className="text-sm font-bold text-[#003399]">Faculty max books (blank = unlimited)<input type="number" min={1} max={100} value={draft.facultyMaxActiveBooks ?? ''} onChange={(event) => setDraft({ ...draft, facultyMaxActiveBooks: event.target.value === '' ? null : Number(event.target.value) })} className={`${field} mt-1`} /></label>
              <label className="text-sm font-bold text-[#003399]">Borrowing days<input required type="number" min={1} max={60} value={draft.borrowingDays} onChange={(event) => setDraft({ ...draft, borrowingDays: Number(event.target.value) })} className={`${field} mt-1`} /></label>
              <label className="text-sm font-bold text-[#003399]">Max renewals<input required type="number" min={0} max={10} value={draft.maxRenewals} onChange={(event) => setDraft({ ...draft, maxRenewals: Number(event.target.value) })} className={`${field} mt-1`} /></label>
              <label className="text-sm font-bold text-[#003399]">Renewal extension days<input required type="number" min={1} max={60} value={draft.renewalExtensionDays} onChange={(event) => setDraft({ ...draft, renewalExtensionDays: Number(event.target.value) })} className={`${field} mt-1`} /></label>
              <label className="text-sm font-bold text-[#003399]">Long overdue after days<input required type="number" min={1} max={365} value={draft.longOverdueAfterDays} onChange={(event) => setDraft({ ...draft, longOverdueAfterDays: Number(event.target.value) })} className={`${field} mt-1`} /></label>
              <label className="text-sm font-bold text-[#003399]">Student max reservations<input required type="number" min={1} max={20} value={draft.studentMaxActiveReservations} onChange={(event) => setDraft({ ...draft, studentMaxActiveReservations: Number(event.target.value) })} className={`${field} mt-1`} /></label>
              <label className="text-sm font-bold text-[#003399]">Faculty max reservations (blank = unlimited)<input type="number" min={1} max={100} value={draft.facultyMaxActiveReservations ?? ''} onChange={(event) => setDraft({ ...draft, facultyMaxActiveReservations: event.target.value === '' ? null : Number(event.target.value) })} className={`${field} mt-1`} /></label>
              <label className="flex items-center gap-2 text-sm font-bold text-[#003399]"><input type="checkbox" checked={draft.blockRenewalIfOverdue} onChange={(event) => setDraft({ ...draft, blockRenewalIfOverdue: event.target.checked })} />Block renewal if overdue</label>
              <label className="flex items-center gap-2 text-sm font-bold text-[#003399]"><input type="checkbox" checked={draft.blockRenewalIfUnpaidFines} onChange={(event) => setDraft({ ...draft, blockRenewalIfUnpaidFines: event.target.checked })} />Block renewal if unpaid fines</label>
              <label className="flex items-center gap-2 text-sm font-bold text-[#003399] sm:col-span-2"><input type="checkbox" checked={draft.blockRenewalIfReserved} onChange={(event) => setDraft({ ...draft, blockRenewalIfReserved: event.target.checked })} />Block renewal if another user has an active reservation</label>
              {draft.materialRules.map((rule, index) => (
                <label key={rule.materialType} className="flex items-center gap-2 text-sm font-bold text-[#003399]">
                  <input
                    type="checkbox"
                    checked={rule.isBorrowable}
                    disabled={rule.materialType === 'Thesis/Manuscript'}
                    onChange={(event) => {
                      const materialRules = [...draft.materialRules]
                      materialRules[index] = { ...rule, isBorrowable: event.target.checked }
                      setDraft({ ...draft, materialRules })
                    }}
                  />
                  {rule.materialType} borrowable
                </label>
              ))}
              <label className="text-sm font-bold text-[#003399] sm:col-span-2">Change reason<textarea required minLength={10} maxLength={500} value={draft.changeReason} onChange={(event) => setDraft({ ...draft, changeReason: event.target.value })} className={`${field} mt-1 h-28 py-3`} placeholder="Explain why this policy version is being published" /></label>
              {confirming ? (
                <div className="rounded-xl bg-[#FFF200] p-4 text-sm font-semibold text-[#003399] sm:col-span-2">
                  <p className="mb-2">Confirm permanent publication. Changed fields:</p>
                  <ul className="list-disc space-y-1 pl-5">{changes.length ? changes.map((item) => <li key={item}>{item}</li>) : <li>No field differences from the active policy (same values, new version).</li>}</ul>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button type="button" variant="secondary" onClick={() => { setShowForm(false); setConfirming(false) }}>Cancel</Button>
                <Button type="submit" disabled={busy}>{confirming ? 'Confirm publish' : 'Review and continue'}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
