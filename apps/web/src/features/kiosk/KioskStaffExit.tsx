import { useState } from 'react'
import { Button, SectionCard } from '../../components/ui'
import { STRINGS, type Lang } from './i18n'
import { verifyDeskStaff } from './kiosk-session'

/** Hidden staff-only panel: a librarian's credentials are required to end the kiosk session. */
export function KioskStaffExit({ lang, onCancel, onVerified }: { lang: Lang; onCancel: () => void; onVerified: () => void }) {
  const t = STRINGS[lang]
  const [schoolId, setSchoolId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const ok = await verifyDeskStaff(schoolId.trim(), password)
    setBusy(false)
    if (ok) onVerified()
    else { setPassword(''); setError(t.staffInvalid) }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="kiosk-staff-title" className="kiosk-overlay">
      <SectionCard>
        <h2 id="kiosk-staff-title">{t.staffTitle}</h2>
        <p className="my-3">{t.staffHint}</p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="block font-bold">{t.schoolId}
            <input value={schoolId} onChange={e => setSchoolId(e.target.value)} autoComplete="off" autoFocus
              className="mt-1 w-full rounded-xl border border-[#003399]/30 bg-white p-3 text-[#003399]" />
          </label>
          <label className="block font-bold">{t.password}
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off"
              className="mt-1 w-full rounded-xl border border-[#003399]/30 bg-white p-3 text-[#003399]" />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onCancel}>{t.cancel}</Button>
            <Button type="submit" disabled={busy || !schoolId.trim() || !password}>{t.endSession}</Button>
          </div>
        </form>
      </SectionCard>
    </div>
  )
}
