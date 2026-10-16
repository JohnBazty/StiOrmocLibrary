import { useEffect, useState } from 'react'
import { clearanceApi } from './clearance-api'
import type { ClearanceSchedule } from './types'

export function ClearanceScheduleEditor() {
  const [terms, setTerms] = useState<Awaited<ReturnType<typeof clearanceApi.terms>>>([])
  const [schedule, setSchedule] = useState<ClearanceSchedule | null>(null)
  const [termId, setTermId] = useState('')
  const [deadline, setDeadline] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => { let active = true; clearanceApi.terms().then(value => { if (active) { setTerms(value); const selected = value.find(term => Number(term.is_active) === 1); if (selected) setTermId(String(selected.id)) } }).catch(() => { if (active) setError('Semesters could not be loaded. Refresh to try again.') }); return () => { active = false } }, [])
  useEffect(() => {
    setSchedule(null); setNotice(''); setDeadline('')
    if (!termId) return
    let active = true
    clearanceApi.schedule(Number(termId), true).then(value => { if (active) { setSchedule(value); setError(''); setDeadline(value.deadlineAt ? new Date(new Date(value.deadlineAt).getTime() + 8 * 3600_000).toISOString().slice(0,16) : '') } }).catch(() => { if (active) setError('The semester schedule could not be loaded.') })
    return () => { active = false }
  }, [termId])
  async function save(remove = false) {
    if (!schedule || busy || (!deadline && !remove)) return
    setBusy(true); setError(''); setNotice('')
    try { const result = await clearanceApi.saveSchedule({termId:Number(termId),version:Number(schedule.version),deadlineAt:remove ? null : new Date(`${deadline}:00+08:00`).toISOString()}); setSchedule(result); if (remove) setDeadline(''); setNotice(remove ? 'Clearance schedule removed. Requirements remain visible.' : 'Clearance deadline saved for all Students in this semester.') } catch (error) { setError(error instanceof Error ? error.message : 'The schedule could not be saved.'); if ((error as {code?:string})?.code === 'SCHEDULE_CHANGED') { try { const latest=await clearanceApi.schedule(Number(termId),true); setSchedule(latest); setDeadline(latest.deadlineAt ? new Date(new Date(latest.deadlineAt).getTime()+8*3600_000).toISOString().slice(0,16) : ''); setError('The schedule changed. The latest deadline is now shown. Review it before saving again.') } catch {} } } finally { setBusy(false) }
  }
  return <section aria-label="Semester clearance schedule" className="mb-5 rounded-2xl border p-5"><h2 className="text-lg font-bold">Clearance deadline</h2><p className="mt-1 text-sm opacity-70">One deadline for all Students per semester. Times use Philippine time. Changing this schedule does not change borrowing restrictions.</p><fieldset disabled={busy} className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Semester<select className="mt-2 min-h-11 w-full rounded-xl border bg-transparent p-2" value={termId} onChange={event => setTermId(event.target.value)}><option value="">Choose semester</option>{terms.map(term => <option key={term.id} value={term.id}>{term.academic_year} — {term.term_name}</option>)}</select></label><label className="text-sm font-semibold">Deadline (Philippine time)<input type="datetime-local" className="mt-2 min-h-11 w-full rounded-xl border bg-transparent p-2" value={deadline} onChange={event => setDeadline(event.target.value)} /></label><div className="flex flex-wrap gap-3 sm:col-span-2"><button type="button" disabled={!schedule || !deadline} onClick={() => void save()} className="min-h-11 rounded-xl bg-[#003399] px-4 font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save deadline'}</button>{schedule?.deadlineAt ? <button type="button" onClick={() => void save(true)} className="min-h-11 rounded-xl border px-4">Remove schedule</button> : null}</div></fieldset>{error ? <p role="alert" className="auth-error mt-3 rounded-xl p-3">{error}</p> : null}{notice ? <p role="status" data-tone="success" className="mt-3 rounded-xl bg-green-50 p-3 text-green-900">{notice}</p> : null}{!terms.length && !error ? <p className="mt-3 text-sm">No semester is available. Add an academic term before setting its clearance date.</p> : null}</section>
}
