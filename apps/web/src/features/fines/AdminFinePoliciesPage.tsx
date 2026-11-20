import { AlertTriangle, CheckCircle2, CircleDollarSign, Clock, ShieldAlert, SlidersHorizontal } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { Button, NoticeBanner, PageHeader, SectionCard, StatCard, StatusBadge } from '../../components/ui'
import { finePoliciesApi, FinePolicyError, type FinePolicyInput, type FinePolicyList, type FinePolicyVersion } from './fine-policies-api'
import { RefreshButton } from '../../components/RefreshButton'

const field = 'h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#0b5ea2] focus:ring-4 focus:ring-[#0b5ea2]/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
const CAP_CEILING = 500
const peso = (value: number) => `PHP ${value.toFixed(2)}`
const todayCampusDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const campusDateTime = (value: string | null) => value ? new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'

type Draft = { hourlyRate: string; dailyRate: string; maximumPenalty: string; effectiveOn: string; changeReason: string }
const amountFields = [['hourlyRate', 'Hourly rate'], ['dailyRate', 'Daily rate'], ['maximumPenalty', 'Maximum fine']] as const

export function describeRule(policy: Pick<FinePolicyVersion, 'hourlyRate' | 'dailyRate' | 'maximumPenalty'>) {
  return `${peso(policy.hourlyRate)} per hour on the due date, ${peso(policy.dailyRate)} per library day after, at most ${peso(policy.maximumPenalty)}.`
}

function fromVersion(version: FinePolicyVersion | null): Draft {
  return {
    hourlyRate: String(version?.hourlyRate ?? 2),
    dailyRate: String(version?.dailyRate ?? 10),
    maximumPenalty: String(version?.maximumPenalty ?? CAP_CEILING),
    effectiveOn: todayCampusDate(),
    changeReason: '',
  }
}

