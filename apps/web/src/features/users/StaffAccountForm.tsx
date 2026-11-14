import { useState, type FormEvent } from 'react'
import { Button, SectionCard } from '../../components/ui'
import { usersApi } from './users-api'
import { confirmLeave, UnsavedGuard } from '../../components/UnsavedChanges'

const initial = { first_name: '', last_name: '', school_id: '', school_email: '' }
const fields = [
  { key: 'first_name', label: 'First name', type: 'text', maxLength: 100 },
  { key: 'last_name', label: 'Last name', type: 'text', maxLength: 100 },
  { key: 'school_id', label: 'School ID', type: 'text', maxLength: 50 },
  { key: 'school_email', label: 'STI Ormoc school email', type: 'email', maxLength: 191 },
] as const

export function StaffAccountForm({ onClose, onCreated }: { onClose: () => void; onCreated: (schoolId: string) => void }) {
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const created = await usersApi.createStaff(form)
      onCreated(created.schoolId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the Staff account.')
    } finally { setBusy(false) }
  }

  return <SectionCard className="mb-5 p-5">
    <UnsavedGuard className="contents" cleanOnSubmit><form onSubmit={submit} className="space-y-4" aria-labelledby="staff-setup-heading">
      <h2 id="staff-setup-heading" className="text-lg font-bold">Set up Staff account</h2>
      <p className="text-sm">Use the staff member’s official School ID and STI Ormoc school email. They’ll verify their email and choose their own password from the personnel login page.</p>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        {fields.map(({ key, label, type, maxLength }) => <div key={key}><label className="text-sm font-semibold">
          {label}
          <input type={type} value={form[key]} maxLength={maxLength} required
            aria-describedby={key === 'school_email' ? 'staff-school-email-help' : undefined}
            className="mt-1 block min-h-11 w-full rounded-xl border border-current/25 bg-transparent px-3"
            onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} />
        </label>{key === 'school_email' && <p id="staff-school-email-help" className="mt-1 text-xs opacity-75">Use your @ormoc.sti.edu.ph email address.</p>}</div>)}
      </fieldset>
      {error && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create Staff account'}</Button>
        <Button variant="secondary" onClick={() => confirmLeave(onClose)} disabled={busy}>Cancel</Button>
      </div>
    </form></UnsavedGuard>
  </SectionCard>
}
