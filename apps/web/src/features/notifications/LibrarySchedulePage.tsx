import { useState } from 'react'
import { Button, PageHeader, SectionCard } from '../../components/ui'
import { useLiveQuery } from '../../hooks/useLiveQuery'
import { notificationApi } from './notification-api'
import type { ManagedLibrarySchedule } from './types'
import { UnsavedGuard } from '../../components/UnsavedChanges'

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const field = 'mt-1 min-h-11 w-full rounded-xl border bg-transparent px-3 py-2 text-sm'
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)
const date = (value: string) => new Date(`${value}T12:00:00+08:00`).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'long' })
function ScheduleDetails({ data }: { data: ManagedLibrarySchedule }) {
  return <div className="grid gap-4 lg:grid-cols-2">
    <SectionCard className="p-4"><h2 className="text-lg font-bold">Weekly hours</h2><ul className="mt-3 divide-y divide-current/10">{data.weekly.map(day => <li key={day.dayOfWeek} className="flex flex-wrap justify-between gap-2 py-3"><strong>{weekdays[day.dayOfWeek - 1]}</strong><span>{day.isOpen ? `${day.opensAt} – ${day.closesAt}` : 'Closed'}</span></li>)}</ul></SectionCard>
    <SectionCard className="p-4"><h2 className="text-lg font-bold">Upcoming closures</h2><p className="mt-1 text-sm opacity-70">These dates override the weekly hours.</p>{data.upcomingClosures.length ? <ul className="mt-3 divide-y divide-current/10">{data.upcomingClosures.map(closure => <li key={closure.date} className="py-3"><strong>{date(closure.date)}</strong><p className="mt-1 break-words text-sm">{closure.reason}</p></li>)}</ul> : <p className="mt-4 text-sm">No upcoming closures are scheduled.</p>}</SectionCard>
  </div>
}

