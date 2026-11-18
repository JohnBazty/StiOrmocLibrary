import { AlertTriangle, CircleDollarSign, RefreshCw, SlidersHorizontal } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Button, PageHeader, SectionCard, StatusBadge } from '../../components/ui'
import { finePoliciesApi, FinePolicyError, type FinePolicyInput, type FinePolicyList, type FinePolicyVersion } from './fine-policies-api'

const field = 'h-11 w-full rounded-xl border border-[#003399]/20 bg-white px-3 text-sm text-[#003399] outline-none focus:ring-4 focus:ring-[#003399]/10'
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
  return { hourlyRate: String(version?.hourlyRate ?? 2), dailyRate: String(version?.dailyRate ?? 10), maximumPenalty: String(version?.maximumPenalty ?? CAP_CEILING), effectiveOn: todayCampusDate(), changeReason: '' }
}

export function AdminFinePoliciesPage() {
  const [data, setData] = useState<FinePolicyList | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => fromVersion(null))
  const [formError, setFormError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const dialogRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    try { setData(await finePoliciesApi.list()); setError('') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Fine rules are unavailable.') } finally { setBusy(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (showForm) dialogRef.current?.querySelector<HTMLElement>('input, textarea, button')?.focus() }, [showForm])

  // Any edit invalidates the reviewed change list, so the Librarian must review again.
  function edit(next: Partial<Draft>) { setDraft((current) => ({ ...current, ...next })); setConfirming(false) }

  function openForm() {
    openerRef.current = document.activeElement as HTMLElement | null
    setDraft(fromVersion(data?.active ?? null)); setConfirming(false); setFormError(''); setFieldErrors({}); setNotice(''); setShowForm(true)
  }
  function closeForm() { setShowForm(false); setConfirming(false); setFormError(''); setFieldErrors({}); openerRef.current?.focus() }
  function onDialogKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !busy) { closeForm(); return }
    if (event.key !== 'Tab') return
    // Keep Tab inside the modal dialog.
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('input, textarea, button:not([disabled])') ?? [])]
    const first = focusable[0]; const last = focusable.at(-1)
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

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!confirming) { setConfirming(true); return }
    setBusy(true); setFormError(''); setFieldErrors({})
    const input: FinePolicyInput = { hourlyRate: Number(draft.hourlyRate), dailyRate: Number(draft.dailyRate), maximumPenalty: Number(draft.maximumPenalty), effectiveOn: draft.effectiveOn, changeReason: draft.changeReason }
    try {
      const created = await finePoliciesApi.publish(input)
      setShowForm(false); setConfirming(false); openerRef.current?.focus()
      setNotice(`Fine rules saved. ${created.status === 'scheduled' ? `They start on ${draft.effectiveOn}.` : 'They apply to loans that fall due from this moment on.'}`)
      await load()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'The fine rules could not be saved.')
      setFieldErrors(cause instanceof FinePolicyError ? cause.fieldErrors : {})
      setConfirming(false)
    } finally { setBusy(false) }
  }

  const fieldHint = (key: string) => fieldErrors[key] ? <span id={`${key}-error`} className="mt-1 block text-xs font-semibold text-red-700">{fieldErrors[key]}</span> : null
  const invalid = (key: string) => fieldErrors[key] ? { 'aria-invalid': true as const, 'aria-describedby': `${key}-error` } : {}

  return (
    <>
      <PageHeader eyebrow="Fines settings" title="Fine rules" action={(
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => void load()}><RefreshCw size={16} />Refresh</Button>
          <Button disabled={busy || !data} onClick={openForm}><SlidersHorizontal size={16} />Change fine rules</Button>
        </div>
      )} />
      {error ? <div role="alert" className="mb-4 flex gap-2 rounded-xl bg-[#FFF200] p-4 font-bold text-[#003399]"><AlertTriangle size={18} />{error}</div> : null}
      {notice ? <div role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 font-semibold text-emerald-800">{notice}</div> : null}

      <SectionCard className="mb-4">
        <div className="flex items-start gap-3 text-[#003399]">
          <CircleDollarSign className="mt-1 shrink-0" size={20} />
          <div>
            <h2 className="font-display text-lg font-bold">Current overdue fine</h2>
            <p className="mt-1 text-sm">{active ? describeRule(active) : busy ? 'Loading…' : 'No fine rule is saved. The system uses PHP 2.00 per hour, PHP 10.00 per library day, at most PHP 500.00.'}</p>
            {data?.scheduled.map((item) => <p key={item.versionId} className="mt-2 text-sm font-semibold">Scheduled from {campusDateTime(item.effectiveFrom)}: {describeRule(item)}</p>)}
            <p className="mt-2 text-xs text-[#003399]/70">On the due date, hours count only until closing and never cost more than one day's rate. A fine follows the rule in force on its loan's due date. Fines already paid, waived or settled never change. Lost books are charged at the book's price.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <div className="overflow-x-auto">
          <table aria-label="Fine rule history" className="w-full min-w-[640px] text-left text-sm text-[#003399]">
            <thead className="text-xs uppercase tracking-wide text-[#003399]/60"><tr><th className="p-2">Status</th><th className="p-2">Starts</th><th className="p-2">Per hour</th><th className="p-2">Per day</th><th className="p-2">Maximum</th><th className="p-2">Reason</th></tr></thead>
            <tbody>
              {data?.history.map((item) => (
                <tr key={item.versionId} className="border-t border-[#003399]/10">
                  <td className="p-2"><StatusBadge status={item.status} /></td>
                  <td className="p-2">{campusDateTime(item.effectiveFrom)}</td>
                  <td className="p-2">{peso(item.hourlyRate)}</td>
                  <td className="p-2">{peso(item.dailyRate)}</td>
                  <td className="p-2">{peso(item.maximumPenalty)}</td>
                  <td className="p-2">{item.changeReason ?? 'Original rule'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {showForm ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#003399]/75 p-4">
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="fine-form-title" onKeyDown={onDialogKeyDown} className="mx-auto my-8 max-w-2xl rounded-2xl bg-white shadow-2xl">
            <header className="border-b border-[#003399]/15 p-5">
              <h2 id="fine-form-title" className="font-display text-xl font-bold text-[#003399]">Change fine rules</h2>
              <p className="mt-1 text-sm text-[#003399]/70">Saved rules are permanent. To correct one, save another. The maximum fine is at most PHP {CAP_CEILING}.</p>
            </header>
            <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-3">
              {amountFields.map(([key, label]) => (
                <label key={key} className="text-sm font-bold text-[#003399]">{label} (PHP)
                  <input required type="number" inputMode="decimal" min={key === 'maximumPenalty' ? 0.01 : 0} max={CAP_CEILING} step="0.01" name={key} value={draft[key]} onChange={(event) => edit({ [key]: event.target.value })} className={`${field} mt-1`} {...invalid(key)} />
                  {fieldHint(key)}
                </label>
              ))}
              <label className="text-sm font-bold text-[#003399] sm:col-span-3">Starts on
                <input required name="effectiveOn" type="date" min={todayCampusDate()} value={draft.effectiveOn} onChange={(event) => edit({ effectiveOn: event.target.value })} className={`${field} mt-1`} {...invalid('effectiveOn')} />
                {fieldHint('effectiveOn')}
              </label>
              <label className="text-sm font-bold text-[#003399] sm:col-span-3">Reason for the change
                <textarea required name="changeReason" minLength={10} maxLength={500} rows={3} value={draft.changeReason} onChange={(event) => edit({ changeReason: event.target.value })} className={`${field} mt-1 h-auto py-2`} {...invalid('changeReason')} />
                {fieldHint('changeReason')}
              </label>
              {confirming ? (
                <div role="status" className="rounded-xl bg-[#003399]/5 p-3 text-sm text-[#003399] sm:col-span-3">
                  <p className="font-bold">Check these changes</p>
                  <ul className="mt-1 list-disc pl-5">{changes.map((line) => <li key={line}>{line}</li>)}</ul>
                </div>
              ) : null}
              {formError ? <div role="alert" className="rounded-xl bg-[#FFF200] p-3 text-sm font-bold text-[#003399] sm:col-span-3">{formError}</div> : null}
              <div className="flex flex-wrap justify-end gap-2 sm:col-span-3">
                <Button variant="secondary" disabled={busy} onClick={closeForm}>Cancel</Button>
                <Button type="submit" disabled={busy}>{confirming ? 'Save fine rules' : 'Review changes'}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
