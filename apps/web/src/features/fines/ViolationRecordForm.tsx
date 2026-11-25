import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, FormField, NoticeBanner, SectionCard } from '../../components/ui'
import { ViolationProgress, recordButtonLabel } from './ViolationProgress'
import { adminViolationsBase, ViolationRequestError, violationRequest, violationsApi, type Standing } from './violations-api'

const LOOKUP_DELAY_MS = 250
const peso = (value: number) => `PHP ${value.toFixed(2)}`
const manilaNow = () => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16)
const toInstant = (local: string) => new Date(`${local}:00+08:00`)


/** `key` names the person, category and paper-log choice the answer belongs to. */
type Lookup = { state: 'idle' } | { state: 'loading' } | { state: 'ready'; key: string; standing: Standing } | { state: 'error'; message: string }

export function ViolationRecordForm({ categories, onSaved, onCancel }: {
  /** Active categories only; retired ones cannot take new records. */
  categories: string[]
  onSaved: (message: string) => void
  onCancel: () => void
}) {
  const [schoolId, setSchoolId] = useState('')
  const [category, setCategory] = useState(categories[0] ?? '')
  const [paperLog, setPaperLog] = useState(false)
  const [incidentAt, setIncidentAt] = useState(manilaNow)
  const [location, setLocation] = useState('Library')
  const [details, setDetails] = useState('')
  const [touched, setTouched] = useState(false)
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const attempt = useRef({ payload: '', key: '' })
  const sequence = useRef(0)

  const loadStanding = useCallback(async (id: string, name: string, paper: boolean, current = ++sequence.current) => {
    setLookup({ state: 'loading' })
    try {
      const standing = await violationsApi.standing(id, name, paper)
      if (current === sequence.current) setLookup({ state: 'ready', key: `${id}|${name}|${paper}`, standing })
    } catch (cause) {
      if (current === sequence.current) setLookup({ state: 'error', message: cause instanceof Error ? cause.message : 'The standing could not be loaded.' })
    }
  }, [])

  // Keep the chosen category valid when the list loads or changes after the form opened.
  useEffect(() => {
    if (!categories.includes(category)) setCategory(categories[0] ?? '')
  }, [categories, category])

  useEffect(() => {
    // Every change invalidates any answer still on its way, before the typing pause even ends.
    const current = ++sequence.current
    const id = schoolId.trim()
    if (id.length < 3 || !category) {
      setLookup({ state: 'idle' })
      return
    }
    setLookup({ state: 'loading' })
    const timer = setTimeout(() => void loadStanding(id, category, paperLog, current), LOOKUP_DELAY_MS)
    return () => clearTimeout(timer)
  }, [schoolId, category, paperLog, loadStanding])

  const detailsError = details.trim().length < 10 ? 'Enter at least 10 characters about what happened.' : ''
  const when = toInstant(incidentAt)
  const dateError = !incidentAt || Number.isNaN(when.getTime()) ? 'Enter when it happened.' : when.getTime() > Date.now() + 60_000 ? 'Choose a time no later than now.' : ''
  const idError = lookup.state === 'error' ? lookup.message : ''
  const currentKey = `${schoolId.trim()}|${category}|${paperLog}`
  const standing = lookup.state === 'ready' && lookup.key === currentKey ? lookup.standing : null
  const levelBlocked = Boolean(standing && standing.levelAllowed === false)
  const canSave = Boolean(standing) && !levelBlocked && !detailsError && !dateError && !busy

  async function save(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (!standing || detailsError || dateError || busy) return
    const body = { schoolId: schoolId.trim(), category, incidentAt: when.toISOString(), location: location.trim() || 'Library', details: details.trim(), fromPaperLog: paperLog }
    const payload = JSON.stringify(body)
    // The same details keep the same request key, so a retry after a dropped connection never saves twice.
    if (attempt.current.payload !== payload) attempt.current = { payload, key: crypto.randomUUID() }
    setBusy(true)
    setError('')
    try {
      await violationRequest(adminViolationsBase, { ...body, reviewToken: standing.reviewToken, requestKey: attempt.current.key })
      onSaved(paperLog ? 'Paper-log warning saved. The person was not notified.' : 'Violation saved. The person has been notified.')
    } catch (cause) {
      if (cause instanceof ViolationRequestError && cause.code === 'CONDUCT_STALE') {
        setError(`${cause.message} The steps below are up to date.`)
        void loadStanding(body.schoolId, body.category, paperLog)
      } else setError(cause instanceof Error ? cause.message : 'The violation could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  if (!categories.length) {
    return (
      <NoticeBanner tone="warning" action={<a className="text-xs font-semibold underline" href="/librarian/maintenance?tab=violation-rules">Open Library setup</a>}>
        No active violation category. Add one in Library setup → Violation rules.
      </NoticeBanner>
    )
  }

  return (
    <SectionCard className="my-4 p-5">
      <form onSubmit={save} noValidate aria-label="Record a violation" className="grid gap-4 sm:grid-cols-2">
        <h3 className="font-display text-base font-semibold text-[var(--sl-text-header)] sm:col-span-2">Record a violation</h3>
        {error ? <div className="sm:col-span-2"><NoticeBanner tone="error">{error}</NoticeBanner></div> : null}
        <FormField id="vr-school" label="School ID" required error={idError}>
          <input id="vr-school" className="sl-input" value={schoolId} onChange={event => setSchoolId(event.target.value)} autoComplete="off"
            aria-invalid={Boolean(idError)} aria-describedby={idError ? 'vr-school-error' : undefined} />
        </FormField>
        <FormField id="vr-category" label="Category" required>
          <select id="vr-category" className="sl-input" value={category} onChange={event => setCategory(event.target.value)}>
            {categories.map(name => <option key={name}>{name}</option>)}
          </select>
        </FormField>

        <div className="space-y-3 sm:col-span-2" aria-live="polite">
          {lookup.state === 'loading' ? <p role="status" className="text-sm text-[var(--sl-text-secondary)]">Checking this person’s record…</p> : null}
          {standing ? (
            <div className="space-y-3 rounded-[8px] border border-[var(--sl-border)] bg-[var(--sl-bg-subtle)] p-4">
              <p className="font-semibold text-[var(--sl-text-header)]">
                {standing.name} · {standing.role}{standing.studentLevel ? ` · ${standing.studentLevel}` : ''}
              </p>
              {standing.levelAllowed === false ? (
                <NoticeBanner tone="warning">{standing.levelReason ?? 'This violation category does not apply to this student’s year or grade level.'}</NoticeBanner>
              ) : (
                <>
                  <ViolationProgress standing={standing} />
                  {standing.nextStep === 'Fine' && !standing.fromPaperLog && standing.amount ? (
                    <div role="group" aria-label="Amount to pay" className="rounded-[8px] border border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] p-3">
                      <p className="text-xs font-semibold text-[var(--sl-text-secondary)]">Amount to pay</p>
                      <p className="text-xl font-bold tabular-nums text-[var(--sl-text-header)]">{peso(standing.amount)}</p>
                      <p className="text-xs text-[var(--sl-text-muted)]">Set in Library setup → Violation rules. To change one fine, use Adjust on Fines &amp; charges.</p>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>

        <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
          <input type="checkbox" checked={paperLog} disabled={Boolean(standing) && !standing?.paperLogAllowed} onChange={event => setPaperLog(event.target.checked)} />
          From the paper log
          <span className="text-xs font-normal text-[var(--sl-text-muted)]">
            {standing && !standing.paperLogAllowed
              ? standing.paperLogReason
              : 'An earlier warning from before the system, copied in with its real date. It counts toward the steps and never creates a fine.'}
          </span>
        </label>

        <FormField id="vr-when" label="When (Philippines)" required error={touched || dateError ? dateError : ''}>
          <input id="vr-when" type="datetime-local" className="sl-input" value={incidentAt} max={manilaNow()} onChange={event => setIncidentAt(event.target.value)} />
        </FormField>
        <FormField id="vr-where" label="Where">
          <input id="vr-where" className="sl-input" value={location} maxLength={150} onChange={event => setLocation(event.target.value)} />
        </FormField>
        <FormField id="vr-details" label="What happened?" required className="sm:col-span-2" error={touched ? detailsError : ''}>
          <textarea id="vr-details" className="sl-input h-24 py-2.5" value={details} maxLength={1000} onBlur={() => setTouched(true)} onChange={event => setDetails(event.target.value)} />
        </FormField>

        <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={!canSave}>{busy ? 'Saving…' : standing ? recordButtonLabel(standing) : 'Record violation'}</Button>
        </div>
      </form>
    </SectionCard>
  )
}