export function AdminFinePoliciesPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [data, setData] = useState<FinePolicyList | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => fromVersion(null))
  const [inlineDraft, setInlineDraft] = useState<Draft>(() => fromVersion(null))
  const [inlineConfirming, setInlineConfirming] = useState(false)
  const [formError, setFormError] = useState('')
  const [inlineError, setInlineError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const dialogRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const list = await finePoliciesApi.list()
      setData(list)
      setInlineDraft(fromVersion(list.active ?? null))
      setInlineConfirming(false)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Fine rules are unavailable.')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => { if (showForm) dialogRef.current?.querySelector<HTMLElement>('input, textarea, button')?.focus() }, [showForm])

  function edit(next: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...next }))
    setConfirming(false)
  }

  function editInline(next: Partial<Draft>) {
    setInlineDraft((current) => ({ ...current, ...next }))
    setInlineConfirming(false)
    setInlineError('')
  }

  function openForm() {
    openerRef.current = document.activeElement as HTMLElement | null
    setDraft(fromVersion(data?.active ?? null))
    setConfirming(false)
    setFormError('')
    setFieldErrors({})
    setNotice('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setConfirming(false)
    setFormError('')
    setFieldErrors({})
    openerRef.current?.focus()
  }

  function onDialogKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !busy) { closeForm(); return }
    if (event.key !== 'Tab') return
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('input, textarea, button:not([disabled])') ?? [])]
    const first = focusable[0]
    const last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }

  useEffect(() => {
    const firstInvalid = Object.keys(fieldErrors)[0]
    if (firstInvalid) dialogRef.current?.querySelector<HTMLElement>(`[name="${firstInvalid}"]`)?.focus()
  }, [fieldErrors])

  const active = data?.active ?? null
  const changes = [
    ...amountFields.map(([key, label]) => [label, active ? peso(active[key]) : null, peso(Number(draft[key]))] as const),
    ['Starts', null, draft.effectiveOn] as const,
  ].filter(([label, before, after]) => label === 'Starts' || before !== after).map(([label, before, after]) => before ? `${label}: ${before} → ${after}` : `${label}: ${after}`)

  const inlineValidationWarning = useMemo(() => {
    const h = Number(inlineDraft.hourlyRate)
    const d = Number(inlineDraft.dailyRate)
    const m = Number(inlineDraft.maximumPenalty)
    if (!Number.isFinite(h) || h < 0) return 'Hourly rate must be PHP 0.00 or higher.'
    if (!Number.isFinite(d) || d < 0) return 'Daily rate must be PHP 0.00 or higher.'
    if (!Number.isFinite(m) || m <= 0 || m > CAP_CEILING) return `Maximum fine cap must be between PHP 0.01 and PHP ${CAP_CEILING.toFixed(2)}.`
    if (h > d) return 'Hourly rate cannot exceed the daily rate.'
    if (d > m) return 'Daily rate cannot exceed the maximum fine cap.'
    return ''
  }, [inlineDraft.hourlyRate, inlineDraft.dailyRate, inlineDraft.maximumPenalty])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!confirming) { setConfirming(true); return }
    setBusy(true); setFormError(''); setFieldErrors({})
    const input: FinePolicyInput = {
      hourlyRate: Number(draft.hourlyRate),
      dailyRate: Number(draft.dailyRate),
      maximumPenalty: Number(draft.maximumPenalty),
      effectiveOn: draft.effectiveOn,
      changeReason: draft.changeReason,
    }
    try {
      const created = await finePoliciesApi.publish(input)
      setShowForm(false); setConfirming(false); openerRef.current?.focus()
      setNotice(`Fine rules saved. ${created.status === 'scheduled' ? `They start on ${draft.effectiveOn}.` : 'They apply to loans that fall due from this moment on.'}`)
      await load()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'The fine rules could not be saved.')
      setFieldErrors(cause instanceof FinePolicyError ? cause.fieldErrors : {})
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  async function submitInline(event: FormEvent) {
    event.preventDefault()
    if (inlineValidationWarning) {
      setInlineError(inlineValidationWarning)
      return
    }
    if (inlineDraft.changeReason.trim().length < 10) {
      setInlineError('Enter a reason of at least 10 characters explaining why the fine rules changed.')
      return
    }
    if (!inlineConfirming) {
      setInlineConfirming(true)
      setInlineError('')
      return
    }
    setBusy(true)
    setInlineError('')
    setNotice('')
    try {
      const created = await finePoliciesApi.publish({
        hourlyRate: Number(inlineDraft.hourlyRate),
        dailyRate: Number(inlineDraft.dailyRate),
        maximumPenalty: Number(inlineDraft.maximumPenalty),
        effectiveOn: inlineDraft.effectiveOn,
        changeReason: inlineDraft.changeReason.trim(),
      })
      setInlineConfirming(false)
      setNotice(`Fine rules saved. ${created.status === 'scheduled' ? `They start on ${inlineDraft.effectiveOn}.` : 'They apply to loans that fall due from this moment on.'}`)
      await load()
    } catch (cause) {
      setInlineError(cause instanceof Error ? cause.message : 'The fine rules could not be saved.')
      setInlineConfirming(false)
    } finally {
      setBusy(false)
    }
  }

  const fieldHint = (key: string) => fieldErrors[key] ? <span id={`${key}-error`} className="mt-1 block text-xs font-semibold text-red-700">{fieldErrors[key]}</span> : null
  const invalid = (key: string) => fieldErrors[key] ? { 'aria-invalid': true as const, 'aria-describedby': `${key}-error` } : {}

  return (
    <div className="space-y-5">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-700/60 dark:bg-slate-900">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#0b5ea2] dark:text-sky-300">Fines settings</p>
            <h2 className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-slate-100">Fine rules &amp; overdue penalties</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Configure hourly due-date rates, daily overdue rates, and the maximum fine cap for borrowed books.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <RefreshButton onRefresh={() => load()} variant="secondary" disabled={busy} />
            <Button disabled={busy || !data} onClick={openForm}><SlidersHorizontal size={16} />Change fine rules</Button>
          </div>
        </div>
      ) : (
        <PageHeader
          eyebrow="Fines settings"
          title="Fine rules"
          description="Configure hourly due-date rates, daily overdue rates, and the maximum fine cap for borrowed books."
          action={(
            <div className="flex flex-wrap gap-2">
              <RefreshButton onRefresh={() => load()} variant="secondary" disabled={busy} />
              <Button disabled={busy || !data} onClick={openForm}><SlidersHorizontal size={16} />Change fine rules</Button>
            </div>
          )}
        />
      )}

      {error ? <NoticeBanner tone="error">{error}</NoticeBanner> : null}
      {notice ? <div role="status" data-tone="success" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200">{notice}</div> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Due-date hourly rate"
          value={peso(active?.hourlyRate ?? 2)}
          note="Charged per hour after due cutoff until closing"
          icon={Clock}
          tone="blue"
        />
        <StatCard
          label="Overdue daily rate"
          value={peso(active?.dailyRate ?? 10)}
          note="Charged per open library day after due date"
          icon={CircleDollarSign}
          tone="amber"
        />
        <StatCard
          label="Maximum fine cap"
          value={peso(active?.maximumPenalty ?? CAP_CEILING)}
          note={`Hard ceiling per loan (up to PHP ${CAP_CEILING.toFixed(2)})`}
          icon={ShieldAlert}
          tone="green"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <SectionCard className="p-5 lg:col-span-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0b5ea2]/10 text-[#0b5ea2] dark:bg-sky-500/20 dark:text-sky-300">
              <CircleDollarSign size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">Current overdue fine</h2>
                <StatusBadge status={active?.status ?? 'active'} />
              </div>
              <p className="mt-2 text-sm font-semibold text-[#0b5ea2] dark:text-sky-300">
                {active ? describeRule(active) : busy ? 'Loading…' : 'No fine rule is saved. The system uses PHP 2.00 per hour, PHP 10.00 per library day, at most PHP 500.00.'}
              </p>
              {data?.scheduled.map((item) => (
                <p key={item.versionId} className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  Scheduled from {campusDateTime(item.effectiveFrom)}: {describeRule(item)}
                </p>
              ))}
              <div className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-xs leading-relaxed text-slate-600 dark:border-slate-700/60 dark:bg-slate-800/40 dark:text-slate-300">
                <p className="font-bold text-slate-800 dark:text-slate-200">How overdue fines are calculated</p>
                <p className="mt-1">
                  On the due date, hours count only until closing and never cost more than one day&apos;s rate. A fine follows the rule in force on its loan&apos;s due date. Fines already paid, waived or settled never change. Lost books are charged at the book&apos;s price.
                </p>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard className="p-5 lg:col-span-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3 dark:border-slate-700/60">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">Set new fine rule</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Adjust the hourly rate, daily rate, and maximum penalty directly below. Saved versions are permanent.</p>
            </div>
            <span className="rounded-full bg-[#0b5ea2]/10 px-2.5 py-1 text-xs font-bold text-[#0b5ea2] dark:bg-sky-500/20 dark:text-sky-300">
              Max cap: PHP {CAP_CEILING}.00
            </span>
          </div>

          <form onSubmit={submitInline} className="grid gap-4 sm:grid-cols-3">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
              New hourly rate (PHP)
              <input
                required
                type="number"
                inputMode="decimal"
                min={0}
                max={CAP_CEILING}
                step="0.01"
                value={inlineDraft.hourlyRate}
                onChange={(event) => editInline({ hourlyRate: event.target.value })}
                className={`${field} mt-1.5`}
              />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
              New daily rate (PHP)
              <input
                required
                type="number"
                inputMode="decimal"
                min={0}
                max={CAP_CEILING}
                step="0.01"
                value={inlineDraft.dailyRate}
                onChange={(event) => editInline({ dailyRate: event.target.value })}
                className={`${field} mt-1.5`}
              />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
              New maximum cap (PHP)
              <input
                required
                type="number"
                inputMode="decimal"
                min={0.01}
                max={CAP_CEILING}
                step="0.01"
                value={inlineDraft.maximumPenalty}
                onChange={(event) => editInline({ maximumPenalty: event.target.value })}
                className={`${field} mt-1.5`}
              />
            </label>

            <label className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
              Effective start date
              <input
                required
                type="date"
                min={todayCampusDate()}
                value={inlineDraft.effectiveOn}
                onChange={(event) => editInline({ effectiveOn: event.target.value })}
                className={`${field} mt-1.5`}
              />
            </label>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200 sm:col-span-2">
              Reason for policy update (min 10 characters)
              <input
                required
                minLength={10}
                maxLength={500}
                placeholder="e.g. Updated per Academic Year 2026-2027 Library Committee resolution"
                value={inlineDraft.changeReason}
                onChange={(event) => editInline({ changeReason: event.target.value })}
                className={`${field} mt-1.5`}
              />
            </label>

            {inlineValidationWarning ? (
              <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950 sm:col-span-3 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle size={16} className="shrink-0" />
                <span>{inlineValidationWarning}</span>
              </div>
            ) : null}

            {inlineError ? (
              <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-xs font-semibold text-red-900 sm:col-span-3 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                {inlineError}
              </div>
            ) : null}

            {inlineConfirming ? (
              <div className="rounded-xl border border-[#0b5ea2]/25 bg-[#0b5ea2]/5 p-3.5 text-xs text-slate-800 sm:col-span-3 dark:border-sky-500/30 dark:bg-sky-950/30 dark:text-slate-100">
                <p className="flex items-center gap-1.5 font-bold text-[#0b5ea2] dark:text-sky-300">
                  <CheckCircle2 size={15} /> Confirm new fine rule before publishing
                </p>
                <p className="mt-1">
                  {peso(Number(inlineDraft.hourlyRate))} per hour on due date · {peso(Number(inlineDraft.dailyRate))} per day after · Max cap {peso(Number(inlineDraft.maximumPenalty))} · Effective {inlineDraft.effectiveOn}
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-3">
              {inlineConfirming ? (
                <Button variant="secondary" type="button" disabled={busy} onClick={() => setInlineConfirming(false)}>
                  Keep editing
                </Button>
              ) : null}
              <Button type="submit" disabled={busy || !data || Boolean(inlineValidationWarning)}>
                {inlineConfirming ? 'Confirm & publish fine rule' : 'Preview & save fine rule'}
              </Button>
            </div>
          </form>
        </SectionCard>
      </div>

      <SectionCard className="overflow-hidden">
        <div className="border-b border-slate-200/80 bg-slate-50/70 px-5 py-4 dark:border-slate-700/60 dark:bg-slate-800/40">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">Fine rule history</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Audit log of all published overdue fine rules and their effective dates.</p>
        </div>
        <ResponsiveTable>
          <table aria-label="Fine rule history" className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-100/80 text-xs font-bold uppercase tracking-wider text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Starts</th>
                <th className="px-4 py-3">Per hour</th>
                <th className="px-4 py-3">Per day</th>
                <th className="px-4 py-3">Maximum</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/50">
              {data?.history.length ? data.history.map((item) => (
                <tr key={item.versionId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                  <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{campusDateTime(item.effectiveFrom)}</td>
                  <td className="px-4 py-3 tabular-nums font-semibold text-slate-900 dark:text-slate-100">{peso(item.hourlyRate)}</td>
                  <td className="px-4 py-3 tabular-nums font-semibold text-slate-900 dark:text-slate-100">{peso(item.dailyRate)}</td>
                  <td className="px-4 py-3 tabular-nums font-bold text-[#0b5ea2] dark:text-sky-300">{peso(item.maximumPenalty)}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.changeReason ?? 'Original rule'}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No fine rules recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </ResponsiveTable>
      </SectionCard>

      {showForm ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#132a3f]/75 p-4 backdrop-blur-xs">
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="fine-form-title" onKeyDown={onDialogKeyDown} className="mx-auto my-8 max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <header className="border-b border-slate-200 p-5 dark:border-slate-700">
              <h2 id="fine-form-title" className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">Change fine rules</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Saved rules are permanent. To correct one, save another. The maximum fine is at most PHP {CAP_CEILING}.</p>
            </header>
            <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-3">
              {amountFields.map(([key, label]) => (
                <label key={key} className="text-sm font-bold text-slate-800 dark:text-slate-200">{label} (PHP)
                  <input required type="number" inputMode="decimal" min={key === 'maximumPenalty' ? 0.01 : 0} max={CAP_CEILING} step="0.01" name={key} value={draft[key]} onChange={(event) => edit({ [key]: event.target.value })} className={`${field} mt-1`} {...invalid(key)} />
                  {fieldHint(key)}
                </label>
              ))}
              <label className="text-sm font-bold text-slate-800 dark:text-slate-200 sm:col-span-3">Starts on
                <input required name="effectiveOn" type="date" min={todayCampusDate()} value={draft.effectiveOn} onChange={(event) => edit({ effectiveOn: event.target.value })} className={`${field} mt-1`} {...invalid('effectiveOn')} />
                {fieldHint('effectiveOn')}
              </label>
              <label className="text-sm font-bold text-slate-800 dark:text-slate-200 sm:col-span-3">Reason for the change
                <textarea required name="changeReason" minLength={10} maxLength={500} rows={3} value={draft.changeReason} onChange={(event) => edit({ changeReason: event.target.value })} className={`${field} mt-1 h-auto py-2`} {...invalid('changeReason')} />
                {fieldHint('changeReason')}
              </label>
              {confirming ? (
                <div role="status" className="rounded-xl bg-[#0b5ea2]/5 p-3 text-sm text-slate-900 sm:col-span-3 dark:bg-sky-950/40 dark:text-slate-100">
                  <p className="font-bold text-[#0b5ea2] dark:text-sky-300">Check these changes</p>
                  <ul className="mt-1 list-disc pl-5">{changes.map((line) => <li key={line}>{line}</li>)}</ul>
                </div>
              ) : null}
              {formError ? <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-900 sm:col-span-3">{formError}</div> : null}
              <div className="flex flex-wrap justify-end gap-2 sm:col-span-3">
                <Button variant="secondary" disabled={busy} onClick={closeForm}>Cancel</Button>
                <Button type="submit" disabled={busy}>{confirming ? 'Save fine rules' : 'Review changes'}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