export function LibrarySchedulePage({ manage = false, embedded = false }: { manage?: boolean; embedded?: boolean }) {
  const query = useLiveQuery('library-schedule', signal => notificationApi.librarySchedule(signal))
  const [draft, setDraft] = useState<ManagedLibrarySchedule | null>(null)
  const [review, setReview] = useState(false), [busy, setBusy] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [closureDate, setClosureDate] = useState(''), [closureReason, setClosureReason] = useState('')
  function addClosure() {
    if (!draft) return
    if (!closureDate || closureDate < today() || !closureReason.trim()) { setError('Choose a date today or later and enter a closure reason.'); return }
    if (draft.upcomingClosures.some(closure => closure.date === closureDate)) { setError('That date already has a closure. Edit its reason below.'); return }
    setDraft({ ...draft, upcomingClosures: [...draft.upcomingClosures, { date: closureDate, reason: closureReason.trim() }].sort((a, b) => a.date.localeCompare(b.date)) })
    setClosureDate(''); setClosureReason(''); setError('')
  }
  function reviewChanges() {
    if (!draft) return
    if (closureDate || closureReason.trim()) { setError('Add the closure to the list or clear its fields before reviewing.'); return }
    if (!draft.weekly.some(day => day.isOpen)) { setError('Keep at least one operating day. Use dated closures for temporary breaks.'); return }
    if (draft.weekly.some(day => day.isOpen && (!day.opensAt || !day.closesAt || day.closesAt <= day.opensAt))) { setError('Each open day needs a closing time after its opening time.'); return }
    if (draft.upcomingClosures.some(closure => !closure.reason.trim() || closure.reason.trim().length > 191 || closure.date < today())) { setError('Every closure needs a current or future date and a reason of 1 to 191 characters.'); return }
    setError(''); setReview(true)
  }
  async function save() {
    if (!draft || busy || !review) return
    setBusy(true); setError(''); setNotice('')
    try {
      await notificationApi.saveLibrarySchedule(draft)
      setDraft(null); setReview(false); setNotice('Library schedule saved. All roles will see the updated hours and closures.')
      await query.refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The schedule could not be saved.'); setReview(false) }
    finally { setBusy(false) }
  }
  return <div className="space-y-4">
    {embedded ? <h2 className="text-xl font-bold">Library schedule maintenance</h2> : <PageHeader eyebrow="Library information" title="Library schedule" description="Weekly hours and dated closures. All times use Asia/Manila." />}
    <p className="text-sm opacity-75">Hours use Manila time. This schedule is used for library access, due-date calculations and overdue calculations.</p>
    <div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={busy} onClick={() => void query.refresh()}>Refresh schedule</Button>{manage && !draft && query.data ? <Button onClick={() => { setDraft(structuredClone(query.data!)); setReview(false); setError(''); setNotice('') }}>Edit schedule</Button> : null}</div>
    {error || query.error ? <p role="alert" className="auth-error rounded-xl p-3">{error || query.error?.message}</p> : null}
    {notice ? <p role="status" data-tone="success" className="rounded-xl border border-green-600/30 p-3">{notice}</p> : null}
    {!query.data && query.loading ? <p role="status">Loading library schedule…</p> : null}
    {query.data && !draft ? <ScheduleDetails data={query.data} /> : null}
    {draft ? <UnsavedGuard dirty={JSON.stringify(draft) !== JSON.stringify(query.data)} onSave={async () => { reviewChanges(); return false }}><section className="space-y-4 rounded-xl border p-4">
      {review ? <><h2 className="text-lg font-bold">Review library schedule</h2><ScheduleDetails data={draft} /><p className="text-sm">Confirm the full weekly schedule and closure list. Removed future closures will no longer close the library.</p><div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Confirm schedule changes'}</Button><Button variant="secondary" disabled={busy} onClick={() => setReview(false)}>Change details</Button></div></> : <>
        <fieldset disabled={busy} className="space-y-3"><legend className="font-bold">Weekly opening hours</legend>{draft.weekly.map((day, index) => <div key={day.dayOfWeek} className="grid items-end gap-3 rounded-xl border p-3 sm:grid-cols-3">
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={day.isOpen} onChange={event => setDraft({ ...draft, weekly: draft.weekly.map((value, position) => position === index ? { ...value, isOpen: event.target.checked, opensAt: value.opensAt ?? '07:00', closesAt: value.closesAt ?? '17:00' } : value) })} />{weekdays[day.dayOfWeek - 1]} open</label>
          <label className="text-sm">{weekdays[day.dayOfWeek - 1]} opens<input className={field} type="time" disabled={!day.isOpen} value={day.opensAt ?? ''} onChange={event => setDraft({ ...draft, weekly: draft.weekly.map((value, position) => position === index ? { ...value, opensAt: event.target.value } : value) })} /></label>
          <label className="text-sm">{weekdays[day.dayOfWeek - 1]} closes<input className={field} type="time" disabled={!day.isOpen} value={day.closesAt ?? ''} onChange={event => setDraft({ ...draft, weekly: draft.weekly.map((value, position) => position === index ? { ...value, closesAt: event.target.value } : value) })} /></label>
        </div>)}</fieldset>
        <fieldset disabled={busy} className="space-y-3"><legend className="font-bold">Dated closures</legend>{draft.upcomingClosures.map(closure => <div key={closure.date} className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-sm">Reason for {date(closure.date)}<input className={field} value={closure.reason} maxLength={191} onChange={event => setDraft({ ...draft, upcomingClosures: draft.upcomingClosures.map(value => value.date === closure.date ? { ...value, reason: event.target.value } : value) })} /></label><Button variant="secondary" onClick={() => setDraft({ ...draft, upcomingClosures: draft.upcomingClosures.filter(value => value.date !== closure.date) })}>Remove {closure.date}</Button></div>)}
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_2fr_auto]"><label className="text-sm">Closure date<input type="date" min={today()} className={field} value={closureDate} onChange={event => setClosureDate(event.target.value)} /></label><label className="text-sm">Closure reason<input className={field} maxLength={191} value={closureReason} onChange={event => setClosureReason(event.target.value)} /></label><Button variant="secondary" onClick={addClosure}>Add closure</Button></div>
        </fieldset><Button onClick={reviewChanges}>Review schedule changes</Button>
      </>}
      <Button variant="secondary" disabled={busy} onClick={() => { setDraft(null); setReview(false); setClosureDate(''); setClosureReason(''); setError('') }}>Cancel changes</Button>
    </section></UnsavedGuard> : null}
  </div>
}
