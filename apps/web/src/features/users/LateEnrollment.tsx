import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, SectionCard } from '../../components/ui'
import { SelectedFilePreview } from '../../components/SelectedFilePreview'
import { UnsavedGuard } from '../../components/UnsavedChanges'
import { enrollmentApi, type LateReview, type LateResult, type Semester } from './enrollment-api'
import { RosterPreviewTable } from './RosterPreviewTable'

const field = 'mt-1 block min-h-11 w-full rounded-xl border border-current/30 bg-white p-2 text-[#003399] dark:bg-[#003399] dark:text-white'
const emptyStudent = { schoolId: '', firstName: '', lastName: '', program: '', yearLevel: '', email: '' }

export function LateEnrollment({ term, onSaved, onClose }: { term: Semester; onSaved: () => void; onClose: () => void }) {
  const [mode, setMode] = useState('one')
  const [student, setStudent] = useState(emptyStudent)
  const [sourceDate, setSourceDate] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [review, setReview] = useState<LateReview | null>(null)
  const [result, setResult] = useState<LateResult | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const feedback = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  useEffect(() => { if (error || review || result) feedback.current?.focus() }, [error, review, result])
  function changed() { setReview(null); setConfirmed(false); setError('') }
  function payload(save: boolean) {
    if (mode === 'one') return { ...student, sourceDate, ...(save ? { reviewToken: review?.reviewToken, confirmed } : {}) }
    const body = new FormData()
    if (file) body.set('roster', file)
    body.set('sourceDate', sourceDate)
    if (save) { body.set('reviewToken', review?.reviewToken ?? ''); body.set('confirmed', String(confirmed)) }
    return body
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      if (!review) setReview(await enrollmentApi.lateReview(term.semester_id, payload(false)))
      else if (confirmed && review.errorCount === 0 && review.added > 0) {
        setResult(await enrollmentApi.lateSave(term.semester_id, payload(true)))
        setReview(null); setFile(null)
        if (picker.current) picker.current.value = ''
        onSaved()
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The addition could not be saved.')
      setReview(null); setConfirmed(false)
    } finally { setBusy(false) }
  }
  return <SectionCard className="p-5">
    <UnsavedGuard resetKey={result} dirty={Boolean(file) && !result}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Add late students</h2>
          <Button variant="secondary" disabled={busy} onClick={onClose}>Close additions</Button>
        </div>
        <p>{term.academic_year} · {term.term_name} · Ends {term.end_date} (Philippine time)</p>
        {result ? <>
          <div ref={feedback} tabIndex={-1} role="status" data-tone="success">
            <p>{result.added} students added. {result.alreadyListed} already on this semester roster.</p>
            {result.missingEmail > 0 && <p>School email needed for account setup · {result.missingEmailStudentIds.join(', ')}</p>}
          </div>
          <Button onClick={() => { setResult(null); setStudent(emptyStudent); setSourceDate(''); setConfirmed(false) }}>Add another student</Button>
        </> : <>
          <fieldset disabled={busy} className="space-y-4">
            <legend className="sr-only">Late student details</legend>
            <label className="block">Entry method<select className={field} value={mode} onChange={e => { setMode(e.target.value); changed() }}>
              <option value="one">Enter one student</option><option value="file">Upload a list</option>
            </select></label>
            <label className="block">Registrar confirmation date<input required className={field} type="date" value={sourceDate} onChange={e => { setSourceDate(e.target.value); changed() }}/></label>
            {mode === 'one' ? <div className="grid gap-4 sm:grid-cols-2">
              {([
                ['schoolId', 'Student ID', 50], ['firstName', 'First name', 100], ['lastName', 'Last name', 100],
                ['program', 'Program or strand', 150], ['yearLevel', 'Year or grade level', 50], ['email', 'Ormoc school email (optional)', 191],
              ] as const).map(([key, label, maxLength]) => <label key={key}>{label}<input required={key !== 'email'} type={key === 'email' ? 'email' : 'text'} maxLength={maxLength}
                className={field} value={student[key]} onChange={e => { setStudent({ ...student, [key]: e.target.value }); changed() }}/></label>)}
            </div> : <>
              <label className="block">Late student list<input ref={picker} type="file" required accept=".csv,.xlsx" className={field} onChange={e => { setFile(e.target.files?.[0] ?? null); changed() }}/></label>
              <SelectedFilePreview file={file} disabled={busy} display="icon" onRemove={() => { setFile(null); if (picker.current) picker.current.value = ''; changed() }}/>
            </>}
          </fieldset>
          <div ref={feedback} tabIndex={-1}>
            {error && <p role="alert">{error}</p>}
            {review && <>
              <p>{review.added} students to add. {review.alreadyListed} already on this semester roster.</p>
              <RosterPreviewTable preview={review}/>
              <p>First-time students use Activate account and verify their school email. Returning students sign in with their existing account.</p>
              {review.added > 0 && review.errorCount === 0 && <label className="mt-3 flex items-start gap-2">
                <input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)}/>
                I confirm the registrar has enrolled these students in this semester.
              </label>}
            </>}
          </div>
          {review ? <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={changed}>Edit additions</Button>
            <Button type="submit" disabled={busy || !confirmed || review.errorCount > 0 || !review.added}>{busy ? 'Saving…' : 'Add to semester roster'}</Button>
          </div> : <Button type="submit" disabled={busy || (mode === 'file' && !file)}>{busy ? 'Reviewing…' : 'Review additions'}</Button>}
        </>}
      </form>
    </UnsavedGuard>
  </SectionCard>
}
