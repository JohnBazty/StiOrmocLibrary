import { CalendarDays, Plus, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, StatusBadge } from '../../components/ui'
import { clearanceApi } from './clearance-api'
import { ClearanceDayPicker } from './ClearanceDayPicker'
import type { ClearanceGroup, ClearanceSchedule, ClearanceWindow } from './types'

const groups: ClearanceGroup[] = ['All', 'BSIT', 'BSHM', 'BSTM', 'Grade 11', 'Grade 12']
const field = 'mt-1 min-h-11 w-full rounded-xl border bg-transparent px-3 py-2 text-sm'
const label = (group: ClearanceGroup) => group === 'All' ? 'All groups' : group
const date = (value: string) => new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' })
const localTime = (value: string) => new Date(Date.parse(value) + 8 * 3600_000).toISOString().slice(0, 16)
const instant = (value: string) => new Date(`${value}:00+08:00`).toISOString()
function status(window: ClearanceWindow) { return Date.now() < Date.parse(window.startsAt) ? 'Upcoming' : Date.now() >= Date.parse(window.endsAt) ? 'Closed' : 'Open' }

export function ClearanceScheduleEditor() {
  const [loadingTerms, setLoadingTerms] = useState(true)
  const [terms, setTerms] = useState<Awaited<ReturnType<typeof clearanceApi.terms>>>([])
  const [data, setData] = useState<ClearanceSchedule | null>(null)
  const [termId, setTermId] = useState('')
  const [editing, setEditing] = useState<ClearanceWindow | null>(null)
  const [opened, setOpened] = useState(false)
  const [group, setGroup] = useState<ClearanceGroup>('All')
  const [startsAt, setStartsAt] = useState(''), [endsAt, setEndsAt] = useState('')
  const [mode, setMode] = useState<'days' | 'period'>('days')
  const [days, setDays] = useState<string[]>([])
  const [opens, setOpens] = useState('08:00'), [closes, setCloses] = useState('17:00')
  const submissionKeys = useRef(new Map<string, string>())
  const periods = mode === 'days' ? days.map(day => ({ day, startsAt: `${day}T${opens}`, endsAt: `${day}T${closes}` })) : [{ day: '', startsAt, endsAt }]
  const [review, setReview] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<ClearanceWindow | null>(null)
  const [busy, setBusy] = useState(false), [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const changed = Boolean(editing && data && !data.windows?.some(window => window.id === editing.id && window.version === editing.version))
  const generation = useRef(0), inFlight = useRef(false), reading = useRef<number | null>(null)
  useEffect(() => {
    let active = true
    clearanceApi.terms().then(value => { if (active) { setTerms(value); const selected = value.find(term => Number(term.is_active) === 1) ?? value[0]; if (selected) setTermId(String(selected.id)) } })
      .catch(() => { if (active) setError('Semesters could not be loaded. Reload the page to try again.') })
      .finally(() => { if (active) setLoadingTerms(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    setData(null); setError(''); setNotice(''); setOpened(false); setCancelTarget(null)
    if (!termId) return
    let active = true
    const load = async () => {
      if (inFlight.current || reading.current !== null || document.hidden) return
      const sequence = ++generation.current
      reading.current = sequence
      try {
        const result = await clearanceApi.schedule(Number(termId), true)
        if (active && sequence === generation.current) { setData(result); setError('') }
      } catch { if (active && sequence === generation.current) setError('Schedules could not be refreshed. Your last confirmed records are still shown.') }
      finally { if (reading.current === sequence) reading.current = null }
    }
    void load()
    const refresh = () => { void load() }
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh)
    return () => { active = false; ++generation.current; reading.current = null; clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [termId])
  async function reload() {
    if (!termId || inFlight.current || reading.current !== null) return
    const sequence = ++generation.current
    reading.current = sequence; setRefreshing(true)
    try { const result = await clearanceApi.schedule(Number(termId), true); if (sequence === generation.current) { setData(result); setError(''); setNotice('Schedules updated. Any open form is preserved.') } }
    catch { setError('Schedules could not be refreshed. Try again.') }
    finally { if (reading.current === sequence) reading.current = null; setRefreshing(false) }
  }
  function open(window: ClearanceWindow | null) {
    setEditing(window); setGroup(window?.group ?? 'All'); setStartsAt(window ? localTime(window.startsAt) : ''); setEndsAt(window ? localTime(window.endsAt) : '')
    setOpened(true); setReview(false); setCancelTarget(null); setError(''); setNotice('')
    setMode(window ? 'period' : 'days'); setDays([]); setOpens('08:00'); setCloses('17:00'); submissionKeys.current.clear()
  }
  function reviewSchedule(event: FormEvent) {
    event.preventDefault()
    if (mode === 'days' && !days.length) { setError('Choose at least one day.'); return }
    if (periods.some(period => !period.startsAt || !period.endsAt || !Number.isFinite(Date.parse(`${period.startsAt}:00+08:00`)) || !Number.isFinite(Date.parse(`${period.endsAt}:00+08:00`)) || Date.parse(`${period.endsAt}:00+08:00`) <= Date.parse(`${period.startsAt}:00+08:00`))) { setError('Closing time must be after opening time.'); return }
    setError(''); setReview(true)
  }
  async function save() {
    if (inFlight.current || !review || !data || changed) return
    inFlight.current = true; ++generation.current; setBusy(true); setError(''); setNotice('')
    const savedDays: string[] = []
    try {
      for (const period of periods) {
        const signature = JSON.stringify([termId, group, period.startsAt, period.endsAt])
        let key = submissionKeys.current.get(signature)
        if (!key) { key = crypto.randomUUID(); submissionKeys.current.set(signature, key) }
        const result = await clearanceApi.saveSchedule({ termId: Number(termId), id: editing?.id ?? null, version: editing?.version ?? 0, group, startsAt: instant(period.startsAt), endsAt: instant(period.endsAt), requestKey: key })
        setData(result); savedDays.push(period.day)
      }
      setOpened(false); setReview(false); setNotice(mode === 'days' ? `${savedDays.length} clearance ${savedDays.length === 1 ? 'day' : 'days'} saved. Students will see their applicable dates.` : 'Clearance schedule saved. Students will see their applicable dates.')
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The schedule could not be saved.'
      setError(savedDays.length ? `${savedDays.length} ${savedDays.length === 1 ? 'day' : 'days'} saved. Remaining days are still selected. ${message}` : message)
      if (mode === 'days') setDays(current => current.filter(day => !savedDays.includes(day)))
      setReview(false)
    }
    finally { setBusy(false); inFlight.current = false }
  }
  async function cancel() {
    if (!cancelTarget || inFlight.current) return
    inFlight.current = true; ++generation.current; setBusy(true); setError(''); setNotice('')
    try { setData(await clearanceApi.cancelSchedule(cancelTarget.id, Number(termId), cancelTarget.version)); setCancelTarget(null); setNotice('Schedule cancelled. Its change history is retained.') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The schedule could not be cancelled.') }
    finally { setBusy(false); inFlight.current = false }
  }
  return <section aria-label="Clearance schedules" className="mb-5 overflow-hidden rounded-2xl border">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:p-5">
      <div className="flex items-center gap-3"><CalendarDays size={22} className="shrink-0 text-[#0b5ea2]" /><div><h2 className="text-balance text-lg font-bold">Clearance schedules</h2><p className="text-sm opacity-70">Set periods for a group or all students. Asia/Manila time.</p></div></div>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={!termId || busy || refreshing} onClick={() => void reload()}><RefreshCw size={16} />Refresh schedules</Button><Button disabled={!data || busy || opened || Boolean(cancelTarget)} onClick={() => open(null)}><Plus size={16} />Add schedule</Button></div>
    </div>
    <div className="p-4 sm:p-5">
      <label className="block max-w-sm text-sm font-semibold">Semester<select className={field} disabled={busy || opened || Boolean(cancelTarget)} value={termId} onChange={event => setTermId(event.target.value)}><option value="">Choose semester</option>{terms.map(term => <option key={term.id} value={term.id}>{term.academic_year} — {term.term_name}</option>)}</select></label>
      <p className="mt-3 text-pretty text-xs leading-5 opacity-70">A group with its own schedule uses those periods instead of All groups for this semester. Requirements remain based on books and unpaid charges.</p>
      {error ? <p role="alert" className="auth-error mt-3 rounded-xl p-3 text-sm">{error}</p> : null}
      {notice ? <p role="status" data-tone="success" className="mt-3 rounded-xl border border-green-600/30 p-3 text-sm">{notice}</p> : null}
      {data?.windows?.length ? <ul className="mt-4 divide-y rounded-xl border">{data.windows.map(window => <li key={window.id} className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong>{label(window.group)}</strong><StatusBadge status={status(window)} /></div><p className="mt-1 text-sm tabular-nums opacity-75">{date(window.startsAt)} — {date(window.endsAt)}</p></div><div className="flex gap-2"><Button variant="secondary" disabled={busy || opened || Boolean(cancelTarget)} onClick={() => open(window)}>Edit</Button><Button variant="secondary" disabled={busy || opened || Boolean(cancelTarget)} onClick={() => { setCancelTarget(window); setError(''); setNotice('') }}>Cancel schedule</Button></div></li>)}</ul> : data ? <p className="mt-4 rounded-xl border border-dashed p-4 text-sm opacity-75">No schedules for this semester. Choose Add schedule to set the first period.</p> : termId && !error ? <p role="status" className="mt-3 text-sm">Loading schedules…</p> : null}
      {cancelTarget ? <div className="mt-4 rounded-xl border p-4"><h3 className="font-bold">Cancel {label(cancelTarget.group)} schedule?</h3><p className="mt-1 text-sm">{date(cancelTarget.startsAt)} — {date(cancelTarget.endsAt)}</p><p className="mt-2 text-sm opacity-75">Students stop using this period. If no group periods remain, an All groups schedule applies when available.</p><div className="mt-3 flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void cancel()}>{busy ? 'Cancelling…' : 'Confirm cancellation'}</Button><Button variant="secondary" disabled={busy} onClick={() => setCancelTarget(null)}>Keep schedule</Button></div></div> : null}
      {opened ? <form onSubmit={reviewSchedule} className="mt-4 rounded-xl border bg-[#0b5ea2]/5 p-4"><h3 className="font-bold">{editing ? 'Edit schedule' : 'Add clearance schedule'}</h3>
        <fieldset disabled={busy || review || changed} className="mt-3 grid gap-3 sm:grid-cols-3">
          {!editing ? <fieldset className="flex flex-wrap gap-4 sm:col-span-3"><legend className="mb-2 text-sm font-semibold">Schedule days</legend><label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="clearance-mode" checked={mode === 'days'} onChange={() => setMode('days')} />Choose multiple days</label><label className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="clearance-mode" checked={mode === 'period'} onChange={() => setMode('period')} />Continuous period</label></fieldset> : null}
          <label className="text-sm font-semibold">Group<select value={group} onChange={event => setGroup(event.target.value as ClearanceGroup)} className={field}>{groups.map(value => <option key={value} value={value}>{label(value)}</option>)}</select></label>
          {mode === 'days' ? <>
            <label className="text-sm font-semibold">Opening time (Manila time)<input type="time" required value={opens} onChange={event => setOpens(event.target.value)} className={field} /></label>
            <label className="text-sm font-semibold">Closing time (Manila time)<input type="time" required value={closes} onChange={event => setCloses(event.target.value)} className={field} /></label>
            <ClearanceDayPicker days={days} onChange={setDays} />
          </> : <>
            <label className="text-sm font-semibold">Opens (Manila time)<input type="datetime-local" required value={startsAt} onChange={event => setStartsAt(event.target.value)} className={field} /></label>
            <label className="text-sm font-semibold">Closes (Manila time)<input type="datetime-local" required value={endsAt} onChange={event => setEndsAt(event.target.value)} className={field} /></label>
          </>}
        </fieldset>
        {changed ? <div className="mt-3 rounded-xl border p-3 text-sm"><p>This schedule changed. Your draft is preserved. Open the latest version before editing again.</p><Button variant="secondary" disabled={busy} onClick={() => { const latest = data?.windows?.find(window => window.id === editing?.id); if (latest) open(latest); else setOpened(false) }}>Open latest version</Button></div> : null}
        {review ? <div className="mt-4 rounded-xl border bg-white/5 p-3"><h4 className="font-semibold">Review schedule</h4><p className="mt-1 text-sm">{mode === 'days' ? `${days.length} ${days.length === 1 ? 'day' : 'days'} · ${label(group)}` : label(group)}</p><ul className="mt-2 space-y-1 text-sm">{periods.map(period => <li key={period.startsAt}>{date(instant(period.startsAt))} — {date(instant(period.endsAt))}</li>)}</ul><div className="mt-3 flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Confirm schedule'}</Button><Button variant="secondary" disabled={busy} onClick={() => setReview(false)}>Change details</Button></div></div> : <div className="mt-4"><Button type="submit" disabled={busy || changed}>Review schedule</Button></div>}
        <button type="button" className="mt-3 min-h-11 px-2 text-sm underline" disabled={busy} onClick={() => { setOpened(false); setReview(false); setError('') }}>Close form</button>
      </form> : null}
      {loadingTerms ? <p role="status" className="mt-3 text-sm">Loading semesters…</p> : null}
      {!loadingTerms && !terms.length && !error ? <p className="mt-3 text-sm">No semester is available. Add an academic term before setting a schedule.</p> : null}
    </div>
  </section>
}
